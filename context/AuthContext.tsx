"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState
} from "react";

export type AuthUser = {
  id: string;
  name: string;
  email: string;
};

type AuthContextValue = {
  currentUser: AuthUser | null;
  forgotPassword: (email: string) => Promise<void>;
  resetPassword: (token: string, userId: string, newPassword: string, confirmPassword: string) => Promise<void>;
  loading: boolean;
  login: (email: string, password: string) => Promise<AuthUser>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<AuthUser | null>;
  signup: (fullName: string, email: string, password: string, confirmPassword: string) => Promise<AuthUser>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

async function readJsonResponse(response: Response) {
  const text = await response.text();

  if (!text) {
    return {};
  }

  try {
    return JSON.parse(text) as { error?: string; user?: AuthUser };
  } catch {
    throw new Error(
      response.ok
        ? "Authentication server returned an invalid response."
        : `Authentication route returned ${response.status}. Please rebuild and restart the app.`
    );
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshUser = async () => {
    try {
      const response = await fetch("/api/auth/me");
      const data = await readJsonResponse(response);

      if (response.ok) {
        setCurrentUser(data.user ?? null);
        return data.user ?? null;
      } else {
        setCurrentUser(null);
        return null;
      }
    } catch (error) {
      setCurrentUser(null);
      return null;
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refreshUser();
  }, []);

  const signup = async (name: string, email: string, password: string, confirmPassword: string) => {
    const response = await fetch("/api/auth/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, email, password, confirmPassword })
    });
    const data = await readJsonResponse(response);
    if (!response.ok) {
      throw new Error(data.error || "Signup failed");
    }

    if (!data.user) {
      throw new Error("Signup response did not include a user.");
    }

    setCurrentUser(data.user);
    return data.user;
  };

  const login = async (email: string, password: string) => {
    const response = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password })
    });

    const data = await readJsonResponse(response);
    if (!response.ok) {
      throw new Error(data.error || "Login failed");
    }

    if (!data.user) {
      throw new Error("Login response did not include a user.");
    }

    setCurrentUser(data.user);
    return data.user;
  };

  const logout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    setCurrentUser(null);
  };

  const forgotPassword = async (email: string) => {
    const response = await fetch("/api/auth/request-password-reset", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email })
    });

    const data = await readJsonResponse(response);
    if (!response.ok) {
      throw new Error(data.error || "Failed to request password reset");
    }
  };

  const resetPassword = async (token: string, userId: string, newPassword: string, confirmPassword: string) => {
    const response = await fetch("/api/auth/reset-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, userId, newPassword, confirmPassword })
    });

    const data = await readJsonResponse(response);
    if (!response.ok) {
      throw new Error(data.error || "Failed to reset password");
    }
  };

  const value = useMemo<AuthContextValue>(
    () => ({
      currentUser,
      forgotPassword,
      resetPassword,
      loading,
      login,
      logout,
      refreshUser,
      signup
    }),
    [currentUser, loading]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error("useAuth must be used within AuthProvider");
  }

  return context;
}
