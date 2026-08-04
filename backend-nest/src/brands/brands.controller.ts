import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  NotFoundException,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Put,
  Req,
  UseGuards,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import {
  ChecklistItem,
  G7_DECISIONS,
  GATES,
  checklistComplete,
  computeHealthScore,
  defaultChecklist,
  isManager,
  isPositiveGateDecision,
  parseChecklist,
  previousGateCode,
  shouldMarkOverdue,
} from '../common/domain';
import { ActionItem } from '../entities/action-item.entity';
import { Brand } from '../entities/brand.entity';
import { GateReview } from '../entities/gate-review.entity';
import { HealthScore } from '../entities/health-score.entity';
import { User } from '../entities/user.entity';
import { CatalogService } from '../catalog/catalog.service';

/**
 * Expose les routes de pilotage des marques, gates, actions et scores santé.
 * Toutes les opérations s'appuient sur TypeORM et respectent la visibilité liée au rôle utilisateur.
 */
@Controller('api')
@UseGuards(JwtAuthGuard)
export class BrandsController {
  /**
   * Injecte les dépôts de données et le service catalogue utilisés par la Control Tower.
   */
  constructor(
    @InjectRepository(Brand) private readonly brands: Repository<Brand>,
    @InjectRepository(GateReview) private readonly gates: Repository<GateReview>,
    @InjectRepository(ActionItem) private readonly actions: Repository<ActionItem>,
    @InjectRepository(HealthScore) private readonly scores: Repository<HealthScore>,
    private readonly config: ConfigService,
    private readonly catalog: CatalogService,
  ) {}

  private requireManager(user: User) {
    if (!isManager(user.role)) {
      throw new ForbiddenException('Réservé à Direction / Responsable Développement');
    }
  }

  /**
   * Passe en `overdue` les actions dont l'échéance est dépassée (hors done/cancelled).
   * Appelé à la lecture Control Tower / listes d'actions pour refléter la réalité des SLA.
   */
  private async syncOverdueStatuses(actions: ActionItem[]): Promise<ActionItem[]> {
    for (const action of actions) {
      if (shouldMarkOverdue(action.status, action.due_date) && action.status !== 'overdue') {
        action.status = 'overdue';
        await this.actions.save(action);
      }
    }
    return actions;
  }

  private async visibleBrands(user: User) {
    // Tous les rôles voient les marques pilotage (y compris imports API)
    void user;
    return this.brands.find({ order: { code: 'ASC' } });
  }

  private gateOut(review: GateReview) {
    const checklist = parseChecklist(review.checklist_json, review.gate);
    const done = checklist.filter((i) => i.done).length;
    return {
      id: review.id,
      brand_id: review.brand_id,
      gate: review.gate,
      decision: review.decision,
      decided_at: review.decided_at,
      decided_by: review.decided_by,
      comment: review.comment,
      source: review.source || 'manual',
      checklist,
      checklist_done: done,
      checklist_total: checklist.length,
      checklist_complete: checklistComplete(checklist),
    };
  }

  /**
   * Pour une décision positive sur la gate N, exige une validation positive du gate N-1.
   * Les décisions négatives (HOLD, NO_GO, etc.) ne sont pas soumises à cette séquence.
   */
  private async assertPreviousGateValidated(brandId: number, gate: string) {
    const prev = previousGateCode(gate);
    if (!prev) return;
    const prevReview = await this.gates.findOne({ where: { brand_id: brandId, gate: prev } });
    if (!prevReview || !isPositiveGateDecision(prevReview.decision)) {
      throw new BadRequestException(
        `Le gate précédent (${prev}) doit être validé avant de décider ${gate}`,
      );
    }
  }

  private actionOut(a: ActionItem, brand_code?: string | null) {
    return {
      id: a.id,
      brand_id: a.brand_id,
      code: a.code,
      title: a.title,
      owner_role: a.owner_role,
      approver_role: a.approver_role,
      sla_days: a.sla_days,
      status: a.status,
      due_date: a.due_date,
      deliverable: a.deliverable,
      close_condition: a.close_condition,
      brand_code: brand_code ?? null,
    };
  }

  private async ensureGates(brand: Brand) {
    const existing = await this.gates.find({ where: { brand_id: brand.id } });
    const have = new Set(existing.map((g) => g.gate));
    for (const gate of GATES) {
      if (!have.has(gate)) {
        await this.gates.save({
          brand_id: brand.id,
          gate,
          decision: 'PENDING',
          checklist_json: JSON.stringify(defaultChecklist(gate)),
          source: 'manual',
        });
      }
    }
    for (const g of existing) {
      let dirty = false;
      if (!g.checklist_json) {
        g.checklist_json = JSON.stringify(defaultChecklist(g.gate));
        dirty = true;
      }
      if (!g.source) {
        g.source = 'manual';
        dirty = true;
      }
      if (dirty) await this.gates.save(g);
    }
  }

  /**
   * Agrège les indicateurs principaux de la Control Tower pour l'utilisateur connecté.
   * Inclut les volumes de marques, les actions ouvertes, les marques critiques et les alertes stock API.
   */
  @Get('control-tower')
  async controlTower(@Req() req: { user: User }) {
    const user = req.user;
    const brands = await this.visibleBrands(user);
    let actions = await this.actions.find();
    actions = await this.syncOverdueStatuses(actions);
    if (!isManager(user.role)) {
      actions = actions.filter((a) => a.owner_role === user.role);
    }
    const brandIds = new Set(brands.map((b) => b.id));
    const scores = await this.scores.find();
    const allBrands = await this.brands.find();
    const map = Object.fromEntries(allBrands.map((b) => [b.id, b.code]));
    const critical = [
      ...new Set(
        scores
          .filter((s) => ['rouge', 'critique'].includes(s.status) && (isManager(user.role) || brandIds.has(s.brand_id)))
          .map((s) => map[s.brand_id] || '?'),
      ),
    ].sort();

    let stock_alerts: Awaited<ReturnType<CatalogService['stockAlerts']>> = [];
    try {
      stock_alerts = await this.catalog.stockAlerts();
    } catch {
      stock_alerts = [];
    }

    return {
      brands_count: brands.length,
      in_development: brands.filter((b) => b.phase === 'development').length,
      in_launch: brands.filter((b) => b.phase === 'launch').length,
      actions_open: actions.filter((a) => ['open', 'in_progress', 'overdue'].includes(a.status)).length,
      actions_overdue: actions.filter((a) => a.status === 'overdue').length,
      critical_brands: critical,
      stock_alerts: stock_alerts.slice(0, 15),
      stock_alerts_count: stock_alerts.length,
      data_source: this.config.get('DATA_SOURCE') || 'api',
      role_view: user.role,
    };
  }

  /**
   * Liste les marques visibles dans le périmètre de l'utilisateur courant.
   * Les résultats sont ordonnés par code marque.
   */
  @Get('brands')
  listBrands(@Req() req: { user: User }) {
    return this.visibleBrands(req.user);
  }

  /**
   * Crée une nouvelle marque de pilotage et initialise ses gates.
   * L'opération est réservée aux rôles de management.
   */
  @Post('brands')
  async createBrand(
    @Req() req: { user: User },
    @Body() body: { code: string; name: string; supplier?: string; notes?: string },
  ) {
    this.requireManager(req.user);
    const code = body.code.toUpperCase();
    if (await this.brands.findOne({ where: { code } })) {
      throw new BadRequestException('Code marque déjà utilisé');
    }
    const brand = await this.brands.save({
      code,
      name: body.name,
      supplier: body.supplier ?? null,
      notes: body.notes ?? null,
      owner_id: req.user.id,
      phase: 'development',
      current_gate: 'G0',
    });
    for (const gate of GATES) {
      await this.gates.save({
        brand_id: brand.id,
        gate,
        decision: 'PENDING',
        checklist_json: JSON.stringify(defaultChecklist(gate)),
        source: 'manual',
      });
    }
    return brand;
  }

  /**
   * Retourne les revues de gate d'une marque avec leurs checklists calculées.
   * Initialise les gates manquantes avant de produire la réponse.
   */
  @Get('brands/:id/gates')
  async listGates(@Param('id', ParseIntPipe) id: number) {
    const brand = await this.brands.findOne({ where: { id } });
    if (!brand) throw new NotFoundException('Marque introuvable');
    await this.ensureGates(brand);
    const rows = await this.gates.find({ where: { brand_id: id }, order: { gate: 'ASC' } });
    return rows.map((r) => this.gateOut(r));
  }

  /**
   * Met à jour la checklist d'une gate pour une marque donnée.
   * Réserve la modification aux managers et renvoie la gate normalisée.
   */
  @Put('brands/:id/gates/:gate/checklist')
  async updateChecklist(
    @Req() req: { user: User },
    @Param('id', ParseIntPipe) id: number,
    @Param('gate') gate: string,
    @Body() body: { items: ChecklistItem[] },
  ) {
    this.requireManager(req.user);
    const review = await this.gates.findOne({ where: { brand_id: id, gate: gate.toUpperCase() } });
    if (!review) throw new NotFoundException('Gate introuvable');
    review.checklist_json = JSON.stringify(body.items);
    await this.gates.save(review);
    return this.gateOut(review);
  }

  /**
   * Enregistre la décision d'une gate et met à jour l'état de lancement de la marque.
   * Bloque les décisions positives si la checklist est incomplète ou si le gate N-1 n'est pas validé.
   */
  @Post('brands/:id/gates/:gate')
  async decideGate(
    @Req() req: { user: User },
    @Param('id', ParseIntPipe) id: number,
    @Param('gate') gateParam: string,
    @Body() body: { decision: string; comment?: string },
  ) {
    this.requireManager(req.user);
    const brand = await this.brands.findOne({ where: { id } });
    if (!brand) throw new NotFoundException('Marque introuvable');
    const gate = gateParam.toUpperCase();
    const decision = (body.decision || '').toUpperCase().replace(/-/g, '_');
    if (gate === 'G7' && !G7_DECISIONS.has(decision) && decision !== 'PENDING') {
      throw new BadRequestException(
        `Décision G7 invalide. Autorisées: ${[...G7_DECISIONS].join(', ')}`,
      );
    }
    let review = await this.gates.findOne({ where: { brand_id: id, gate } });
    if (!review) {
      review = await this.gates.save({
        brand_id: id,
        gate,
        decision: 'PENDING',
        checklist_json: JSON.stringify(defaultChecklist(gate)),
        source: 'manual',
      });
    }
    const items = parseChecklist(review.checklist_json, gate);
    if (isPositiveGateDecision(decision)) {
      if (!checklistComplete(items)) {
        throw new BadRequestException('Checklist Gate incomplète — livrables minimum non validés');
      }
      await this.assertPreviousGateValidated(id, gate);
    }
    review.decision = decision;
    review.comment = body.comment ?? null;
    review.decided_at = new Date();
    review.decided_by = req.user.full_name;
    review.source = 'manual';
    brand.current_gate = gate;
    if (decision === 'GO' && gate === 'G6') {
      brand.phase = 'launch';
      if (!brand.launch_date) brand.launch_date = new Date().toISOString().slice(0, 10);
    }
    if (gate === 'G7') {
      if (decision === 'MATURITY') brand.phase = 'mature';
      else if (decision === 'EXIT') brand.phase = 'exited';
      // ACCELERATE / CORRECT / REPOSITION / EXTEND / HOLD : phase inchangée
    }
    await this.gates.save(review);
    await this.brands.save(brand);
    return this.gateOut(review);
  }

  /**
   * Retourne un instantané catalogue API pour la marque demandée.
   * L'instantané relie la marque de pilotage aux articles FGT disponibles.
   */
  @Get('brands/:id/api-snapshot')
  async apiSnapshot(@Param('id', ParseIntPipe) id: number) {
    const brand = await this.brands.findOne({ where: { id } });
    if (!brand) throw new NotFoundException('Marque introuvable');
    return this.catalog.brandSnapshotForBrand(brand);
  }

  /**
   * Calcule un score santé depuis les données de l'API FGT.
   * Crée aussi une action supply automatique lorsqu'une rupture critique est détectée.
   */
  @Post('brands/:id/health/from-api')
  async healthFromApi(
    @Req() req: { user: User },
    @Param('id', ParseIntPipe) id: number,
    @Body() body?: { period?: string },
  ) {
    this.requireManager(req.user);
    const brand = await this.brands.findOne({ where: { id } });
    if (!brand) throw new NotFoundException('Marque introuvable');
    const snap = await this.catalog.brandSnapshotForBrand(brand);
    const suggested = { ...snap.suggested_health, period: body?.period || snap.suggested_health.period };
    const { score, status } = computeHealthScore(suggested);
    const row = await this.scores.save({
      brand_id: id,
      period: suggested.period,
      score,
      status,
      ca_vs_forecast: suggested.ca_vs_forecast,
      distribution: suggested.distribution,
      rotation: suggested.rotation,
      clients_actifs: suggested.clients_actifs,
      disponibilite: suggested.disponibilite,
      stock: suggested.stock,
      marge: suggested.marge,
      marketing: suggested.marketing,
      override_critical: suggested.override_critical,
    });

    // Auto-create supply action if rupture critique
    if (suggested.override_critical || snap.zero_stock_skus > 0) {
      const open = await this.actions.findOne({
        where: { brand_id: id, code: 'API-STOCK-001', status: 'open' },
      });
      if (!open) {
        await this.actions.save({
          brand_id: id,
          code: 'API-STOCK-001',
          title: `Sécuriser stock — ${snap.zero_stock_skus} SKU à 0`,
          owner_role: 'supply',
          approver_role: 'developpement',
          sla_days: 3,
          due_date: new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10),
          deliverable: 'Plan réappro / transfert',
          close_condition: 'Zero stock SKU = 0',
          status: 'open',
        });
      }
    }

    return {
      health: row,
      snapshot: snap,
      dimensions: snap.dimensions,
    };
  }

  /**
   * Liste les actions associées à une marque selon le rôle de l'utilisateur.
   * Les non-managers ne voient que les actions relevant de leur rôle.
   */
  @Get('brands/:id/actions')
  async listActions(@Req() req: { user: User }, @Param('id', ParseIntPipe) id: number) {
    const brand = await this.brands.findOne({ where: { id } });
    if (!brand) throw new NotFoundException('Marque introuvable');
    let rows = await this.actions.find({ where: { brand_id: id } });
    rows = await this.syncOverdueStatuses(rows);
    if (!isManager(req.user.role)) rows = rows.filter((a) => a.owner_role === req.user.role);
    return rows.map((a) => this.actionOut(a, brand.code));
  }

  /**
   * Crée une action opérationnelle pour une marque.
   * Applique les règles de périmètre rôle et les valeurs par défaut de SLA.
   */
  @Post('brands/:id/actions')
  async createAction(
    @Req() req: { user: User },
    @Param('id', ParseIntPipe) id: number,
    @Body()
    body: {
      code: string;
      title: string;
      owner_role: string;
      sla_days?: number;
      due_date?: string;
      deliverable?: string;
      close_condition?: string;
      approver_role?: string;
    },
  ) {
    const brand = await this.brands.findOne({ where: { id } });
    if (!brand) throw new NotFoundException('Marque introuvable');
    if (!isManager(req.user.role) && body.owner_role !== req.user.role) {
      throw new ForbiddenException('Vous ne pouvez créer que des actions de votre rôle');
    }
    const sla = body.sla_days ?? 5;
    const due =
      body.due_date ||
      new Date(Date.now() + sla * 86400000).toISOString().slice(0, 10);
    const action = await this.actions.save({
      brand_id: id,
      code: body.code,
      title: body.title,
      owner_role: body.owner_role,
      approver_role: body.approver_role || 'developpement',
      sla_days: sla,
      due_date: due,
      deliverable: body.deliverable ?? null,
      close_condition: body.close_condition ?? null,
      status: 'open',
    });
    return this.actionOut(action, brand.code);
  }

  /**
   * Met à jour une action existante dans le périmètre autorisé.
   * Les managers peuvent aussi réassigner le rôle propriétaire de l'action.
   */
  @Patch('actions/:actionId')
  async updateAction(
    @Req() req: { user: User },
    @Param('actionId', ParseIntPipe) actionId: number,
    @Body()
    body: {
      status?: string;
      due_date?: string;
      title?: string;
      deliverable?: string;
      close_condition?: string;
      owner_role?: string;
    },
  ) {
    const action = await this.actions.findOne({ where: { id: actionId } });
    if (!action) throw new NotFoundException('Action introuvable');
    if (!isManager(req.user.role) && action.owner_role !== req.user.role) {
      throw new ForbiddenException('Action hors de votre périmètre');
    }
    if (body.status !== undefined) action.status = body.status;
    if (body.due_date !== undefined) action.due_date = body.due_date;
    if (body.title !== undefined) action.title = body.title;
    if (body.deliverable !== undefined) action.deliverable = body.deliverable;
    if (body.close_condition !== undefined) action.close_condition = body.close_condition;
    if (body.owner_role !== undefined && isManager(req.user.role)) action.owner_role = body.owner_role;
    await this.actions.save(action);
    const brand = await this.brands.findOne({ where: { id: action.brand_id } });
    return this.actionOut(action, brand?.code);
  }

  /**
   * Liste l'historique des scores santé d'une marque.
   * Les résultats sont triés du calcul le plus récent au plus ancien.
   */
  @Get('brands/:id/health')
  async listHealth(@Param('id', ParseIntPipe) id: number) {
    return this.scores.find({ where: { brand_id: id }, order: { computed_at: 'DESC' } });
  }

  /**
   * Calcule et enregistre manuellement un score santé pour une marque.
   * Utilise les pondérations métier du domaine FGT et réserve l'action aux managers.
   */
  @Post('brands/:id/health')
  async computeHealth(
    @Req() req: { user: User },
    @Param('id', ParseIntPipe) id: number,
    @Body()
    body: {
      period?: string;
      ca_vs_forecast: number;
      distribution: number;
      rotation: number;
      clients_actifs: number;
      disponibilite: number;
      stock: number;
      marge: number;
      marketing: number;
      override_critical?: boolean;
    },
  ) {
    this.requireManager(req.user);
    const brand = await this.brands.findOne({ where: { id } });
    if (!brand) throw new NotFoundException('Marque introuvable');
    const { score, status } = computeHealthScore(body);
    return this.scores.save({
      brand_id: id,
      period: body.period || 'M1',
      score,
      status,
      ca_vs_forecast: body.ca_vs_forecast,
      distribution: body.distribution,
      rotation: body.rotation,
      clients_actifs: body.clients_actifs,
      disponibilite: body.disponibilite,
      stock: body.stock,
      marge: body.marge,
      marketing: body.marketing,
      override_critical: body.override_critical || false,
    });
  }
}
