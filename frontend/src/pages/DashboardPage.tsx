import { useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import {
  api,
  canCreateBrand,
  canSyncBrands,
  isDirection,
  isDevOwner,
  isOperational,
  roleLabel,
  viewLevelBlurb,
  type Brand,
  type ControlTower,
} from '../api'
import { useAuth } from '../auth'
import { AppShell } from '../AppShell'

/** Affiche la Control Tower avec les indicateurs, alertes et marques suivies. */
export function DashboardPage() {
  const { user } = useAuth()
  const [tower, setTower] = useState<ControlTower | null>(null)
  const [brands, setBrands] = useState<Brand[]>([])
  const [error, setError] = useState('')
  const [code, setCode] = useState('')
  const [name, setName] = useState('')
  const [supplier, setSupplier] = useState('')
  const [msg, setMsg] = useState('')

  /** Recharge les indicateurs et marques, avec une synchronisation API opportuniste. */
  async function load() {
    setMsg('')
    if (canSyncBrands(user?.role)) {
      try {
        const sync = await api.syncBrands(false)
        if (sync.created > 0) {
          setMsg(`${sync.created} marques API importées dans Control Tower`)
        }
      } catch {
        // sync optionnel si API down
      }
    }
    const [t, b] = await Promise.all([api.controlTower(), api.brands()])
    setTower(t)
    setBrands(b)
  }

  useEffect(() => {
    load().catch((err) => setError(err instanceof Error ? err.message : 'Erreur chargement'))
  }, [user?.role])

  /** Crée une marque depuis le formulaire Développement puis rafraîchit la Control Tower. */
  async function onCreateBrand(e: FormEvent) {
    e.preventDefault()
    setError('')
    setMsg('')
    try {
      await api.createBrand({
        code,
        name,
        supplier: supplier || undefined,
      })
      setCode('')
      setName('')
      setSupplier('')
      setMsg('Marque créée (G0)')
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Création impossible')
    }
  }

  return (
    <AppShell
      title={
        <>
          <h1>
            Control <span>Tower</span>
          </h1>
          <p>{viewLevelBlurb(user?.role)}</p>
          <p className="muted">
            Rôle {roleLabel(user?.role)} · niveau {tower?.view_level ?? '…'} · source{' '}
            {tower?.data_source ?? '…'}
          </p>
        </>
      }
    >
      {error && <p className="error">{error}</p>}
      {msg && <p className="ok-msg">{msg}</p>}

      {isOperational(user?.role) && (
        <p className="ok-msg">
          Vue métier : marques en lancement et actions dont vous êtes owner ({user?.role}).
        </p>
      )}
      {isDirection(user?.role) && (
        <p className="ok-msg">
          Direction : focus KPI / alertes. Décisions Gate limitées à G6 (Launch) et G7 (Maturity).
        </p>
      )}
      {isDevOwner(user?.role) && (
        <p className="ok-msg">
          Développement (Business Owner) : création marques, checklists, Stage-Gate G0–G7, sync API.
        </p>
      )}

      {canSyncBrands(user?.role) && (
        <div className="row" style={{ marginBottom: '1rem' }}>
          <button
            className="btn ghost"
            type="button"
            onClick={() =>
              api
                .syncBrands(true)
                .then((s) => {
                  setMsg(`Sync API: +${s.created} créées / ${s.skipped} déjà présentes`)
                  return load()
                })
                .catch((err) => setError(err instanceof Error ? err.message : 'Sync échouée'))
            }
          >
            Synchroniser marques API
          </button>
        </div>
      )}

      {tower && (
        <div className="grid-metrics">
          <div className="metric">
            <div className="label">Marques</div>
            <div className="value">{tower.brands_count}</div>
          </div>
          <div className="metric">
            <div className="label">Développement</div>
            <div className="value">{tower.in_development}</div>
          </div>
          <div className="metric">
            <div className="label">Lancement</div>
            <div className="value">{tower.in_launch}</div>
          </div>
          <div className="metric">
            <div className="label">Actions ouvertes</div>
            <div className="value">{tower.actions_open}</div>
          </div>
          <div className="metric">
            <div className="label">Escalade Direction</div>
            <div className="value">{tower.escalations?.direction ?? 0}</div>
          </div>
          <div className="metric">
            <div className="label">Escalade Manager</div>
            <div className="value">{tower.escalations?.manager ?? 0}</div>
          </div>
          <div className="metric">
            <div className="label">Alertes stock API</div>
            <div className="value">{tower.stock_alerts_count ?? 0}</div>
          </div>
        </div>
      )}

      {tower && (tower.escalation_actions?.length ?? 0) > 0 && (
        <div className="panel">
          <h2>Escalades SLA (§9)</h2>
          <p className="muted">
            J-2 rappel · J+1 overdue · J+3 manager · J+7 Direction
          </p>
          <table className="table">
            <thead>
              <tr>
                <th>Marque</th>
                <th>Action</th>
                <th>Owner</th>
                <th>Échéance</th>
                <th>Niveau</th>
              </tr>
            </thead>
            <tbody>
              {tower.escalation_actions!.map((a) => (
                <tr key={a.id}>
                  <td>
                    <Link to={`/brands/${a.brand_id}`}>{a.brand_code}</Link>
                  </td>
                  <td>
                    {a.code} — {a.title}
                  </td>
                  <td>{a.owner_role}</td>
                  <td>{a.due_date}</td>
                  <td>
                    <span className={`status ${a.escalation_level}`}>{a.escalation_level}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tower && tower.critical_brands.length > 0 && (
        <div className="panel">
          <h2>Alertes Health Score</h2>
          <p>{tower.critical_brands.join(' · ')}</p>
        </div>
      )}

      {tower && (tower.stock_alerts?.length ?? 0) > 0 && (
        <div className="panel">
          <h2>Alertes stock (API FGT)</h2>
          <table className="table">
            <thead>
              <tr>
                <th>Marque</th>
                <th>SKU=0</th>
                <th>Stock bas</th>
                <th>Stock total</th>
                <th>Sévérité</th>
              </tr>
            </thead>
            <tbody>
              {tower.stock_alerts!.slice(0, 12).map((a) => (
                <tr key={a.marque}>
                  <td>{a.marque}</td>
                  <td>{a.zero_stock}</td>
                  <td>{a.low_stock}</td>
                  <td>{Math.round(a.stock_total)}</td>
                  <td>
                    <span className={`status ${a.severity}`}>{a.severity}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {canCreateBrand(user?.role) && (
        <div className="panel">
          <h2>Nouvelle marque (opportunité)</h2>
          <form onSubmit={onCreateBrand} className="row">
            <div className="field" style={{ marginBottom: 0 }}>
              <label>Code</label>
              <input value={code} onChange={(e) => setCode(e.target.value)} required />
            </div>
            <div className="field" style={{ marginBottom: 0, flex: 1, minWidth: 160 }}>
              <label>Nom</label>
              <input value={name} onChange={(e) => setName(e.target.value)} required />
            </div>
            <div className="field" style={{ marginBottom: 0, minWidth: 140 }}>
              <label>Fournisseur</label>
              <input value={supplier} onChange={(e) => setSupplier(e.target.value)} />
            </div>
            <button className="btn" type="submit" style={{ alignSelf: 'end' }}>
              Créer
            </button>
          </form>
        </div>
      )}

      <div className="panel">
        <h2>Marques suivies</h2>
        <table className="table">
          <thead>
            <tr>
              <th>Code</th>
              <th>Nom</th>
              <th>Phase</th>
              <th>Gate</th>
              <th>Lancement</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {brands.map((b) => (
              <tr key={b.id}>
                <td>
                  <strong>{b.code}</strong>
                </td>
                <td>
                  {b.name}
                  {b.supplier && <div className="muted">{b.supplier}</div>}
                </td>
                <td>{b.phase}</td>
                <td>{b.current_gate}</td>
                <td>{b.launch_date ?? '—'}</td>
                <td>
                  <Link className="btn small ghost" to={`/brands/${b.id}`}>
                    Ouvrir
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </AppShell>
  )
}
