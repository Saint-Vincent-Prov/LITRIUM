import { Navigate, Outlet, useLocation } from "react-router-dom";
import { getSession } from "../data/api";
import { useAsync } from "../lib/useAsync";
import { ErrorState, Skeleton } from "../ui/primitives";

export function RequireAuth() {
  const s = useAsync(getSession);
  const location = useLocation();
  if (s.status === "error" && !s.data) {
    return (
      <div className="auth">
        <div className="auth__card">
          <ErrorState error={s.error} onRetry={s.reload} />
        </div>
      </div>
    );
  }
  if (!s.data) {
    return (
      <div className="app" aria-busy="true">
        <Skeleton h="2.5rem" />
      </div>
    );
  }
  if (!s.data.signedIn) return <Navigate to="/bienvenue" replace state={{ from: location.pathname + location.search }} />;
  return <Outlet />;
}
