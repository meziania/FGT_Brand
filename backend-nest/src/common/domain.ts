export type ChecklistItem = { id: string; label: string; done: boolean };

export const GATE_CHECKLISTS: Record<string, ChecklistItem[]> = {
  G0: [
    { id: 'g0_1', label: 'Opportunité documentée', done: false },
    { id: 'g0_2', label: 'Fournisseur préqualifié', done: false },
    { id: 'g0_3', label: 'Intérêt stratégique initial', done: false },
  ],
  G1: [
    { id: 'g1_1', label: 'Marché / canaux analysés', done: false },
    { id: 'g1_2', label: 'Concurrence évaluée', done: false },
    { id: 'g1_3', label: 'Exclusivité / support fournisseur', done: false },
    { id: 'g1_4', label: 'Scoring stratégique validé', done: false },
  ],
  G2: [
    { id: 'g2_1', label: 'Coût complet renseigné', done: false },
    { id: 'g2_2', label: 'PVP / forecast / marge', done: false },
    { id: 'g2_3', label: 'BFR et rentabilité acceptables', done: false },
    { id: 'g2_4', label: 'Business Case approuvé', done: false },
  ],
  G3: [
    { id: 'g3_1', label: 'Dossier réglementaire sécurisé', done: false },
    { id: 'g3_2', label: 'Importation sécurisée', done: false },
  ],
  G4: [
    { id: 'g4_1', label: 'Tests produit validés', done: false },
    { id: 'g4_2', label: 'Assortiment figé', done: false },
    { id: 'g4_3', label: 'Acceptation marché', done: false },
  ],
  G5: [
    { id: 'g5_1', label: 'Conditions commerciales sécurisées', done: false },
    { id: 'g5_2', label: 'Contrat fournisseur validé', done: false },
  ],
  G6: [
    { id: 'g6_1', label: 'Produit / stock prêts', done: false },
    { id: 'g6_2', label: 'Référencement prêt', done: false },
    { id: 'g6_3', label: 'Force de vente formée', done: false },
    { id: 'g6_4', label: 'Marketing / trade prêts', done: false },
    { id: 'g6_5', label: 'Systèmes / ERP prêts', done: false },
  ],
  G7: [
    { id: 'g7_1', label: 'Performance durable démontrée', done: false },
    { id: 'g7_2', label: 'Autonomie opérationnelle', done: false },
    { id: 'g7_3', label: 'Dossier maturité complet', done: false },
  ],
};

export const GATES = ['G0', 'G1', 'G2', 'G3', 'G4', 'G5', 'G6', 'G7'];

/** Décisions positives qui débloquent le passage à la gate suivante. */
export const POSITIVE_GATE_DECISIONS = new Set([
  'GO',
  'CONDITIONAL_GO',
  'MATURITY',
  'ACCELERATE',
]);

/**
 * Indique si une décision de gate est positive (autorise la suite du parcours).
 */
export function isPositiveGateDecision(decision: string): boolean {
  return POSITIVE_GATE_DECISIONS.has(decision.toUpperCase().replace(/-/g, '_'));
}

/**
 * Retourne le code de la gate immédiatement précédente, ou null pour G0.
 */
export function previousGateCode(gate: string): string | null {
  const idx = GATES.indexOf(gate.toUpperCase());
  if (idx <= 0) return null;
  return GATES[idx - 1];
}

/**
 * Retourne une copie de la checklist par défaut pour une gate donnée.
 * La copie évite de modifier les modèles partagés en mémoire.
 */
export function defaultChecklist(gate: string): ChecklistItem[] {
  return (GATE_CHECKLISTS[gate.toUpperCase()] || []).map((i) => ({ ...i }));
}

/**
 * Désérialise une checklist stockée en base ou revient au modèle par défaut.
 * Protège les appels API contre les valeurs absentes ou JSON invalides.
 */
export function parseChecklist(raw: string | null, gate: string): ChecklistItem[] {
  if (!raw) return defaultChecklist(gate);
  try {
    const data = JSON.parse(raw);
    if (Array.isArray(data) && data.length) return data;
  } catch {
    /* ignore */
  }
  return defaultChecklist(gate);
}

/**
 * Vérifie que tous les éléments d'une checklist sont validés.
 * Une checklist vide n'est jamais considérée comme complète.
 */
export function checklistComplete(items: ChecklistItem[]): boolean {
  return items.length > 0 && items.every((i) => i.done);
}

/**
 * Calcule le score santé pondéré d'une marque et son statut métier.
 * Applique un statut critique forcé lorsque l'override de risque est activé.
 */
export function computeHealthScore(dims: {
  ca_vs_forecast: number;
  distribution: number;
  rotation: number;
  clients_actifs: number;
  disponibilite: number;
  stock: number;
  marge: number;
  marketing: number;
  override_critical?: boolean;
}): { score: number; status: string } {
  const weights = {
    ca_vs_forecast: 20,
    distribution: 15,
    rotation: 15,
    clients_actifs: 10,
    disponibilite: 10,
    stock: 10,
    marge: 10,
    marketing: 10,
  };
  const total = Object.values(weights).reduce((a, b) => a + b, 0);
  const score =
    (dims.ca_vs_forecast * weights.ca_vs_forecast +
      dims.distribution * weights.distribution +
      dims.rotation * weights.rotation +
      dims.clients_actifs * weights.clients_actifs +
      dims.disponibilite * weights.disponibilite +
      dims.stock * weights.stock +
      dims.marge * weights.marge +
      dims.marketing * weights.marketing) /
    total;
  if (dims.override_critical) return { score: Math.round(score * 10) / 10, status: 'critique' };
  let status = 'critique';
  if (score >= 85) status = 'vert';
  else if (score >= 70) status = 'orange';
  else if (score >= 50) status = 'rouge';
  return { score: Math.round(score * 10) / 10, status };
}

export const MANAGERS = new Set(['direction', 'developpement']);

/** Métiers opérationnels du manuel (hors Direction / Développement). */
export const OPERATIONAL_ROLES = new Set([
  'commercial',
  'marketing',
  'achats',
  'supply',
  'finance',
]);

/**
 * Indique si un rôle dispose des droits de management (Direction ou Développement).
 */
export const isManager = (role: string) => MANAGERS.has(role);

/** Responsable Développement = Business Owner du projet (cahier). */
export const isDevOwner = (role: string) => role === 'developpement';

/** Direction = vue stratégique / validation comités. */
export const isDirection = (role: string) => role === 'direction';

/** Métiers opérationnels (Commercial, Marketing, etc.). */
export const isOperational = (role: string) => OPERATIONAL_ROLES.has(role);

/** Création marque / checklist = Développement uniquement. */
export const canCreateBrand = (role: string) => isDevOwner(role);
export const canEditChecklist = (role: string) => isDevOwner(role);

/**
 * Décision de Gate : Développement (toutes) ; Direction (G6 Launch + G7 Maturity).
 */
export const canDecideGate = (role: string, gate: string) => {
  if (isDevOwner(role)) return true;
  if (isDirection(role)) return gate === 'G6' || gate === 'G7';
  return false;
};

/** Health Score calcul / override : Direction + Développement. */
export const canComputeHealth = (role: string) => isManager(role);

/** Sync marques API : Développement. */
export const canSyncBrands = (role: string) => isDevOwner(role);

/** Libellé français du niveau de vue (manuel §6). */
export function roleViewLevel(role: string): 'direction' | 'developpement' | 'operationnel' {
  if (isDirection(role)) return 'direction';
  if (isDevOwner(role)) return 'developpement';
  return 'operationnel';
}

/** Décisions autorisées sur G7 (Maturity Review — manuel §10). */
export const G7_DECISIONS = new Set([
  'MATURITY',
  'ACCELERATE',
  'CORRECT',
  'REPOSITION',
  'EXTEND_RANGE',
  'EXTEND', // alias accepté
  'HOLD',
  'EXIT',
]);

/** Décisions par gate (manuel §3) — hors PENDING. */
export const GATE_DECISIONS: Record<string, string[]> = {
  G0: ['GO', 'HOLD', 'NO_GO'],
  G1: ['GO', 'HOLD', 'NO_GO'],
  G2: ['GO', 'HOLD', 'NO_GO'],
  G3: ['GO', 'HOLD', 'NO_GO'],
  G4: ['GO', 'RETEST', 'NO_GO'],
  G5: ['GO', 'RENEGOTIATE', 'NO_GO'],
  G6: ['GO', 'CONDITIONAL_GO', 'HOLD', 'NO_GO'],
  G7: ['MATURITY', 'ACCELERATE', 'CORRECT', 'REPOSITION', 'EXTEND_RANGE', 'HOLD', 'EXIT'],
};

/**
 * Liste les décisions autorisées pour une gate (avec PENDING pour saisie partielle).
 */
export function decisionsForGate(gate: string): string[] {
  const g = gate.toUpperCase();
  return [...(GATE_DECISIONS[g] || ['GO', 'HOLD', 'NO_GO', 'CORRECT']), 'PENDING'];
}

/**
 * Valide qu'une décision est autorisée pour la gate (PENDING toujours OK).
 */
export function isAllowedGateDecision(gate: string, decision: string): boolean {
  const d = decision.toUpperCase().replace(/-/g, '_');
  if (d === 'PENDING') return true;
  const allowed = GATE_DECISIONS[gate.toUpperCase()] || [];
  if (allowed.includes(d)) return true;
  if (gate.toUpperCase() === 'G7' && (d === 'EXTEND' || d === 'EXTEND_RANGE')) return true;
  return false;
}

/**
 * Maturity Score G7 (§10) — dimensions distinctes du Launch Health Score.
 */
export function computeMaturityScore(dims: {
  ca_vs_bc: number;
  rentabilite: number;
  distribution: number;
  reachat: number;
  supply_stabilite: number;
  stock_sain: number;
  autonomie: number;
  execution: number;
}): { score: number; status: string; eligible: boolean } {
  const weights = {
    ca_vs_bc: 20,
    rentabilite: 15,
    distribution: 15,
    reachat: 15,
    supply_stabilite: 10,
    stock_sain: 10,
    autonomie: 10,
    execution: 5,
  };
  const total = Object.values(weights).reduce((a, b) => a + b, 0);
  const score =
    (dims.ca_vs_bc * weights.ca_vs_bc +
      dims.rentabilite * weights.rentabilite +
      dims.distribution * weights.distribution +
      dims.reachat * weights.reachat +
      dims.supply_stabilite * weights.supply_stabilite +
      dims.stock_sain * weights.stock_sain +
      dims.autonomie * weights.autonomie +
      dims.execution * weights.execution) /
    total;
  let status = 'critique';
  if (score >= 85) status = 'vert';
  else if (score >= 70) status = 'orange';
  else if (score >= 50) status = 'rouge';
  return {
    score: Math.round(score * 10) / 10,
    status,
    eligible: score >= 70,
  };
}

/** Statuts Health qui imposent un plan d'action correctif (§6). */
export const HEALTH_STATUSES_REQUIRING_ACTION = new Set(['orange', 'rouge', 'critique']);

/**
 * Gabarit d'action obligatoire selon le statut Health Score.
 */
export function healthForcedActionTemplate(
  brandCode: string,
  status: string,
): { code: string; title: string; owner_role: string; sla_days: number; priority: string } {
  const map: Record<string, { title: string; sla_days: number; priority: string }> = {
    orange: {
      title: `Plan correctif Health orange — ${brandCode}`,
      sla_days: 10,
      priority: 'medium',
    },
    rouge: {
      title: `Plan correctif Health rouge — ${brandCode}`,
      sla_days: 5,
      priority: 'high',
    },
    critique: {
      title: `Plan d'urgence Health critique — ${brandCode}`,
      sla_days: 3,
      priority: 'critical',
    },
  };
  const row = map[status] || map.orange;
  return {
    code: `HS-${status.toUpperCase()}-001`,
    title: row.title,
    owner_role: 'commercial',
    sla_days: row.sla_days,
    priority: row.priority,
  };
}

/** Statuts d'action considérés comme clos (non éligibles au passage overdue). */
export const CLOSED_ACTION_STATUSES = new Set(['done', 'cancelled']);

/**
 * Date du jour au format YYYY-MM-DD (UTC local ISO slice).
 */
export function todayIsoDate(now = new Date()): string {
  return now.toISOString().slice(0, 10);
}

/**
 * Nombre de jours calendaires depuis due_date (positif = en retard).
 */
export function daysPastDue(
  dueDate: string | null | undefined,
  today = todayIsoDate(),
): number {
  if (!dueDate) return 0;
  const due = Date.parse(`${dueDate}T00:00:00Z`);
  const now = Date.parse(`${today}T00:00:00Z`);
  if (Number.isNaN(due) || Number.isNaN(now)) return 0;
  return Math.floor((now - due) / 86400000);
}

/**
 * Niveau d'escalade SLA (§9) : none | reminder | overdue | manager | direction.
 * J-2 reminder, J+1 overdue, J+3 manager, J+7 Direction.
 */
export function escalationLevelFromDueDate(
  status: string,
  dueDate: string | null | undefined,
  today = todayIsoDate(),
): 'none' | 'reminder' | 'overdue' | 'manager' | 'direction' {
  if (!dueDate || CLOSED_ACTION_STATUSES.has(status)) return 'none';
  const days = daysPastDue(dueDate, today);
  if (days >= 7) return 'direction';
  if (days >= 3) return 'manager';
  if (days >= 1) return 'overdue';
  if (days >= -2 && days <= 0) return 'reminder';
  return 'none';
}

/**
 * Détermine si une action ouverte doit passer en overdue selon due_date.
 */
export function shouldMarkOverdue(
  status: string,
  dueDate: string | null | undefined,
  today = todayIsoDate(),
): boolean {
  if (!dueDate) return false;
  if (CLOSED_ACTION_STATUSES.has(status)) return false;
  return dueDate < today;
}

/** Dimensions Health Score absentes de articleList → valeur neutre estimée. */
export const ESTIMATED_HEALTH_DIMENSIONS = new Set([
  'ca_vs_forecast',
  'distribution',
  'rotation',
  'clients_actifs',
  'marketing',
]);

