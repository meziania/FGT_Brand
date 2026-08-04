import { Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider, useAuth } from './auth'
import { BrandDetailPage } from './pages/BrandDetailPage'
import { BrandReviewPage } from './pages/BrandReviewPage'
import { CatalogPage } from './pages/CatalogPage'
import { DashboardPage } from './pages/DashboardPage'
import { LoginPage } from './pages/LoginPage'
import { RoutinesPage } from './pages/RoutinesPage'

/** Protège une route en attendant l'état d'authentification puis redirige les visiteurs anonymes. */
function Protected({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth()
  if (loading) return <div className="login-page">Chargement…</div>
  if (!user) return <Navigate to="/login" replace />
  return children
}

/** Définit l'arborescence principale des routes et le contexte d'authentification de l'application. */
export default function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route
          path="/"
          element={
            <Protected>
              <DashboardPage />
            </Protected>
          }
        />
        <Route
          path="/routines"
          element={
            <Protected>
              <RoutinesPage />
            </Protected>
          }
        />
        <Route
          path="/catalog"
          element={
            <Protected>
              <CatalogPage />
            </Protected>
          }
        />
        <Route
          path="/brands/:brandId"
          element={
            <Protected>
              <BrandDetailPage />
            </Protected>
          }
        />
        <Route
          path="/brands/:brandId/review"
          element={
            <Protected>
              <BrandReviewPage />
            </Protected>
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AuthProvider>
  )
}
