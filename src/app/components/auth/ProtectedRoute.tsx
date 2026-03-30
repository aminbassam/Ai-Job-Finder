import { Navigate, useLocation } from "react-router";
import { POST_LOGOUT_REDIRECT_KEY, useAuth } from "../../contexts/AuthContext";

interface ProtectedRouteProps {
  children: React.ReactNode;
}

/**
 * Wraps any route that requires authentication.
 * Unauthenticated users are redirected to /auth/login and the original
 * destination is preserved in location state so the user is returned there
 * after a successful login.
 */
export function ProtectedRoute({ children }: ProtectedRouteProps) {
  const { isAuthenticated, user } = useAuth();
  const location = useLocation();
  const signedOutIntentionally = sessionStorage.getItem(POST_LOGOUT_REDIRECT_KEY) === "1";

  if (!isAuthenticated) {
    return (
      <Navigate
        to="/auth/login"
        state={signedOutIntentionally ? undefined : { from: location.pathname }}
        replace
      />
    );
  }

  // Authenticated but email not verified — gate them to the verify page
  if (user && !user.emailVerified) {
    return <Navigate to="/auth/verify-email" replace />;
  }

  return <>{children}</>;
}

/**
 * Wraps auth pages (login, signup) so that already-authenticated users are
 * redirected away instead of seeing those pages.
 */
export function GuestRoute({ children }: ProtectedRouteProps) {
  const { isAuthenticated, user } = useAuth();
  const location = useLocation();
  const signedOutIntentionally = sessionStorage.getItem(POST_LOGOUT_REDIRECT_KEY) === "1";
  const from = signedOutIntentionally
    ? "/"
    : (location.state as { from?: string } | null)?.from ?? "/";

  if (isAuthenticated) {
    // Unverified users go to verification, not the app
    const redirectTo = user && !user.emailVerified ? "/auth/verify-email" : from;
    return <Navigate to={redirectTo} replace />;
  }

  return <>{children}</>;
}

export function AdminRoute({ children }: ProtectedRouteProps) {
  const { isAuthenticated, user } = useAuth();
  const location = useLocation();
  const signedOutIntentionally = sessionStorage.getItem(POST_LOGOUT_REDIRECT_KEY) === "1";

  if (!isAuthenticated) {
    return (
      <Navigate
        to="/auth/login"
        state={signedOutIntentionally ? undefined : { from: location.pathname }}
        replace
      />
    );
  }

  if (user && !user.emailVerified) {
    return <Navigate to="/auth/verify-email" replace />;
  }

  if (!user?.isAdmin) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}
