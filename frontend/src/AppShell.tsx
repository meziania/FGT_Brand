import { Link, NavLink } from 'react-router-dom'
import type { ReactNode } from 'react'
import { useAuth } from './auth'

/** Fournit le cadre commun des pages authentifiées avec navigation, en-tête et zone de contenu. */
export function AppShell({
  title,
  subtitle,
  children,
}: {
  title?: ReactNode
  subtitle?: string
  children: ReactNode
}) {
  const { user, logout } = useAuth()

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand-mark">
          <strong>FGT Launch Control Tower</strong>
          <span>{subtitle ?? 'Food Group Trading · nouvelles marques'}</span>
        </div>
        <nav className="nav-links">
          <NavLink to="/" end>
            Control Tower
          </NavLink>
          <NavLink to="/routines">Routines</NavLink>
          <NavLink to="/catalog">Catalogue API</NavLink>
        </nav>
        <div className="topbar-actions">
          <span className="role-chip">{user?.role}</span>
          <span className="muted-light">{user?.full_name}</span>
          <button className="btn ghost small" type="button" onClick={logout}>
            Déconnexion
          </button>
        </div>
      </header>
      <main className="page">
        {title && <div className="hero">{title}</div>}
        {children}
      </main>
    </div>
  )
}

/** Affiche un lien de retour vers la Control Tower depuis les pages de détail. */
export function BackLink() {
  return (
    <Link className="back-link" to="/">
      ← Control Tower
    </Link>
  )
}
