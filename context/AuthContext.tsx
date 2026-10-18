"use client";

import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { AuthChangeEvent, Session, User } from "@supabase/supabase-js";
import { getSafeRedirectPath } from "@/lib/auth-redirect";
import { createClient } from "@/lib/supabase/client";

export type AuthUser = { id: string; name: string; email: string };
type AuthContextValue = {
  currentUser: AuthUser | null; forgotPassword: (email: string) => Promise<void>; resetPassword: (newPassword: string) => Promise<void>;
  loading: boolean; login: (email: string, password: string) => Promise<AuthUser>; logout: () => Promise<void>;
  refreshUser: () => Promise<AuthUser | null>; signup: (fullName: string, email: string, password: string, nextPath?: string) => Promise<AuthUser | null>;
};
const AuthContext = createContext<AuthContextValue | null>(null);
function toAuthUser(user: User): AuthUser { return { id: user.id, name: user.user_metadata?.full_name || "User", email: user.email || "" }; }

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const supabase = useMemo(() => createClient(), []);
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const currentUserRef = useRef<AuthUser | null>(null);
  const setUser = (user: AuthUser | null) => { currentUserRef.current = user; setCurrentUser(user); };

  const refreshUser = async () => {
    const { data: { user }, error } = await supabase.auth.getUser();
    if (user) { const next = toAuthUser(user); setUser(next); setLoading(false); return next; }
    // Network/refresh failures are not a sign-out. Retain the established UI
    // session so ProtectedRoute cannot discard unsaved work during a retry.
    if (error && currentUserRef.current) { setLoading(false); return currentUserRef.current; }
    setUser(null); setLoading(false); return null;
  };

  useEffect(() => {
    void refreshUser();
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event: AuthChangeEvent, session: Session | null) => {
      if (event === "SIGNED_OUT") { setUser(null); setLoading(false); return; }
      if (session?.user) { setUser(toAuthUser(session.user)); setLoading(false); return; }
      if (event === "INITIAL_SESSION") { setUser(null); setLoading(false); }
      // TOKEN_REFRESHED with no session is deliberately not treated as logout;
      // Supabase will emit SIGNED_OUT for an actual revoked/cleared session.
    });
    return () => subscription.unsubscribe();
  }, [supabase]);

  const signup = async (
    name: string,
    email: string,
    password: string,
    nextPath?: string,
  ) => {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${window.location.origin}${getSafeRedirectPath(nextPath)}`,
        data: {
          full_name: name,
        },
      },
    });

    if (error) throw error;
    if (!data.user) throw new Error("Signup failed");
    if (!data.session) return null;

    const authUser: AuthUser = {
      id: data.user.id,
      name: data.user.user_metadata?.full_name || name,
      email: data.user.email || email,
    };

    setUser(authUser);
    return authUser;
  };

  const login = async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error; if (!data.user) throw new Error("Login failed"); const user = toAuthUser(data.user); setUser(user); return user;
  };
  const logout = async () => { const { error } = await supabase.auth.signOut(); if (error) throw error; setUser(null); };
  const forgotPassword = async (email: string) => { const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${process.env.NEXT_PUBLIC_APP_URL || window.location.origin}/reset-password` }); if (error) throw error; };
  const resetPassword = async (newPassword: string) => { const { error } = await supabase.auth.updateUser({ password: newPassword }); if (error) throw error; };
  const value = useMemo<AuthContextValue>(() => ({ currentUser, forgotPassword, resetPassword, loading, login, logout, refreshUser, signup }), [currentUser, loading]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
export function useAuth() { const context = useContext(AuthContext); if (!context) throw new Error("useAuth must be used within AuthProvider"); return context; }
