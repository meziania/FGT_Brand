import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcryptjs';
import { Repository } from 'typeorm';
import {
  GATES,
  defaultChecklist,
} from '../common/domain';
import { ActionItem } from '../entities/action-item.entity';
import { Brand } from '../entities/brand.entity';
import { GateReview } from '../entities/gate-review.entity';
import { HealthScore } from '../entities/health-score.entity';
import { User } from '../entities/user.entity';

const DEMO_USERS: Array<{ email: string; full_name: string; role: string }> = [
  { email: 'dev@fgt.local', full_name: 'Responsable Développement', role: 'developpement' },
  { email: 'direction@fgt.local', full_name: 'Direction FGT', role: 'direction' },
  { email: 'commercial@fgt.local', full_name: 'Commercial', role: 'commercial' },
  { email: 'marketing@fgt.local', full_name: 'Marketing', role: 'marketing' },
  { email: 'achats@fgt.local', full_name: 'Achats', role: 'achats' },
  { email: 'supply@fgt.local', full_name: 'Supply Chain', role: 'supply' },
  { email: 'finance@fgt.local', full_name: 'Finance', role: 'finance' },
];

const DEMO_CODES = ['NOVA', 'SOLARA', 'OLIVA'];

function daysAgo(n: number): string {
  return new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);
}

function daysFromNow(n: number): string {
  return new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
}

function checklistAllDone(gate: string) {
  return defaultChecklist(gate).map((i) => ({ ...i, done: true }));
}

/**
 * Fournit les routines de seed exécutées au démarrage.
 * Utilisateurs démo + scénario Stage-Gate / Health / escalades pour la soutenance.
 */
@Injectable()
export class SeedService {
  constructor(
    @InjectRepository(User) private readonly users: Repository<User>,
    @InjectRepository(Brand) private readonly brands: Repository<Brand>,
    @InjectRepository(GateReview) private readonly gates: Repository<GateReview>,
    @InjectRepository(ActionItem) private readonly actions: Repository<ActionItem>,
    @InjectRepository(HealthScore) private readonly scores: Repository<HealthScore>,
  ) {}

  /**
   * Crée les comptes démo manquants (Direction, Dev, métiers du manuel).
   * Mot de passe commun de démonstration : fgt123.
   */
  async seedUsers() {
    const password = await bcrypt.hash('fgt123', 10);
    for (const u of DEMO_USERS) {
      const existing = await this.users.findOne({ where: { email: u.email } });
      if (existing) continue;
      await this.users.save({
        ...u,
        hashed_password: password,
        is_active: true,
      });
    }
  }

  /**
   * Scénario démo idempotent (manuel) :
   * - NOVA : développement, en cours G3 (G0–G2 GO)
   * - SOLARA : launch, Health rouge, actions overdue (escalades)
   * - OLIVA : launch proche G7, Health orange + Maturity
   */
  async seedDemoScenario() {
    const existing = await this.brands
      .createQueryBuilder('b')
      .where('b.code IN (:...codes)', { codes: DEMO_CODES })
      .getMany();
    if (existing.length >= 3) return;

    if (existing.length) {
      const ids = existing.map((b) => b.id);
      await this.actions.createQueryBuilder().delete().where('brand_id IN (:...ids)', { ids }).execute();
      await this.scores.createQueryBuilder().delete().where('brand_id IN (:...ids)', { ids }).execute();
      await this.gates.createQueryBuilder().delete().where('brand_id IN (:...ids)', { ids }).execute();
      await this.brands.createQueryBuilder().delete().where('id IN (:...ids)', { ids }).execute();
    }

    const nova = await this.brands.save({
      code: 'NOVA',
      name: 'Nova Snacks',
      supplier: 'Iberia Foods',
      phase: 'development',
      current_gate: 'G3',
      launch_date: null,
      notes: 'Scénario démo — conformité en cours (G3)',
    });
    await this.seedGates(nova.id, 'G3', ['G0', 'G1', 'G2']);

    const solara = await this.brands.save({
      code: 'SOLARA',
      name: 'Solara Beverages',
      supplier: 'Atlas Drinks',
      phase: 'launch',
      current_gate: 'G6',
      launch_date: daysAgo(45),
      notes: 'Scénario démo — launch en difficulté Health Score',
    });
    await this.seedGates(solara.id, 'G6', ['G0', 'G1', 'G2', 'G3', 'G4', 'G5', 'G6']);
    await this.scores.save({
      brand_id: solara.id,
      period: 'M1',
      score: 58,
      status: 'rouge',
      ca_vs_forecast: 45,
      distribution: 55,
      rotation: 50,
      clients_actifs: 60,
      disponibilite: 70,
      stock: 65,
      marge: 55,
      marketing: 60,
      override_critical: false,
    });
    await this.actions.save([
      {
        brand_id: solara.id,
        code: 'HS-ROUGE-001',
        title: 'Plan correctif Health rouge — SOLARA',
        owner_role: 'commercial',
        approver_role: 'developpement',
        sla_days: 5,
        status: 'overdue',
        due_date: daysAgo(8),
        deliverable: 'Plan Cause→Action validé',
        close_condition: 'Health Score ≥ 70',
        priority: 'high',
        source: 'health',
        root_cause: 'Distribution sous-cible + CA vs forecast faible',
        expected_result: 'DN +5 pts / CA relancé',
        evidence: null,
        escalation_level: 'direction',
      },
      {
        brand_id: solara.id,
        code: 'SUP-STOCK-002',
        title: 'Sécuriser réappro SKU rupture',
        owner_role: 'supply',
        approver_role: 'developpement',
        sla_days: 3,
        status: 'overdue',
        due_date: daysAgo(4),
        deliverable: 'PO confirmé fournisseur',
        close_condition: 'SKU à 0 = 0',
        priority: 'critical',
        source: 'stock_api',
        root_cause: 'Lead time sous-estimé',
        expected_result: 'Disponibilité ≥ 90 %',
        evidence: null,
        escalation_level: 'manager',
      },
      {
        brand_id: solara.id,
        code: 'MKT-TRADE-003',
        title: 'Relancer trade promo M1',
        owner_role: 'marketing',
        approver_role: 'developpement',
        sla_days: 7,
        status: 'open',
        due_date: daysFromNow(2),
        deliverable: 'Kit trade + planning',
        close_condition: 'Activation en magasin',
        priority: 'medium',
        source: 'brand_review',
        root_cause: null,
        expected_result: 'Visibilité rayon',
        evidence: null,
        escalation_level: 'reminder',
      },
    ]);

    const oliva = await this.brands.save({
      code: 'OLIVA',
      name: 'Oliva Gourmet',
      supplier: 'Med Oils',
      phase: 'launch',
      current_gate: 'G7',
      launch_date: daysAgo(300),
      notes: 'Scénario démo — éligible Maturity Review G7',
    });
    await this.seedGates(oliva.id, 'G7', ['G0', 'G1', 'G2', 'G3', 'G4', 'G5', 'G6']);
    // Checklist G7 partielle
    const g7 = await this.gates.findOne({ where: { brand_id: oliva.id, gate: 'G7' } });
    if (g7) {
      const items = defaultChecklist('G7').map((i, idx) => ({ ...i, done: idx < 2 }));
      g7.checklist_json = JSON.stringify(items);
      await this.gates.save(g7);
    }
    await this.scores.save({
      brand_id: oliva.id,
      period: 'M12',
      score: 78,
      status: 'orange',
      ca_vs_forecast: 80,
      distribution: 75,
      rotation: 78,
      clients_actifs: 82,
      disponibilite: 88,
      stock: 80,
      marge: 72,
      marketing: 70,
      override_critical: false,
    });
    // Maturity Score stocké via period MATURITY (mapping dimensions Health)
    await this.scores.save({
      brand_id: oliva.id,
      period: 'MATURITY',
      score: 81,
      status: 'orange',
      ca_vs_forecast: 85, // CA vs BC
      distribution: 80,
      rotation: 78, // réachat
      clients_actifs: 75, // autonomie
      disponibilite: 88, // supply
      stock: 82, // stock sain
      marge: 80, // rentabilité
      marketing: 70, // exécution (pondération différente côté compute)
      override_critical: false,
    });
    await this.actions.save({
      brand_id: oliva.id,
      code: 'HS-ORANGE-001',
      title: 'Plan correctif Health orange — OLIVA',
      owner_role: 'finance',
      approver_role: 'direction',
      sla_days: 10,
      status: 'in_progress',
      due_date: daysFromNow(5),
      deliverable: 'Revue marge M12',
      close_condition: 'Marge ≥ objectif BC',
      priority: 'medium',
      source: 'health',
      root_cause: 'Promo trade impacte marge nette',
      expected_result: 'Marge stabilisée',
      evidence: null,
      escalation_level: 'none',
    });
  }

  private async seedGates(brandId: number, _current: string, goGates: string[]) {
    for (const gate of GATES) {
      const isGo = goGates.includes(gate);
      const items = isGo ? checklistAllDone(gate) : defaultChecklist(gate);
      await this.gates.save({
        brand_id: brandId,
        gate,
        decision: isGo ? 'GO' : 'PENDING',
        checklist_json: JSON.stringify(items),
        decided_at: isGo ? new Date() : null,
        decided_by: isGo ? 'Seed démo' : null,
        comment: isGo ? `GO seed ${gate}` : null,
        source: 'manual',
      });
    }
  }
}
