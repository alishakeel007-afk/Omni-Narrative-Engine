"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState
} from "react";

export type AuthUser = {
  displayName: string;
  email: string;
  emailVerified: true;
  uid: string;
};

type StoredAuthUser = {
  createdAt: string;
  displayName: string;
  email: string;
  password: string;
  uid: string;
};

type AuthContextValue = {
  currentUser: AuthUser | null;
  forgotPassword: (email: string) => Promise<void>;
  loading: boolean;
  login: (email: string, password: string) => Promise<AuthUser>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<AuthUser | null>;
  sendVerificationEmail: () => Promise<void>;
  signup: (fullName: string, email: string, password: string) => Promise<AuthUser>;
};

const USERS_STORAGE_KEY = "omni-auth-users";
const SESSION_STORAGE_KEY = "omni-auth-session";

const AuthContext = createContext<AuthContextValue | null>(null);

function readStoredUsers() {
  if (typeof window === "undefined") {
    return [] as StoredAuthUser[];
  }

  try {
    const rawValue = window.localStorage.getItem(USERS_STORAGE_KEY);
    return rawValue ? (JSON.parse(rawValue) as StoredAuthUser[]) : [];
  } catch {
    return [];
  }
}

function writeStoredUsers(users: StoredAuthUser[]) {
  window.localStorage.setItem(USERS_STORAGE_KEY, JSON.stringify(users));
}

function readStoredSession() {
  if (typeof window === "undefined") {
    return null as AuthUser | null;
  }

  try {
    const rawValue = window.localStorage.getItem(SESSION_STORAGE_KEY);
    return rawValue ? (JSON.parse(rawValue) as AuthUser) : null;
  } catch {
    return null;
  }
}

function writeStoredSession(user: AuthUser | null) {
  if (user) {
    window.localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(user));
    return;
  }

  window.localStorage.removeItem(SESSION_STORAGE_KEY);
}

function toAuthUser(user: StoredAuthUser): AuthUser {
  return {
    displayName: user.displayName,
    email: user.email,
    emailVerified: true,
    uid: user.uid
  };
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const savedSession = readStoredSession();
    setCurrentUser(savedSession);
    setLoading(false);
  }, []);

  const signup = async (fullName: string, email: string, password: string) => {
    const normalizedEmail = email.trim().toLowerCase();
    const normalizedName = fullName.trim();
    const users = readStoredUsers();
    const existingUser = users.find((user) => user.email.toLowerCase() === normalizedEmail);

    if (existingUser) {
      throw new Error("This email is already registered. Try logging in instead.");
    }

    const createdUser: StoredAuthUser = {
      createdAt: new Date().toISOString(),
      displayName: normalizedName,
      email: normalizedEmail,
      password,
      uid: `omni-user-${Date.now()}`
    };

    const nextUsers = [...users, createdUser];
    writeStoredUsers(nextUsers);

    const sessionUser = toAuthUser(createdUser);
    writeStoredSession(sessionUser);
    setCurrentUser(sessionUser);
    return sessionUser;
  };

  const login = async (email: string, password: string) => {
    const normalizedEmail = email.trim().toLowerCase();
    const users = readStoredUsers();
    const matchedUser = users.find((user) => user.email.toLowerCase() === normalizedEmail);

    if (!matchedUser || matchedUser.password !== password) {
      throw new Error("Incorrect email or password.");
    }

    const sessionUser = toAuthUser(matchedUser);
    writeStoredSession(sessionUser);
    setCurrentUser(sessionUser);
    return sessionUser;
  };

  const logout = async () => {
    writeStoredSession(null);
    setCurrentUser(null);
  };

  const forgotPassword = async (email: string) => {
    const normalizedEmail = email.trim().toLowerCase();
    const users = readStoredUsers();
    const matchedUser = users.find((user) => user.email.toLowerCase() === normalizedEmail);

    if (!matchedUser) {
      return;
    }
  };

  const refreshUser = async () => {
    const savedSession = readStoredSession();
    setCurrentUser(savedSession);
    return savedSession;
  };

  const sendVerificationEmail = async () => {
    return;
  };

  const value = useMemo<AuthContextValue>(
    () => ({
      currentUser,
      forgotPassword,
      loading,
      login,
      logout,
      refreshUser,
      sendVerificationEmail,
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
