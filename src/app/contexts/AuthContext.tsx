import {
  createContext,
  useContext,
  useReducer,
  useCallback,
  type ReactNode,
} from "react";
import { authService, type SignupRequest } from "../services/auth.service";

export interface User {
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
  isDemo?: boolean;
}

interface AuthState {
  user: User | null;
  token: string | null;
  isLoading: boolean;
}

type AuthAction =
  | { type: "AUTH_START" }
  | { type: "AUTH_SUCCESS"; payload: { user: User; token: string } }
  | { type: "AUTH_ERROR" }
  | { type: "LOGOUT" }
  | { type: "UPDATE_USER"; payload: Partial<User> };

export type { SignupRequest };

interface AuthContextType extends AuthState {
  login: (identifier: string, password: string) => Promise<void>;
  signup: (data: SignupRequest) => Promise<void>;
  logout: () => void;
  updateUser: (data: Partial<User>) => void;
  isAuthenticated: boolean;
}

const SESSION_KEY = "jobflow_auth";
export const POST_LOGOUT_REDIRECT_KEY = "jobflow_post_logout";

function loadSession(): { user: User | null; token: string | null } {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (raw) return JSON.parse(raw);
  } catch {
    // ignore
  }
  return { user: null, token: null };
}

function saveSession(user: User, token: string) {
  sessionStorage.setItem(SESSION_KEY, JSON.stringify({ user, token }));
  sessionStorage.removeItem(POST_LOGOUT_REDIRECT_KEY);
}

function clearSession() {
  sessionStorage.removeItem(SESSION_KEY);
}

const session = loadSession();

const initialState: AuthState = {
  user: session.user,
  token: session.token,
  isLoading: false,
};

function reducer(state: AuthState, action: AuthAction): AuthState {
  switch (action.type) {
    case "AUTH_START":
      return { ...state, isLoading: true };
    case "AUTH_SUCCESS":
      return {
        ...state,
        isLoading: false,
        user: action.payload.user,
        token: action.payload.token,
      };
    case "AUTH_ERROR":
      return { ...state, isLoading: false };
    case "LOGOUT":
      return { ...state, user: null, token: null, isLoading: false };
    case "UPDATE_USER":
      if (!state.user) return state;
      return { ...state, user: { ...state.user, ...action.payload } };
    default:
      return state;
  }
}

export const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initialState);

  const login = useCallback(async (identifier: string, password: string) => {
    dispatch({ type: "AUTH_START" });
    try {
      const { token, user } = await authService.login({ identifier, password });
      saveSession(user as User, token);
      dispatch({ type: "AUTH_SUCCESS", payload: { user: user as User, token } });
    } catch (err) {
      dispatch({ type: "AUTH_ERROR" });
      throw err;
    }
  }, []);

  const signup = useCallback(async (data: SignupRequest) => {
    dispatch({ type: "AUTH_START" });
    try {
      const { token, user } = await authService.signup(data);
      saveSession(user as User, token);
      dispatch({ type: "AUTH_SUCCESS", payload: { user: user as User, token } });
    } catch (err) {
      dispatch({ type: "AUTH_ERROR" });
      throw err;
    }
  }, []);

  const logout = useCallback(() => {
    authService.logout(); // fire-and-forget to revoke server session
    sessionStorage.setItem(POST_LOGOUT_REDIRECT_KEY, "1");
    clearSession();
    dispatch({ type: "LOGOUT" });
  }, []);

  const updateUser = useCallback((data: Partial<User>) => {
    dispatch({ type: "UPDATE_USER", payload: data });
    const current = loadSession();
    if (current.user && current.token) {
      saveSession({ ...current.user, ...data }, current.token);
    }
  }, []);

  return (
    <AuthContext.Provider
      value={{
        ...state,
        login,
        signup,
        logout,
        updateUser,
        isAuthenticated: !!state.user && !!state.token,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextType {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
