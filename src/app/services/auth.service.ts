/**
 * Auth service — real API calls.
 * All requests go through the shared api client which attaches the Bearer
 * token and handles 401 redirects automatically.
 *
 * Endpoints (backend/src/routes/auth.ts):
 *   POST /api/auth/signup
 *   POST /api/auth/login
 *   POST /api/auth/logout
 *   POST /api/auth/forgot-password
 *   POST /api/auth/reset-password
 */
import { api } from "./api";

export interface LoginRequest {
  identifier: string;
  password: string;
}

export interface SignupRequest {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
}

export interface ForgotPasswordRequest {
  email: string;
}

export interface ResetPasswordRequest {
  token: string;
  password: string;
}

export interface AuthResponse {
  token: string;
  user: {
    id: string;
    email: string;
    username?: string;
    firstName: string;
    lastName: string;
    plan: "free" | "pro" | "agency";
    aiCredits: number;
    totalCredits: number;
    location?: string;
    emailVerified: boolean;
    isAdmin: boolean;
  };
}

export const authService = {
  login: (data: LoginRequest): Promise<AuthResponse> =>
    api.post<AuthResponse>("/auth/login", { identifier: data.identifier, password: data.password }),

  signup: (data: SignupRequest): Promise<AuthResponse> =>
    api.post<AuthResponse>("/auth/signup", data),

  logout: (): Promise<void> =>
    api.post<void>("/auth/logout", {}).catch(() => {}),

  forgotPassword: (data: ForgotPasswordRequest): Promise<{ message: string }> =>
    api.post<{ message: string }>("/auth/forgot-password", data),

  resetPassword: (data: ResetPasswordRequest): Promise<{ message: string }> =>
    api.post<{ message: string }>("/auth/reset-password", data),

  sendVerification: (): Promise<{ message: string }> =>
    api.post<{ message: string }>("/auth/send-verification", {}),

  verifyEmail: (code: string): Promise<{ user: AuthResponse["user"] }> =>
    api.post<{ user: AuthResponse["user"] }>("/auth/verify-email", { code }),

  changePassword: (data: { currentPassword: string; newPassword: string }): Promise<{ message: string }> =>
    api.patch<{ message: string }>("/auth/change-password", data),
};
