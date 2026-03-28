import { createBrowserRouter, Navigate } from "react-router";
import { RootLayout } from "./components/layouts/RootLayout";
import { ProtectedRoute, GuestRoute } from "./components/auth/ProtectedRoute";
import { Dashboard } from "./pages/Dashboard";
import { JobAgent } from "./pages/JobAgent";
import { JobBoard } from "./pages/JobBoard";
import { JobDetail } from "./pages/JobDetail";
import { Resume } from "./pages/Resume";
import { ResumeVault } from "./pages/ResumeVault";
import { Applications } from "./pages/Applications";
import { Analytics } from "./pages/Analytics";
import { Settings } from "./pages/Settings";
import { Login } from "./pages/auth/Login";
import { Signup } from "./pages/auth/Signup";
import { ForgotPassword } from "./pages/auth/ForgotPassword";
import { VerifyEmail } from "./pages/auth/VerifyEmail";
import { AdminUsers } from "./pages/admin/AdminUsers";

export const router = createBrowserRouter([
  /* ── Auth routes (redirect to dashboard if already logged in) ── */
  {
    path: "/auth/login",
    element: (
      <GuestRoute>
        <Login />
      </GuestRoute>
    ),
  },
  {
    path: "/auth/signup",
    element: (
      <GuestRoute>
        <Signup />
      </GuestRoute>
    ),
  },
  {
    path: "/auth/forgot-password",
    element: (
      <GuestRoute>
        <ForgotPassword />
      </GuestRoute>
    ),
  },
  {
    // Standalone — VerifyEmail handles its own auth checks internally
    path: "/auth/verify-email",
    element: <VerifyEmail />,
  },

  /* ── App routes (redirect to login if not logged in) ── */
  {
    path: "/",
    element: (
      <ProtectedRoute>
        <RootLayout />
      </ProtectedRoute>
    ),
    children: [
      { index: true, Component: Dashboard },
      { path: "agent",  Component: JobAgent   },
      { path: "jobs", Component: JobBoard },
      { path: "jobs/:id", Component: JobDetail },
      { path: "resume",  Component: Resume     },
      { path: "resumes", Component: ResumeVault },
      { path: "applications", Component: Applications },
      { path: "analytics", Component: Analytics },
      { path: "settings", Component: Settings },
      { path: "admin/users", Component: AdminUsers },
    ],
  },

  /* ── Catch-all ── */
  {
    path: "*",
    element: <Navigate to="/" replace />,
  },
]);
