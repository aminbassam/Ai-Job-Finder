import { createBrowserRouter, Navigate } from "react-router";
import { RootLayout } from "./components/layouts/RootLayout";
import { ProtectedRoute, GuestRoute, AdminRoute } from "./components/auth/ProtectedRoute";
import { Dashboard } from "./pages/Dashboard";
import { JobAgent } from "./pages/JobAgent";
import { JobBoard } from "./pages/JobBoard";
import { JobDetail } from "./pages/JobDetail";
import { Resume } from "./pages/Resume";
import { CoverLetters } from "./pages/CoverLetters";
import { Applications } from "./pages/Applications";
import { Analytics } from "./pages/Analytics";
import { Updates } from "./pages/Updates";
import { Settings } from "./pages/Settings";
import { Login } from "./pages/auth/Login";
import { Signup } from "./pages/auth/Signup";
import { ForgotPassword } from "./pages/auth/ForgotPassword";
import { VerifyEmail } from "./pages/auth/VerifyEmail";
import { AdminUsers } from "./pages/admin/AdminUsers";
import { AdminUserDetail } from "./pages/admin/AdminUserDetail";
import { PlatformLogs } from "./pages/admin/PlatformLogs";

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
      { path: "cover-letters", Component: CoverLetters },
      { path: "resume",  Component: Resume     },
      { path: "resumes", element: <Navigate to="/jobs" replace /> },
      { path: "applications", Component: Applications },
      { path: "analytics", Component: Analytics },
      {
        path: "updates",
        element: (
          <AdminRoute>
            <Updates />
          </AdminRoute>
        ),
      },
      { path: "settings", Component: Settings },
      {
        path: "admin/users",
        element: (
          <AdminRoute>
            <AdminUsers />
          </AdminRoute>
        ),
      },
      {
        path: "admin/users/:id",
        element: (
          <AdminRoute>
            <AdminUserDetail />
          </AdminRoute>
        ),
      },
      {
        path: "admin/logs",
        element: (
          <AdminRoute>
            <PlatformLogs />
          </AdminRoute>
        ),
      },
    ],
  },

  /* ── Catch-all ── */
  {
    path: "*",
    element: <Navigate to="/" replace />,
  },
]);
