"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState
} from "react";
import { createClient } from "@/lib/supabase/client";

export type AuthUser = {
  id: string;
  name: string;
  email: string;
};

type AuthContextValue = {
  currentUser: AuthUser | null;
  forgotPassword: (email: string) => Promise<void>;
  resetPassword: (newPassword: string) => Promise<void>;
  loading: boolean;
  login: (email: string, password: string) => Promise<AuthUser>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<AuthUser | null>;
  signup: (fullName: string, email: string, password: string) => Promise<AuthUser>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const supabase = createClient();

  const refreshUser = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const authUser: AuthUser = {
          id: user.id,
          name: user.user_metadata?.full_name || "User",
          email: user.email || ""
        };
        setCurrentUser(authUser);
        return authUser;
      }
      setCurrentUser(null);
      return null;
    } catch (error) {
      setCurrentUser(null);
      return null;
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refreshUser();
    
    const { data: { subscription } } = supabase.auth.onAuthStateChange(() => {
      refreshUser();
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  const signup = async (name: string, email: string, password: string) => {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: name,
        }
      }
    });

    if (error) throw error;
    if (!data.user) throw new Error("Signup failed");

    const authUser: AuthUser = {
      id: data.user.id,
      name: data.user.user_metadata?.full_name || name,
      email: data.user.email || email
    };
    
    setCurrentUser(authUser);
    return authUser;
  };

  const login = async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) throw error;
    if (!data.user) throw new Error("Login failed");

    const authUser: AuthUser = {
      id: data.user.id,
      name: data.user.user_metadata?.full_name || "User",
      email: data.user.email || email
    };
    
    setCurrentUser(authUser);
    return authUser;
  };

  const logout = async () => {
    await supabase.auth.signOut();
    setCurrentUser(null);
  };

  const forgotPassword = async (email: string) => {
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || window.location.origin;
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${appUrl}/reset-password`,
    });
    if (error) throw error;
  };

  const resetPassword = async (newPassword: string) => {
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) throw error;
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
