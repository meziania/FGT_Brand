import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Link, useParams } from 'react-router-dom'
import {
  api,
  canComputeHealth,
  canDecideGate,
  canEditChecklist,
  decisionsForGate,
  escalationLabel,
  isDevOwner,
  isManager,
  isOperational,
  type ActionItem,
  type Brand,
  type BrandSnapshot,
  type ChecklistItem,
  type Gate,
  type HealthDimensionMeta,
  type HealthScore,
  type MaturityScore,
} from '../api'
import { useAuth } from '../auth'
import { AppShell, BackLink } from '../AppShell'

const GATES = ['G0', 'G1', 'G2', 'G3', 'G4', 'G5', 'G6', 'G7']

const ROLES = ['developpement', 'commercial', 'marketing', 'achats', 'supply', 'finance', 'direction']
const HEALTH_FIELDS = [
  ['ca_vs_forecast', 'CA vs Forecast (20%)'],
  ['distribution', 'Distribution (15%)'],
  ['rotation', 'Rotation / Réachat (15%)'],
  ['clients_actifs', 'Clients actifs (10%)'],
  ['disponibilite', 'Disponibilité (10%)'],
  ['stock', 'Stock (10%)'],
  ['marge', 'Marge (10%)'],
  ['marketing', 'Marketing / Trade (10%)'],
] as const

const DEFAULT_ESTIMATED = new Set([
  'ca_vs_forecast',
  'distribution',
  'rotation',
  'clients_actifs',
  'marketing',
])

/** Affiche la fiche complète d'une marque avec gates, actions, stock API et Health Score. */
export function BrandDetailPage() {
  const { brandId } = useParams()
  const id = Number(brandId)
  const { user } = useAuth()
  const manager = isManager(user?.role)
  const canChecklist = canEditChecklist(user?.role)
  const canHealth = canComputeHealth(user?.role)
  const ops = isOperational(user?.role)

  const [brand, setBrand] = useState<Brand | null>(null)
  const [gates, setGates] = useState<Gate[]>([])
  const [actions, setActions] = useState<ActionItem[]>([])
  const [health, setHealth] = useState<HealthScore[]>([])
  const [snapshot, setSnapshot] = useState<BrandSnapshot | null>(null)
  const [dimMeta, setDimMeta] = useState<HealthDimensionMeta[]>([])
  const [selectedGate, setSelectedGate] = useState('G0')
  const [decision, setDecision] = useState('GO')
  const [comment, setComment] = useState('')
  const [checklist, setChecklist] = useState<ChecklistItem[]>([])
  const [error, setError] = useState('')
  const [msg, setMsg] = useState('')
  const [maturity, setMaturity] = useState<MaturityScore | null>(null)
  const [maturityForm, setMaturityForm] = useState({
    ca_vs_bc: 80,
    rentabilite: 80,
    distribution: 80,
    reachat: 80,
    supply_stabilite: 80,
    stock_sain: 80,
    autonomie: 80,
    execution: 80,
  })

  const canDecide = canDecideGate(user?.role, selectedGate)
  const decisions = decisionsForGate(selectedGate)

  const [actionForm, setActionForm] = useState({
    code: '',
    title: '',
    owner_role: ops && user?.role ? user.role : 'commercial',
    sla_days: 5,
    deliverable: '',
    close_condition: '',
    priority: 'medium',
    root_cause: '',
  })

  const [healthForm, setHealthForm] = useState({
    period: 'M1',
    ca_vs_forecast: 80,
    distribution: 80,
    rotation: 80,
    clients_actifs: 80,
    disponibilite: 80,
    stock: 80,
    marge: 80,
    marketing: 80,
    override_critical: false,
  })

  /** Recharge toutes les données de la marque et initialise les vues liées à la gate courante. */
  async function load() {
    const [brands, g, a, h] = await Promise.all([
      api.brands(),
      api.gates(id),
      api.actions(id),
      api.health(id),
    ])
    const current = brands.find((b) => b.id === id) ?? null
    setBrand(current)
    setGates(g)
    setActions(a)
    setHealth(h)
    const gateCode = current?.current_gate ?? 'G0'
    setSelectedGate(gateCode)
    const gateRow = g.find((x) => x.gate === gateCode)
    setChecklist(gateRow?.checklist ?? [])
    try {
      const snap = await api.brandSnapshot(id)
      setSnapshot(snap)
      setHealthForm((prev) => ({ ...prev, ...snap.suggested_health }))
      if (snap.dimensions?.length) setDimMeta(snap.dimensions)
      else {
        setDimMeta(
          HEALTH_FIELDS.map(([key]) => ({
            dimension: key,
            value: snap.suggested_health[key],
            is_estimated: DEFAULT_ESTIMATED.has(key),
          })),
        )
      }
    } catch {
      setSnapshot(null)
    }
    try {
      const mat = await api.getMaturity(id)
      setMaturity(mat)
      if (mat.dimensions) setMaturityForm(mat.dimensions)
    } catch {
      setMaturity(null)
    }
  }

  useEffect(() => {
    if (!Number.isFinite(id)) return
    load().catch((err) => setError(err instanceof Error ? err.message : 'Erreur'))
  }, [id])

  useEffect(() => {
    const gateRow = gates.find((x) => x.gate === selectedGate)
    setChecklist(gateRow?.checklist ?? [])
  }, [selectedGate, gates])

  const latestHealth = health[0]
  const gateMap = useMemo(() => Object.fromEntries(gates.map((g) => [g.gate, g])), [gates])

  /** Persiste la checklist de la gate sélectionnée puis recharge la fiche. */
  async function saveChecklist() {
    setError('')
    setMsg('')
    try {
      await api.updateChecklist(id, selectedGate, checklist)
      setMsg(`Checklist ${selectedGate} enregistrée`)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Échec checklist')
    }
  }

  /** Enregistre une décision Stage-Gate depuis le formulaire manager. */
  async function onDecide(e: FormEvent) {
    e.preventDefault()
    setError('')
    setMsg('')
    try {
      await api.decideGate(id, selectedGate, decision, comment || undefined)
      setMsg(`Décision ${decision} enregistrée pour ${selectedGate}`)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Échec décision')
    }
  }

  /** Crée une nouvelle action pour la marque et réinitialise les champs saisis. */
  async function onCreateAction(e: FormEvent) {
    e.preventDefault()
    setError('')
    setMsg('')
    try {
      await api.createAction(id, {
        ...actionForm,
        sla_days: Number(actionForm.sla_days),
      })
      setActionForm((f) => ({
        ...f,
        code: '',
        title: '',
        deliverable: '',
        close_condition: '',
        root_cause: '',
        priority: 'medium',
      }))
      setMsg('Action créée')
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Échec action')
    }
  }

  /** Marque une action comme terminée (preuve obligatoire §9). */
  async function markDone(actionId: number) {
    const evidence = window.prompt('Preuve de clôture (obligatoire §9) :', 'Livrable validé')
    if (!evidence?.trim()) {
      setError('Clôture annulée — preuve requise')
      return
    }
    try {
      await api.updateAction(actionId, { status: 'done', evidence: evidence.trim() })
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Échec clôture')
    }
  }

  /** Demande au backend de calculer le Health Score à partir des données stock API. */
  async function onHealthFromApi() {
    setError('')
    setMsg('')
    try {
      const res = await api.healthFromApi(id, healthForm.period)
      if (res.dimensions?.length) setDimMeta(res.dimensions)
      setMsg(
        `Score API: ${res.health.score} (${res.health.status})${
          res.forced_action ? ` · action forcée ${res.forced_action.code}` : ''
        }`,
      )
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Échec score API')
    }
  }

  /** Calcule un Health Score avec les valeurs saisies dans le formulaire. */
  async function onComputeHealth(e: FormEvent) {
    e.preventDefault()
    setError('')
    setMsg('')
    try {
      const row = await api.computeHealth(id, healthForm)
      setMsg(
        `Health Score: ${row.score} (${row.status})${
          row.forced_action ? ` · action forcée ${row.forced_action.code}` : ''
        }`,
      )
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Échec score')
    }
  }

  async function onComputeMaturity(e: FormEvent) {
    e.preventDefault()
    setError('')
    setMsg('')
    try {
      const row = await api.computeMaturity(id, maturityForm)
      setMaturity(row)
      setMsg(`Maturity Score: ${row.score} (${row.status}) — ${row.message || ''}`)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Échec Maturity Score')
    }
  }

  return (
    <AppShell subtitle={brand ? `${brand.code} · ${brand.name}` : 'Marque'}>
      <BackLink />
      {error && <p className="error">{error}</p>}
      {msg && <p className="ok-msg">{msg}</p>}

      {!brand ? (
        <p>Chargement…</p>
      ) : (
        <>
            <div className="hero">
            <h1>{brand.name}</h1>
            <p>
              Phase <strong>{brand.phase}</strong> · Gate courant{' '}
              <strong>{brand.current_gate}</strong>
              {brand.launch_date ? ` · Lancement ${brand.launch_date}` : ''}
            </p>
            <p style={{ marginTop: '0.75rem' }}>
              <Link className="btn small" to={`/brands/${brand.id}/review`}>
                Monthly Brand Review
              </Link>
            </p>
          </div>

          {snapshot && (
            <div className="panel">
              <h2>Données API FGT (stock réel)</h2>
              <div className="grid-metrics" style={{ marginBottom: '1rem' }}>
                <div className="metric">
                  <div className="label">SKU</div>
                  <div className="value">{snapshot.sku_count}</div>
                </div>
                <div className="metric">
                  <div className="label">Stock total</div>
                  <div className="value">{Math.round(snapshot.stock_total)}</div>
                </div>
                <div className="metric">
                  <div className="label">SKU à 0</div>
                  <div className="value">{snapshot.zero_stock_skus}</div>
                </div>
                <div className="metric">
                  <div className="label">Disponibilité</div>
                  <div className="value">{snapshot.suggested_health.disponibilite}%</div>
                </div>
              </div>
              {canHealth && (
                <button className="btn" type="button" onClick={() => void onHealthFromApi()}>
                  Calculer Health Score depuis API
                </button>
              )}
              <table className="table" style={{ marginTop: '1rem' }}>
                <thead>
                  <tr>
                    <th>Item</th>
                    <th>Description</th>
                    <th>Prix</th>
                    <th>Stock</th>
                  </tr>
                </thead>
                <tbody>
                  {snapshot.items.slice(0, 20).map((i) => (
                    <tr key={i.item_no}>
                      <td>{i.item_no}</td>
                      <td>{i.description}</td>
                      <td>{i.unit_price.toFixed(2)}</td>
                      <td>{Math.round(i.inventory)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="panel">
            <h2>Parcours Stage-Gate</h2>
            <div className="gate-track">
              {GATES.map((g) => {
                const row = gateMap[g]
                const cls = `gate-pill ${brand.current_gate === g ? 'active' : ''}`
                return (
                  <button
                    key={g}
                    type="button"
                    className={cls}
                    onClick={() => setSelectedGate(g)}
                    style={{ cursor: 'pointer', width: '100%' }}
                  >
                    <div className="code">{g}</div>
                    <div className={`status ${(row?.decision ?? 'pending').toLowerCase()}`}>
                      {row?.decision ?? 'PENDING'}
                    </div>
                    <div className="muted" style={{ fontSize: '0.75rem', marginTop: 4 }}>
                      {row ? `${row.checklist_done}/${row.checklist_total}` : '0/0'}
                      {row?.source === 'sync' ? ' · sync' : ''}
                    </div>
                  </button>
                )
              })}
            </div>

            <h3 className="subhead">Checklist {selectedGate} (livrables minimum)</h3>
            <div className="checklist">
              {checklist.map((item, idx) => (
                <label key={item.id} className="check-item">
                  <input
                    type="checkbox"
                    checked={item.done}
                    disabled={!canChecklist}
                    onChange={(e) => {
                      const next = [...checklist]
                      next[idx] = { ...item, done: e.target.checked }
                      setChecklist(next)
                    }}
                  />
                  <span>{item.label}</span>
                </label>
              ))}
              {checklist.length === 0 && <p className="muted">Aucune checklist</p>}
            </div>
            {canChecklist && (
              <button className="btn ghost" type="button" onClick={saveChecklist} style={{ marginTop: 8 }}>
                Enregistrer checklist
              </button>
            )}
            {!canChecklist && (
              <p className="muted" style={{ marginTop: 8, fontSize: '0.85rem' }}>
                Checklist en lecture seule — saisie réservée au Développement.
              </p>
            )}

            {canDecide ? (
              <form onSubmit={onDecide} style={{ marginTop: '1rem' }}>
                <div className="row">
                  <div className="field" style={{ marginBottom: 0 }}>
                    <label>Gate</label>
                    <select
                      value={selectedGate}
                      onChange={(e) => {
                        const g = e.target.value
                        setSelectedGate(g)
                        setDecision(decisionsForGate(g)[0])
                      }}
                    >
                      {GATES.map((g) => (
                        <option key={g} value={g}>
                          {g}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="field" style={{ marginBottom: 0 }}>
                    <label>Décision</label>
                    <select
                      value={decision}
                      onChange={(e) => setDecision(e.target.value)}
                    >
                      {decisions.map((d) => (
                        <option key={d} value={d}>
                          {d}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="field" style={{ flex: 1, marginBottom: 0, minWidth: 180 }}>
                    <label>Commentaire</label>
                    <input value={comment} onChange={(e) => setComment(e.target.value)} />
                  </div>
                  <button className="btn" type="submit" style={{ alignSelf: 'end' }}>
                    Valider la Gate
                  </button>
                </div>
                <p className="muted" style={{ marginTop: 8, fontSize: '0.85rem' }}>
                  {isDevOwner(user?.role)
                    ? 'GO / MATURITY impossibles si checklist incomplète. Sur G7: MATURITY = marque mature, EXIT = sortie du portefeuille.'
                    : 'Direction : décisions limitées à G6 (Launch) et G7 (Maturity).'}
                </p>
              </form>
            ) : (
              <p className="muted" style={{ marginTop: '1rem', fontSize: '0.85rem' }}>
                {manager
                  ? `Sélectionnez G6 ou G7 pour décider (gate actuelle : ${selectedGate}).`
                  : 'Décisions Stage-Gate réservées au Développement (G0–G7) et à la Direction (G6–G7).'}
              </p>
            )}
          </div>

          <div className="panel">
            <h2>Launch Health Score</h2>
            {latestHealth ? (
              <div className="row" style={{ alignItems: 'baseline', gap: '1rem', marginBottom: '1rem' }}>
                <div className="score-big">{latestHealth.score}</div>
                <span className={`status ${latestHealth.status}`}>{latestHealth.status}</span>
                <span className="muted">Période {latestHealth.period}</span>
              </div>
            ) : (
              <p className="muted">Aucun score calculé pour cette marque.</p>
            )}

            {canHealth && (
              <form onSubmit={onComputeHealth}>
                <div className="field">
                  <label>Période</label>
                  <select
                    value={healthForm.period}
                    onChange={(e) => setHealthForm({ ...healthForm, period: e.target.value })}
                  >
                    {['J+7', 'J+15', 'M1', 'M2', 'M3', 'M6', 'M9', 'M12'].map((p) => (
                      <option key={p} value={p}>
                        {p}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="health-grid">
                  {HEALTH_FIELDS.map(([key, label]) => {
                    const meta = dimMeta.find((d) => d.dimension === key)
                    const estimated = meta?.is_estimated ?? DEFAULT_ESTIMATED.has(key)
                    return (
                      <div className="field" key={key}>
                        <label>
                          {label}
                          {estimated && (
                            <span
                              className="badge-estimated"
                              title="Donnée non disponible via API — valeur neutre par défaut"
                            >
                              estimé
                            </span>
                          )}
                        </label>
                        <input
                          type="number"
                          min={0}
                          max={100}
                          value={healthForm[key]}
                          onChange={(e) =>
                            setHealthForm({ ...healthForm, [key]: Number(e.target.value) })
                          }
                        />
                      </div>
                    )
                  })}
                </div>
                <label className="check-item" style={{ marginBottom: 12 }}>
                  <input
                    type="checkbox"
                    checked={healthForm.override_critical}
                    onChange={(e) =>
                      setHealthForm({ ...healthForm, override_critical: e.target.checked })
                    }
                  />
                  <span>Override critique (rupture / marge / réglementaire)</span>
                </label>
                <div className="row">
                  <button className="btn" type="submit">
                    Calculer le score
                  </button>
                  <button className="btn ghost" type="button" onClick={() => void onHealthFromApi()}>
                    Depuis API stock
                  </button>
                </div>
              </form>
            )}
          </div>

          <div className="panel">
            <h2>Maturity Score G7</h2>
            <p className="muted" style={{ marginTop: 0 }}>
              Score distinct du Launch Health Score (manuel §10). M+12 = éligibilité, pas maturité
              automatique.
            </p>
            {maturity?.score != null ? (
              <div className="row" style={{ alignItems: 'baseline', gap: '1rem', marginBottom: '1rem' }}>
                <div className="score-big">{maturity.score}</div>
                <span className={`status ${maturity.status || ''}`}>{maturity.status}</span>
                <span className="muted">
                  {maturity.eligible ? 'Éligible Maturity Review' : 'Non éligible (&lt; 70)'}
                </span>
              </div>
            ) : (
              <p className="muted">Aucun Maturity Score calculé.</p>
            )}
            {canHealth && (
              <form onSubmit={onComputeMaturity}>
                <div className="health-grid">
                  {(
                    [
                      ['ca_vs_bc', 'CA vs Business Case (20%)'],
                      ['rentabilite', 'Rentabilité (15%)'],
                      ['distribution', 'Distribution (15%)'],
                      ['reachat', 'Réachat (15%)'],
                      ['supply_stabilite', 'Stabilité Supply (10%)'],
                      ['stock_sain', 'Stock sain (10%)'],
                      ['autonomie', 'Autonomie (10%)'],
                      ['execution', 'Exécution (5%)'],
                    ] as const
                  ).map(([key, label]) => (
                    <div className="field" key={key}>
                      <label>{label}</label>
                      <input
                        type="number"
                        min={0}
                        max={100}
                        value={maturityForm[key]}
                        onChange={(e) =>
                          setMaturityForm({ ...maturityForm, [key]: Number(e.target.value) })
                        }
                      />
                    </div>
                  ))}
                </div>
                <button className="btn" type="submit">
                  Calculer Maturity Score
                </button>
              </form>
            )}
          </div>

          <div className="panel">
            <h2>Plans d’actions</h2>
            <form onSubmit={onCreateAction} style={{ marginBottom: '1rem' }}>
              <div className="row">
                <div className="field" style={{ marginBottom: 0 }}>
                  <label>Code</label>
                  <input
                    value={actionForm.code}
                    onChange={(e) => setActionForm({ ...actionForm, code: e.target.value })}
                    required
                  />
                </div>
                <div className="field" style={{ marginBottom: 0, flex: 1, minWidth: 180 }}>
                  <label>Titre</label>
                  <input
                    value={actionForm.title}
                    onChange={(e) => setActionForm({ ...actionForm, title: e.target.value })}
                    required
                  />
                </div>
                <div className="field" style={{ marginBottom: 0 }}>
                  <label>Owner</label>
                  <select
                    value={actionForm.owner_role}
                    onChange={(e) => setActionForm({ ...actionForm, owner_role: e.target.value })}
                    disabled={!manager}
                  >
                    {ROLES.map((r) => (
                      <option key={r} value={r}>
                        {r}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="field" style={{ marginBottom: 0 }}>
                  <label>Priorité</label>
                  <select
                    value={actionForm.priority}
                    onChange={(e) => setActionForm({ ...actionForm, priority: e.target.value })}
                  >
                    {['low', 'medium', 'high', 'critical'].map((p) => (
                      <option key={p} value={p}>
                        {p}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="field" style={{ marginBottom: 0 }}>
                  <label>SLA (j)</label>
                  <input
                    type="number"
                    min={1}
                    value={actionForm.sla_days}
                    onChange={(e) =>
                      setActionForm({ ...actionForm, sla_days: Number(e.target.value) })
                    }
                  />
                </div>
              </div>
              <div className="row" style={{ marginTop: 8 }}>
                <div className="field" style={{ marginBottom: 0, flex: 1 }}>
                  <label>Cause racine</label>
                  <input
                    value={actionForm.root_cause}
                    onChange={(e) => setActionForm({ ...actionForm, root_cause: e.target.value })}
                  />
                </div>
                <div className="field" style={{ marginBottom: 0, flex: 1 }}>
                  <label>Livrable</label>
                  <input
                    value={actionForm.deliverable}
                    onChange={(e) => setActionForm({ ...actionForm, deliverable: e.target.value })}
                  />
                </div>
                <div className="field" style={{ marginBottom: 0, flex: 1 }}>
                  <label>Condition de clôture</label>
                  <input
                    value={actionForm.close_condition}
                    onChange={(e) =>
                      setActionForm({ ...actionForm, close_condition: e.target.value })
                    }
                  />
                </div>
                <button className="btn" type="submit" style={{ alignSelf: 'end' }}>
                  Ajouter action
                </button>
              </div>
            </form>

            <table className="table">
              <thead>
                <tr>
                  <th>Code</th>
                  <th>Titre</th>
                  <th>Owner</th>
                  <th>Priorité</th>
                  <th>Échéance</th>
                  <th>Escalade</th>
                  <th>Statut</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {actions.map((a) => (
                  <tr key={a.id}>
                    <td>{a.code}</td>
                    <td>
                      {a.title}
                      {a.root_cause && <div className="muted">Cause: {a.root_cause}</div>}
                      {a.deliverable && <div className="muted">{a.deliverable}</div>}
                      {a.close_condition && (
                        <div className="muted">Clôture: {a.close_condition}</div>
                      )}
                    </td>
                    <td>{a.owner_role}</td>
                    <td>{a.priority ?? 'medium'}</td>
                    <td>{a.due_date ?? '—'}</td>
                    <td>
                      <span className={`status ${a.escalation_level || 'none'}`}>
                        {escalationLabel(a.escalation_level)}
                      </span>
                    </td>
                    <td>
                      <span className={`status ${a.status}`}>{a.status}</span>
                    </td>
                    <td>
                      {a.status !== 'done' && (
                        <button
                          className="btn small ghost"
                          type="button"
                          onClick={() => markDone(a.id)}
                        >
                          Clôturer
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
                {actions.length === 0 && (
                  <tr>
                    <td colSpan={8} className="muted">
                      Aucune action
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </AppShell>
  )
}
