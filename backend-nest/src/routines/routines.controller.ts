import { Controller, Get, NotFoundException, Param, ParseIntPipe, Req, UseGuards } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { Repository } from 'typeorm';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CatalogService } from '../catalog/catalog.service';
import { isManager, isOperational, parseChecklist, checklistComplete, shouldMarkOverdue, escalationLevelFromDueDate } from '../common/domain';
import { ActionItem } from '../entities/action-item.entity';
import { Brand } from '../entities/brand.entity';
import { GateReview } from '../entities/gate-review.entity';
import { HealthScore } from '../entities/health-score.entity';
import { User } from '../entities/user.entity';

/**
 * Expose les routines opérationnelles de suivi hebdomadaire et mensuel.
 * Agrège marques, actions, gates, scores santé et alertes catalogue selon le rôle utilisateur.
 */
@Controller('api/routines')
@UseGuards(JwtAuthGuard)
export class RoutinesController {
  /**
   * Injecte les dépôts TypeORM, la configuration et le service catalogue nécessaires aux routines.
   */
  constructor(
    @InjectRepository(Brand) private readonly brands: Repository<Brand>,
    @InjectRepository(ActionItem) private readonly actions: Repository<ActionItem>,
    @InjectRepository(GateReview) private readonly gates: Repository<GateReview>,
    @InjectRepository(HealthScore) private readonly scores: Repository<HealthScore>,
    private readonly config: ConfigService,
    private readonly catalog: CatalogService,
  ) {}

  private async visibleBrands(user: User) {
    const all = await this.brands.find({ order: { code: 'ASC' } });
    if (!isOperational(user.role)) return all;
    const myActions = await this.actions.find({ where: { owner_role: user.role } });
    const linked = new Set(myActions.map((a) => a.brand_id));
    return all.filter(
      (b) => ['launch', 'mature', 'exited'].includes(b.phase) || linked.has(b.id),
    );
  }

  /** Recalcule overdue avant agrégation des routines. */
  private async syncOverdue(actions: ActionItem[]) {
    for (const action of actions) {
      let dirty = false;
      if (shouldMarkOverdue(action.status, action.due_date) && action.status !== 'overdue') {
        action.status = 'overdue';
        dirty = true;
      }
      const level = escalationLevelFromDueDate(action.status, action.due_date);
      if (action.escalation_level !== level) {
        action.escalation_level = level;
        dirty = true;
      }
      if (dirty) await this.actions.save(action);
    }
    return actions;
  }

  private async actionPairs(user: User) {
    let actions = await this.actions.find();
    actions = await this.syncOverdue(actions);
    const brands = await this.brands.find();
    const map = Object.fromEntries(brands.map((b) => [b.id, b.code]));
    const rows = actions.map((a) => ({ action: a, code: map[a.brand_id] || '?' }));
    if (isManager(user.role)) return rows;
    return rows.filter((r) => r.action.owner_role === user.role);
  }

  /**
   * Prépare la routine du lundi pour la Control Tower.
   * Retourne les indicateurs clés, les actions en retard, les marques critiques et les alertes stock.
   */
  @Get('monday')
  async monday(@Req() req: { user: User }) {
    const brands = await this.visibleBrands(req.user);
    const pairs = await this.actionPairs(req.user);
    const actions = pairs.map((p) => p.action);
    const scores = await this.scores.find();
    const allBrands = await this.brands.find();
    const map = Object.fromEntries(allBrands.map((b) => [b.id, b.code]));
    const criticalCodes = [
      ...new Set(
        scores
          .filter((s) => ['rouge', 'critique'].includes(s.status))
          .map((s) => map[s.brand_id])
          .filter(Boolean),
      ),
    ] as string[];
    let stock_alerts: Awaited<ReturnType<CatalogService['stockAlerts']>> = [];
    try {
      stock_alerts = await this.catalog.stockAlerts();
    } catch {
      stock_alerts = [];
    }

    const summary = {
      brands_count: brands.length,
      in_development: brands.filter((b) => b.phase === 'development').length,
      in_launch: brands.filter((b) => b.phase === 'launch').length,
      actions_open: actions.filter((a) => ['open', 'in_progress', 'overdue'].includes(a.status))
        .length,
      actions_overdue: actions.filter((a) => a.status === 'overdue').length,
      critical_brands: criticalCodes.sort(),
      stock_alerts: stock_alerts.slice(0, 10),
      stock_alerts_count: stock_alerts.length,
      data_source: this.config.get('DATA_SOURCE') || 'api',
      role_view: req.user.role,
    };
    return {
      summary,
      overdue_actions: pairs
        .filter((p) => p.action.status === 'overdue')
        .map((p) => ({ ...p.action, brand_code: p.code })),
      critical_brands: brands.filter((b) => criticalCodes.includes(b.code)),
      stock_alerts: stock_alerts.slice(0, 10),
      focus:
        'Control Tower 30–45 min — Health Score, alertes stock API, actions en retard',
    };
  }

  /**
   * Prépare la routine du vendredi centrée sur la revue des actions.
   * Liste les actions ouvertes visibles par l'utilisateur et rappelle le focus de clôture.
   */
  @Get('friday')
  async friday(@Req() req: { user: User }) {
    const pairs = await this.actionPairs(req.user);
    return {
      open_actions: pairs
        .filter((p) => ['open', 'in_progress', 'overdue'].includes(p.action.status))
        .map((p) => ({ ...p.action, brand_code: p.code })),
      done_this_week_hint: 'Vérifier owners, deadlines et preuves de clôture',
      focus: 'Action Review 20–30 min — fermer ou replanifier les actions ouvertes',
    };
  }

  /**
   * Produit la revue mensuelle d'une marque donnée.
   * Combine la gate courante, le dernier score santé et les actions ouvertes dans le périmètre utilisateur.
   */
  @Get('brand-review/:id')
  async brandReview(@Req() req: { user: User }, @Param('id', ParseIntPipe) id: number) {
    const brand = await this.brands.findOne({ where: { id } });
    if (!brand) throw new NotFoundException('Marque introuvable');
    const gate = await this.gates.findOne({
      where: { brand_id: id, gate: brand.current_gate },
    });
    const health = await this.scores.findOne({
      where: { brand_id: id },
      order: { computed_at: 'DESC' },
    });
    let actions = await this.actions.find({ where: { brand_id: id } });
    for (const action of actions) {
      if (shouldMarkOverdue(action.status, action.due_date) && action.status !== 'overdue') {
        action.status = 'overdue';
        await this.actions.save(action);
      }
    }
    if (!isManager(req.user.role)) {
      actions = actions.filter((a) => a.owner_role === req.user.role);
    }
    const checklist = gate ? parseChecklist(gate.checklist_json, gate.gate) : [];
    return {
      brand,
      current_gate: gate
        ? {
            ...gate,
            checklist,
            checklist_done: checklist.filter((i) => i.done).length,
            checklist_total: checklist.length,
            checklist_complete: checklistComplete(checklist),
          }
        : null,
      latest_health: health,
      open_actions: actions
        .filter((a) => ['open', 'in_progress', 'overdue'].includes(a.status))
        .map((a) => ({ ...a, brand_code: brand.code })),
      focus: 'Monthly Brand Review — performance, écarts, causes, risques, décisions',
    };
  }
}
