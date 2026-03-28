/**
 * Auth service
 *
 * Wraps all authentication API endpoints. Currently uses mock responses so
 * the frontend works without a backend. Replace each function body with the
 * commented-out api call when a real backend is available.
 *
 * Real endpoints (see architecture doc §11):
 *   POST /api/auth/signup
 *   POST /api/auth/login
 *   POST /api/auth/logout
 *   POST /api/auth/forgot-password
 *   POST /api/auth/reset-password
 */

// import { api } from "./api";

export interface LoginRequest {
  email: string;
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
    firstName: string;
    lastName: string;
    plan: "free" | "pro" | "agency";
    aiCredits: number;
    totalCredits: number;
  };
}

export const authService = {
  login: async (_data: LoginRequest): Promise<AuthResponse> => {
    // return api.post<AuthResponse>("/auth/login", data);
    await delay(800);
    return mockAuthResponse(_data.email);
  },

  signup: async (_data: SignupRequest): Promise<AuthResponse> => {
    // return api.post<AuthResponse>("/auth/signup", data);
    await delay(1000);
    return mockAuthResponse(_data.email, _data.firstName, _data.lastName, "free");
  },

  logout: async (): Promise<void> => {
    // return api.post<void>("/auth/logout", {});
    await delay(200);
  },

  forgotPassword: async (_data: ForgotPasswordRequest): Promise<{ message: string }> => {
    // return api.post<{ message: string }>("/auth/forgot-password", data);
    await delay(700);
    return { message: "Password reset instructions sent to your email." };
  },

  resetPassword: async (_data: ResetPasswordRequest): Promise<{ message: string }> => {
    // return api.post<{ message: string }>("/auth/reset-password", data);
    await delay(700);
    return { message: "Password has been reset successfully." };
  },
};

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function mockAuthResponse(
  email: string,
  firstName = "John",
  lastName = "Doe",
  plan: "free" | "pro" | "agency" = "pro"
): AuthResponse {
  return {
    token: `jwt_${Date.now()}_${Math.random().toString(36).slice(2)}`,
    user: {
      id: crypto.randomUUID(),
      email,
      firstName,
      lastName,
      plan,
      aiCredits: plan === "free" ? 100 : 750,
      totalCredits: plan === "free" ? 100 : 1000,
    },
  };
}
