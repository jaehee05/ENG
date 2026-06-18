import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from '../contexts/useAuth'

export function ProtectedRoute({ adminOnly = false }: { adminOnly?: boolean }) {
  const { profile, loading } = useAuth()

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center text-slate-500">
        불러오는 중...
      </div>
    )
  }

  if (!profile) return <Navigate to="/login" replace />
  if (profile.status === 'pending') return <Navigate to="/pending" replace />
  if (profile.status === 'rejected') return <Navigate to="/rejected" replace />
  if (adminOnly && profile.role !== 'admin') return <Navigate to="/" replace />

  return <Outlet />
}
