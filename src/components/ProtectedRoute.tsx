import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from '../contexts/useAuth'

export function ProtectedRoute({ adminOnly = false }: { adminOnly?: boolean }) {
  const { user, profile, loading } = useAuth()

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center text-slate-500">
        불러오는 중...
      </div>
    )
  }

  if (!user) return <Navigate to="/login" replace />
  if (adminOnly && profile?.role !== 'admin') return <Navigate to="/" replace />

  return <Outlet />
}
