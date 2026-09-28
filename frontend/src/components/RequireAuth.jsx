import { Navigate } from "react-router-dom";
import { useAuth } from "@/lib/useAuth";

export default function RequireAuth({ children, adminOnly = false }) {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F8FAFC]" data-testid="auth-loading">
        <div className="h-8 w-8 rounded-full border-2 border-slate-200 border-t-[#1D4ED8] animate-spin" />
      </div>
    );
  }
  if (!user) return <Navigate to="/login" replace />;
  if (adminOnly && user.role !== "admin") return <Navigate to="/dashboard" replace />;
  return children;
}
