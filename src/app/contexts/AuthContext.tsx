import {
  createContext,
  useContext,
  useReducer,
  useCallback,
  type ReactNode,
} from "react";

export interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  plan: "free" | "pro" | "agency";
  aiCredits: number;
  totalCredits: number;
  location?: string;
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

export interface SignupData {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
}

interface AuthContextType extends AuthState {
  login: (email: string, password: string) => Promise<void>;
  signup: (data: SignupData) => Promise<void>;
  logout: () => void;
  updateUser: (data: Partial<User>) => void;
  isAuthenticated: boolean;
}

const SESSION_KEY = "jobflow_auth";

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

  const login = useCallback(async (email: string, password: string) => {
    dispatch({ type: "AUTH_START" });
    try {
      // Simulates POST /api/auth/login — replace body with api.post() for real backend
      await new Promise((resolve) => setTimeout(resolve, 800));

      if (!email || password.length < 8) {
        throw new Error("Invalid email or password.");
      }

      const user: User = {
        id: crypto.randomUUID(),
        email,
        firstName: "John",
        lastName: "Doe",
        plan: "pro",
        aiCredits: 750,
        totalCredits: 1000,
        location: "San Francisco, CA",
      };
      const token = `jwt_${Date.now()}_${crypto.randomUUID()}`;

      saveSession(user, token);
      dispatch({ type: "AUTH_SUCCESS", payload: { user, token } });
    } catch (err) {
      dispatch({ type: "AUTH_ERROR" });
      throw err;
    }
  }, []);

  const signup = useCallback(async (data: SignupData) => {
    dispatch({ type: "AUTH_START" });
    try {
      // Simulates POST /api/auth/signup — replace with api.post() for real backend
      await new Promise((resolve) => setTimeout(resolve, 1000));

      const user: User = {
        id: crypto.randomUUID(),
        email: data.email,
        firstName: data.firstName,
        lastName: data.lastName,
        plan: "free",
        aiCredits: 100,
        totalCredits: 100,
      };
      const token = `jwt_${Date.now()}_${crypto.randomUUID()}`;

      saveSession(user, token);
      dispatch({ type: "AUTH_SUCCESS", payload: { user, token } });
    } catch (err) {
      dispatch({ type: "AUTH_ERROR" });
      throw err;
    }
  }, []);

  const logout = useCallback(() => {
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
