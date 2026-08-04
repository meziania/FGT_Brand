import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api, escalationLabel, type RoutineFriday, type RoutineMonday } from '../api'
import { AppShell } from '../AppShell'

/** Présente les routines hebdomadaires de pilotage et bascule entre lundi et vendredi. */
export function RoutinesPage() {
  const [tab, setTab] = useState<'monday' | 'friday'>('monday')
  const [monday, setMonday] = useState<RoutineMonday | null>(null)
  const [friday, setFriday] = useState<RoutineFriday | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    setError('')
    if (tab === 'monday') {
      api
        .monday()
        .then(setMonday)
        .catch((err) => setError(err instanceof Error ? err.message : 'Erreur'))
    } else {
      api
        .friday()
        .then(setFriday)
        .catch((err) => setError(err instanceof Error ? err.message : 'Erreur'))
    }
  }, [tab])

  return (
    <AppShell
      title={
        <>
          <h1>
            Routines <span>pilotage</span>
          </h1>
          <p>Selon le manuel: Lundi Control Tower · Vendredi Action Review · Brand Review mensuel.</p>
        </>
      }
    >
      <div className="row" style={{ marginBottom: '1rem' }}>
        <button
          className={`btn ${tab === 'monday' ? '' : 'ghost'}`}
          type="button"
          onClick={() => setTab('monday')}
        >
          Lundi — Control Tower
        </button>
        <button
          className={`btn ${tab === 'friday' ? '' : 'ghost'}`}
          type="button"
          onClick={() => setTab('friday')}
        >
          Vendredi — Action Review
        </button>
      </div>

      {error && <p className="error">{error}</p>}

      {tab === 'monday' && monday && (
        <>
          <div className="panel">
            <h2>Focus</h2>
            <p>{monday.focus}</p>
            <div className="grid-metrics" style={{ marginTop: '1rem', marginBottom: 0 }}>
              <div className="metric">
                <div className="label">Marques</div>
                <div className="value">{monday.summary.brands_count}</div>
              </div>
              <div className="metric">
                <div className="label">Actions ouvertes</div>
                <div className="value">{monday.summary.actions_open}</div>
              </div>
              <div className="metric">
                <div className="label">En retard</div>
                <div className="value">{monday.summary.actions_overdue}</div>
              </div>
            </div>
          </div>

          <div className="panel">
            <h2>Actions en retard</h2>
            <table className="table">
              <thead>
                <tr>
                  <th>Marque</th>
                  <th>Code</th>
                  <th>Titre</th>
                  <th>Owner</th>
                  <th>Échéance</th>
                  <th>Escalade</th>
                </tr>
              </thead>
              <tbody>
                {monday.overdue_actions.map((a) => (
                  <tr key={a.id}>
                    <td>{a.brand_code}</td>
                    <td>{a.code}</td>
                    <td>{a.title}</td>
                    <td>{a.owner_role}</td>
                    <td>{a.due_date}</td>
                    <td>
                      <span className={`status ${a.escalation_level || 'overdue'}`}>
                        {escalationLabel(a.escalation_level)}
                      </span>
                    </td>
                  </tr>
                ))}
                {monday.overdue_actions.length === 0 && (
                  <tr>
                    <td colSpan={6} className="muted">
                      Aucune action en retard
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {(monday.stock_alerts?.length ?? 0) > 0 && (
            <div className="panel">
              <h2>Alertes stock API ({monday.summary.stock_alerts_count ?? monday.stock_alerts!.length})</h2>
              <table className="table">
                <thead>
                  <tr>
                    <th>Marque</th>
                    <th>SKU=0</th>
                    <th>Stock bas</th>
                    <th>Sévérité</th>
                  </tr>
                </thead>
                <tbody>
                  {monday.stock_alerts!.map((a) => (
                    <tr key={a.marque}>
                      <td>{a.marque}</td>
                      <td>{a.zero_stock}</td>
                      <td>{a.low_stock}</td>
                      <td>
                        <span className={`status ${a.severity}`}>{a.severity}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="panel">
            <h2>Brand Review mensuel</h2>
            <p className="muted">Revue mensuelle : Health Score, écarts, Cause → Décision → Action.</p>
            <div className="row">
              {monday.critical_brands.map((b) => (
                <Link key={b.id} className="btn small" to={`/brands/${b.id}/review`}>
                  Revue {b.code}
                </Link>
              ))}
              {monday.critical_brands.length === 0 && (
                <Link className="btn small ghost" to="/">
                  Voir toutes les marques
                </Link>
              )}
            </div>
          </div>
        </>
      )}

      {tab === 'friday' && friday && (
        <div className="panel">
          <h2>Focus</h2>
          <p>{friday.focus}</p>
          <p className="muted">{friday.done_this_week_hint}</p>
          <table className="table" style={{ marginTop: '1rem' }}>
            <thead>
              <tr>
                <th>Marque</th>
                <th>Code</th>
                <th>Titre</th>
                <th>Owner</th>
                <th>Statut</th>
                <th>Échéance</th>
              </tr>
            </thead>
            <tbody>
              {friday.open_actions.map((a) => (
                <tr key={a.id}>
                  <td>
                    <Link to={`/brands/${a.brand_id}`}>{a.brand_code}</Link>
                  </td>
                  <td>{a.code}</td>
                  <td>{a.title}</td>
                  <td>{a.owner_role}</td>
                  <td>
                    <span className={`status ${a.status}`}>{a.status}</span>
                  </td>
                  <td>{a.due_date ?? '—'}</td>
                </tr>
              ))}
              {friday.open_actions.length === 0 && (
                <tr>
                  <td colSpan={6} className="muted">
                    Aucune action ouverte
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </AppShell>
  )
}
