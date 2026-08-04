/** Représente l'utilisateur authentifié retourné par l'API. */
export type User = {
  id: number
  email: string
  full_name: string
  role: string
}

/** Décrit une marque suivie dans la Control Tower et son état Stage-Gate courant. */
export type Brand = {
  id: number
  code: string
  name: string
  supplier: string | null
  phase: string
  current_gate: string
  launch_date: string | null
  notes: string | null
}

/** Regroupe les indicateurs agrégés affichés sur la Control Tower. */
export type ControlTower = {
  brands_count: number
  in_development: number
  in_launch: number
  actions_open: number
  actions_overdue: number
  critical_brands: string[]
  stock_alerts?: {
    marque: string
    sku_count: number
    zero_stock: number
    low_stock: number
    stock_total: number
    severity: string
  }[]
  stock_alerts_count?: number
  data_source: string
  role_view: string
}

/** Métadonnée de transparence pour une dimension Health Score (estimée ou réelle). */
export type HealthDimensionMeta = {
  dimension: string
  value: number
  is_estimated: boolean
}

/** Contient l'instantané catalogue d'une marque avec stock réel et score suggéré. */
export type BrandSnapshot = {
  marque: string
  sku_count: number
  stock_total: number
  zero_stock_skus: number
  low_stock_skus: number
  in_stock_skus: number
  avg_discount: number
  suggested_health: {
    period: string
    ca_vs_forecast: number
    distribution: number
    rotation: number
    clients_actifs: number
    disponibilite: number
    stock: number
    marge: number
    marketing: number
    override_critical: boolean
  }
  dimensions?: HealthDimensionMeta[]
  items: {
    item_no: string
    description: string
    brand_code: string
    unit_price: number
    inventory: number
  }[]
}

/** Modélise un élément de checklist rattaché à une gate. */
export type ChecklistItem = {
  id: string
  label: string
  done: boolean
}

/** Représente une gate Stage-Gate avec décision, checklist et statut de complétion. */
export type Gate = {
  id: number
  brand_id: number
  gate: string
  decision: string
  decided_at: string | null
  decided_by: string | null
  comment: string | null
  /** `manual` = décision utilisateur ; `sync` = auto-générée par import API */
  source?: string
  checklist: ChecklistItem[]
  checklist_done: number
  checklist_total: number
  checklist_complete: boolean
}

/** Décrit une action de lancement ou de suivi liée à une marque. */
export type ActionItem = {
  id: number
  brand_id: number
  code: string
  title: string
  owner_role: string
  approver_role?: string | null
  sla_days?: number
  status: string
  due_date: string | null
  deliverable: string | null
  close_condition?: string | null
  brand_code?: string | null
}

/** Représente un score de santé calculé pour une marque sur une période donnée. */
export type HealthScore = {
  id: number
  brand_id: number
  period: string
  score: number
  status: string
  ca_vs_forecast: number
  distribution: number
  rotation: number
  clients_actifs: number
  disponibilite: number
  stock: number
  marge: number
  marketing: number
  override_critical: boolean
}

/** Structure la routine du lundi avec résumé, retards et marques critiques. */
export type RoutineMonday = {
  summary: ControlTower
  overdue_actions: ActionItem[]
  critical_brands: Brand[]
  stock_alerts?: ControlTower['stock_alerts']
  focus: string
}

/** Structure la routine du vendredi centrée sur la revue des actions ouvertes. */
export type RoutineFriday = {
  open_actions: ActionItem[]
  done_this_week_hint: string
  focus: string
}

/** Regroupe les données nécessaires à la revue mensuelle d'une marque. */
export type BrandReview = {
  brand: Brand
  current_gate: Gate | null
  latest_health: HealthScore | null
  open_actions: ActionItem[]
  focus: string
}

const TOKEN_KEY = 'fgt_token'

/**
 * Base URL de l'API Nest.
 * En local: vide → chemins relatifs `/api/...` (proxy Vite).
 * En prod (Vercel): `VITE_API_URL` = URL publique Railway (sans slash final).
 */
function apiBase(): string {
  const raw = (import.meta.env.VITE_API_URL as string | undefined)?.trim() || ''
  return raw.replace(/\/$/, '')
}

/** Construit une URL API absolue ou relative selon l'environnement. */
function apiUrl(path: string): string {
  const base = apiBase()
  if (!base) return path
  return path.startsWith('/') ? `${base}${path}` : `${base}/${path}`
}

/** Lit le jeton JWT stocké localement pour les appels API authentifiés. */
export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY)
}

/** Met à jour ou supprime le jeton JWT conservé dans le navigateur. */
export function setToken(token: string | null) {
  if (token) localStorage.setItem(TOKEN_KEY, token)
  else localStorage.removeItem(TOKEN_KEY)
}

/** Indique si le rôle dispose des droits de pilotage manager dans l'interface. */
export function isManager(role?: string) {
  return role === 'direction' || role === 'developpement'
}

/** Exécute une requête HTTP vers le backend en ajoutant l'authentification et la gestion d'erreurs commune. */
async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers)
  const token = getToken()
  if (token) headers.set('Authorization', `Bearer ${token}`)
  if (!(options.body instanceof FormData) && options.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }

  const res = await fetch(apiUrl(path), { ...options, headers })
  if (res.status === 401) {
    setToken(null)
    throw new Error('Session expirée — reconnectez-vous')
  }
  if (!res.ok) {
    let detail = `Erreur ${res.status}`
    if (res.status === 405 && !apiBase()) {
      detail =
        'API non branchée (405). Sur Vercel, définis VITE_API_URL = URL Railway (sans /) puis redeploy.'
    }
    try {
      const data = await res.json()
      detail = data.detail || data.message || detail
      if (Array.isArray(detail)) detail = detail.map((d: { message?: string }) => d.message || d).join(', ')
    } catch {
      /* keep detail */
    }
    throw new Error(typeof detail === 'string' ? detail : JSON.stringify(detail))
  }
  if (res.status === 204) return undefined as T
  return res.json() as Promise<T>
}

/** Authentifie un utilisateur, stocke le jeton reçu et le renvoie à l'appelant. */
export async function login(email: string, password: string): Promise<string> {
  const body = new URLSearchParams()
  body.set('username', email)
  body.set('password', password)
  const data = await request<{ access_token: string }>('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  })
  setToken(data.access_token)
  return data.access_token
}

/** Centralise les appels typés vers les endpoints backend utilisés par l'application. */
export const api = {
  /** Charge le profil de l'utilisateur connecté. */
  me: () => request<User>('/api/auth/me'),
  /** Récupère les indicateurs globaux de la Control Tower. */
  controlTower: () => request<ControlTower>('/api/control-tower'),
  /** Liste les marques suivies dans le workflow interne. */
  brands: () => request<Brand[]>('/api/brands'),
  /** Crée une nouvelle opportunité de marque dans la Control Tower. */
  createBrand: (payload: { code: string; name: string; supplier?: string; notes?: string }) =>
    request<Brand>('/api/brands', { method: 'POST', body: JSON.stringify(payload) }),
  /** Charge les gates Stage-Gate associées à une marque. */
  gates: (brandId: number) => request<Gate[]>(`/api/brands/${brandId}/gates`),
  /** Enregistre l'état de checklist d'une gate pour une marque. */
  updateChecklist: (brandId: number, gate: string, items: ChecklistItem[]) =>
    request<Gate>(`/api/brands/${brandId}/gates/${gate}/checklist`, {
      method: 'PUT',
      body: JSON.stringify({ items }),
    }),
  /** Soumet une décision Stage-Gate et son commentaire optionnel. */
  decideGate: (brandId: number, gate: string, decision: string, comment?: string) =>
    request<Gate>(`/api/brands/${brandId}/gates/${gate}`, {
      method: 'POST',
      body: JSON.stringify({ decision, comment }),
    }),
  /** Liste les actions rattachées à une marque. */
  actions: (brandId: number) => request<ActionItem[]>(`/api/brands/${brandId}/actions`),
  /** Crée une action de suivi pour une marque donnée. */
  createAction: (
    brandId: number,
    payload: {
      code: string
      title: string
      owner_role: string
      sla_days?: number
      due_date?: string
      deliverable?: string
      close_condition?: string
    },
  ) =>
    request<ActionItem>(`/api/brands/${brandId}/actions`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  /** Met à jour partiellement une action existante. */
  updateAction: (actionId: number, payload: Partial<ActionItem>) =>
    request<ActionItem>(`/api/actions/${actionId}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),
  /** Charge l'historique des Health Scores d'une marque. */
  health: (brandId: number) => request<HealthScore[]>(`/api/brands/${brandId}/health`),
  /** Calcule et enregistre un Health Score à partir des valeurs saisies. */
  computeHealth: (
    brandId: number,
    payload: {
      period: string
      ca_vs_forecast: number
      distribution: number
      rotation: number
      clients_actifs: number
      disponibilite: number
      stock: number
      marge: number
      marketing: number
      override_critical?: boolean
    },
  ) =>
    request<HealthScore>(`/api/brands/${brandId}/health`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  /** Récupère l'instantané catalogue et stock réel d'une marque. */
  brandSnapshot: (brandId: number) => request<BrandSnapshot>(`/api/brands/${brandId}/api-snapshot`),
  /** Calcule un Health Score à partir des données stock issues de l'API FGT. */
  healthFromApi: (brandId: number, period = 'M1') =>
    request<{ health: HealthScore; snapshot: BrandSnapshot; dimensions?: HealthDimensionMeta[] }>(
      `/api/brands/${brandId}/health/from-api`,
      { method: 'POST', body: JSON.stringify({ period }) },
    ),
  /** Charge les données de la routine Control Tower du lundi. */
  monday: () => request<RoutineMonday>('/api/routines/monday'),
  /** Charge les données de la routine Action Review du vendredi. */
  friday: () => request<RoutineFriday>('/api/routines/friday'),
  /** Récupère le contenu de revue mensuelle pour une marque. */
  brandReview: (brandId: number) => request<BrandReview>(`/api/routines/brand-review/${brandId}`),
  /** Synchronise les marques du catalogue FGT vers la Control Tower. */
  syncBrands: (force = false) =>
    request<{ created: number; skipped: number; total_api: number }>(
      `/api/bc/sync-brands${force ? '?force=1' : ''}`,
      { method: 'POST' },
    ),
  /** Liste les marques disponibles dans le catalogue FGT avec leurs indicateurs de stock. */
  fgtBrands: (force = false) =>
    request<{
      data_source: string
      count: number
      brands: { marque: string; sku_count: number; stock_total: number }[]
      cached?: boolean
    }>(`/api/bc/brands${force ? '?force=1' : ''}`),
  /** Charge les articles FGT, filtrés par marque si demandé, avec pagination simple. */
  fgtItems: (brand?: string, limit = 50, force = false) => {
    const q = new URLSearchParams()
    if (brand) q.set('brand', brand)
    q.set('limit', String(limit))
    if (force) q.set('force', '1')
    return request<{
      data_source: string
      count: number
      items: {
        item_no: string
        description: string
        brand_code: string
        unit_price: number
        inventory: number
        customer_price?: number | null
      }[]
      cached?: boolean
    }>(`/api/bc/items?${q.toString()}`)
  },
}
