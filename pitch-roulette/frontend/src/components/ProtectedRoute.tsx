import { Navigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';

export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { session, loading } = useAuthStore();
  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-pitch-black text-pitch-muted">
        Loading...
      </div>
    );
  }
  if (!session) return <Navigate to="/auth/login" replace />;
  return <>{children}</>;
}
