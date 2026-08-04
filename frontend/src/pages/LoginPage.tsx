import { useState, type FormEvent } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../auth'

/** Affiche le formulaire de connexion et redirige les utilisateurs déjà authentifiés. */
export function LoginPage() {
  const { user, login } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  if (user) return <Navigate to="/" replace />

  /** Soumet les identifiants au contexte d'authentification et affiche l'erreur éventuelle. */
  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      await login(email, password)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Connexion impossible')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="login-page">
      <form className="login-card" onSubmit={onSubmit}>
        <h1>FGT Launch Tower</h1>
        <p>Le goût du bonheur · Pilotage Stage-Gate & Health Score</p>
        <div className="field">
          <label htmlFor="email">Email</label>
          <input
            id="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="username"
            required
          />
        </div>
        <div className="field">
          <label htmlFor="password">Mot de passe</label>
          <input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            required
          />
        </div>
        {error && <p className="error">{error}</p>}
        <button className="btn" type="submit" disabled={busy}>
          {busy ? 'Connexion…' : 'Se connecter'}
        </button>
        <div className="demo-accounts">
          <p className="muted">Comptes démo · mot de passe <code>fgt123</code></p>
          <ul>
            <li>
              <button type="button" className="linkish" onClick={() => { setEmail('dev@fgt.local'); setPassword('fgt123') }}>
                dev@fgt.local
              </button>
              — Développement (Business Owner)
            </li>
            <li>
              <button type="button" className="linkish" onClick={() => { setEmail('direction@fgt.local'); setPassword('fgt123') }}>
                direction@fgt.local
              </button>
              — Direction (G6/G7)
            </li>
            <li>
              <button type="button" className="linkish" onClick={() => { setEmail('commercial@fgt.local'); setPassword('fgt123') }}>
                commercial@fgt.local
              </button>
              — Commercial (ops)
            </li>
            <li className="muted">+ marketing / achats / supply / finance @fgt.local</li>
          </ul>
        </div>
      </form>
    </div>
  )
}
