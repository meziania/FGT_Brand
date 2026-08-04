import { useEffect, useState, type FormEvent } from 'react'
import { Link, useParams } from 'react-router-dom'
import { api, isManager, type BrandReview } from '../api'
import { useAuth } from '../auth'
import { AppShell, BackLink } from '../AppShell'

const ROLES = ['developpement', 'commercial', 'marketing', 'achats', 'supply', 'finance', 'direction']

/**
 * Écran Monthly Brand Review : performance, health score, actions ouvertes,
 * et formulaire Cause → Décision → Action → Owner → Deadline (cahier §8).
 */
export function BrandReviewPage() {
  const { brandId } = useParams()
  const id = Number(brandId)
  const { user } = useAuth()
  const manager = isManager(user?.role)
  const [review, setReview] = useState<BrandReview | null>(null)
  const [error, setError] = useState('')
  const [msg, setMsg] = useState('')
  const [form, setForm] = useState({
    cause: '',
    decision: '',
    action: '',
    owner_role: 'commercial',
    deadline: '',
  })

  /** Charge la revue mensuelle via GET /api/routines/brand-review/:id. */
  async function load() {
    const data = await api.brandReview(id)
    setReview(data)
  }

  useEffect(() => {
    if (!Number.isFinite(id)) return
    load().catch((err) => setError(err instanceof Error ? err.message : 'Erreur'))
  }, [id])

  /**
   * Crée une action_items liée à la review (endpoint actions existant).
   * Encode cause/décision dans title + deliverable/close_condition.
   */
  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')
    setMsg('')
    try {
      const code = `MBR-${Date.now().toString().slice(-6)}`
      await api.createAction(id, {
        code,
        title: `${form.decision || 'Action'} — ${form.action}`,
        owner_role: form.owner_role,
        sla_days: 5,
        due_date: form.deadline || undefined,
        deliverable: `Cause: ${form.cause}`,
        close_condition: `Décision review: ${form.decision}`,
      })
      setMsg('Action créée depuis la Brand Review')
      setForm({ cause: '', decision: '', action: '', owner_role: 'commercial', deadline: '' })
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Création impossible')
    }
  }

  const health = review?.latest_health
  const brand = review?.brand

  return (
    <AppShell subtitle={brand ? `Brand Review · ${brand.code}` : 'Brand Review'}>
      <BackLink />
      {error && <p className="error">{error}</p>}
      {msg && <p className="ok-msg">{msg}</p>}

      {!review || !brand ? (
        <p>Chargement…</p>
      ) : (
        <>
          <div className="hero">
            <h1>
              Monthly Brand Review — <span>{brand.name}</span>
            </h1>
            <p>{review.focus}</p>
            <p className="muted">
              Phase {brand.phase} · Gate {brand.current_gate}
              {' · '}
              <Link to={`/brands/${brand.id}`}>Ouvrir la fiche marque</Link>
            </p>
          </div>

          <div className="panel">
            <h2>Executive Summary — Health Score</h2>
            {health ? (
              <div className="row" style={{ alignItems: 'baseline', gap: '1rem' }}>
                <div className="score-big">{health.score}</div>
                <span className={`status ${health.status}`}>{health.status}</span>
                <span className="muted">Période {health.period}</span>
              </div>
            ) : (
              <p className="muted">Aucun Health Score enregistré.</p>
            )}
            {health && (
              <div className="health-grid" style={{ marginTop: '1rem' }}>
                {(
                  [
                    ['ca_vs_forecast', 'CA vs Forecast'],
                    ['distribution', 'Distribution'],
                    ['rotation', 'Rotation'],
                    ['clients_actifs', 'Clients'],
                    ['disponibilite', 'Disponibilité'],
                    ['stock', 'Stock'],
                    ['marge', 'Marge'],
                    ['marketing', 'Marketing'],
                  ] as const
                ).map(([key, label]) => (
                  <div className="metric" key={key}>
                    <div className="label">{label}</div>
                    <div className="value" style={{ fontSize: '1.25rem' }}>
                      {health[key]}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="panel">
            <h2>Faits marquants / Gate courant</h2>
            {review.current_gate ? (
              <p>
                Gate <strong>{review.current_gate.gate}</strong> — décision{' '}
                <strong>{review.current_gate.decision}</strong>
                {review.current_gate.comment ? ` · ${review.current_gate.comment}` : ''}
                {review.current_gate.checklist_complete === false && (
                  <span className="muted"> · checklist incomplète</span>
                )}
              </p>
            ) : (
              <p className="muted">Aucune gate courante.</p>
            )}
          </div>

          <div className="panel">
            <h2>Actions ouvertes</h2>
            <table className="table">
              <thead>
                <tr>
                  <th>Code</th>
                  <th>Titre</th>
                  <th>Owner</th>
                  <th>Statut</th>
                  <th>Échéance</th>
                </tr>
              </thead>
              <tbody>
                {review.open_actions.map((a) => (
                  <tr key={a.id}>
                    <td>{a.code}</td>
                    <td>{a.title}</td>
                    <td>{a.owner_role}</td>
                    <td>
                      <span className={`status ${a.status}`}>{a.status}</span>
                    </td>
                    <td>{a.due_date ?? '—'}</td>
                  </tr>
                ))}
                {review.open_actions.length === 0 && (
                  <tr>
                    <td colSpan={5} className="muted">
                      Aucune action ouverte
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="panel">
            <h2>Décisions &amp; Actions (Cause → Décision → Action → Owner → Deadline)</h2>
            <p className="muted" style={{ marginBottom: '1rem' }}>
              Chaque écart doit se terminer par une action assignée (manuel §8).
            </p>
            <form onSubmit={onSubmit}>
              <div className="field">
                <label>Cause</label>
                <input
                  value={form.cause}
                  onChange={(e) => setForm({ ...form, cause: e.target.value })}
                  required
                  placeholder="Écart factuel / cause validée"
                />
              </div>
              <div className="field">
                <label>Décision</label>
                <input
                  value={form.decision}
                  onChange={(e) => setForm({ ...form, decision: e.target.value })}
                  required
                  placeholder="Ex: Plan correctif DN, sécuriser stock…"
                />
              </div>
              <div className="field">
                <label>Action</label>
                <input
                  value={form.action}
                  onChange={(e) => setForm({ ...form, action: e.target.value })}
                  required
                  placeholder="Mesure corrective ou préventive"
                />
              </div>
              <div className="row">
                <div className="field" style={{ marginBottom: 0 }}>
                  <label>Owner</label>
                  <select
                    value={form.owner_role}
                    onChange={(e) => setForm({ ...form, owner_role: e.target.value })}
                    disabled={!manager && !!user?.role}
                  >
                    {ROLES.map((r) => (
                      <option key={r} value={r}>
                        {r}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="field" style={{ marginBottom: 0 }}>
                  <label>Deadline</label>
                  <input
                    type="date"
                    value={form.deadline}
                    onChange={(e) => setForm({ ...form, deadline: e.target.value })}
                    required
                  />
                </div>
                <button className="btn" type="submit" style={{ alignSelf: 'end' }}>
                  Créer l’action
                </button>
              </div>
            </form>
          </div>
        </>
      )}
    </AppShell>
  )
}
