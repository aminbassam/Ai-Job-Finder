# Ai-Job-Finder
What was completed
Authentication System
AuthContext.tsx — React context with login, signup, logout, updateUser. User state persists in sessionStorage (more secure than localStorage — cleared on tab close). Token is attached automatically to all future API calls.
API Service Layer
api.ts — Base HTTP client with Bearer token injection, automatic 401 redirect to login, and typed get/post/put/patch/delete methods. Swap VITE_API_URL env var to point at a real backend.
auth.service.ts — Auth endpoints: login, signup, logout, forgotPassword, resetPassword. Currently mock; each function has the real api.post() call commented in.
jobs.service.ts — Jobs endpoints with filtering, scoring, resume generation, cover letter generation.
Auth Pages
Login.tsx — React Hook Form validation, show/hide password toggle, inline field errors, server error banner, loading spinner, redirects back to the page the user was trying to reach.
Signup.tsx — Full validation, password confirmation field, password strength meter (Weak / Fair / Good / Strong), feature benefits strip.
ForgotPassword.tsx — New page with email form + success state showing the submitted email.
Route Protection
ProtectedRoute.tsx — ProtectedRoute (requires auth, saves from for post-login redirect) + GuestRoute (redirects authenticated users away from auth pages).
routes.tsx — All app routes wrapped in ProtectedRoute, all auth routes wrapped in GuestRoute, catch-all * → /.
Sidebar
AppSidebar.tsx — Now shows real user name, initials avatar, dynamic AI credit count from auth context, and a logout button (red hover, redirects to login).