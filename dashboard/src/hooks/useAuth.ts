// Lightweight client-side auth for AttenRider demo.
// TODO: Replace with Supabase Auth (supabase.auth.signInWithPassword, onAuthStateChange).
import { useEffect, useState, useCallback } from 'react';
import { users, type AppUser, type UserRole } from '../services/mockData';

const STORAGE_KEY = 'attenrider.session.v1';

export type Role = Extract<UserRole, 'admin' | 'hr' | 'rider' | 'payroll'>;

export interface Session {
  userId: string;
  role: Role;
}

interface AuthState {
  session: Session | null;
  user: AppUser | null;
}

function readSession(): Session | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Session;
    if (!parsed?.userId || !parsed?.role) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeSession(s: Session | null) {
  if (typeof window === 'undefined') return;
  if (s) window.localStorage.setItem(STORAGE_KEY, JSON.stringify(s));else
  window.localStorage.removeItem(STORAGE_KEY);
}

// Module-level listeners so all hook consumers stay in sync.
const listeners = new Set<(s: Session | null) => void>();
let currentSession: Session | null = readSession();

function emit() {
  listeners.forEach((l) => l(currentSession));
}

export interface SignInResult {
  ok: boolean;
  error?: string;
}

export function useAuth() {
  const [session, setSession] = useState<Session | null>(currentSession);

  useEffect(() => {
    const listener = (s: Session | null) => setSession(s);
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }, []);

  const user: AppUser | null = session ?
  users.find((u) => u.id === session.userId) ?? null :
  null;

  const signIn = useCallback(
    async (email: string, password: string): Promise<SignInResult> => {
      // Demo auth: match email, accept any non-empty password.
      // TODO: Replace with supabase.auth.signInWithPassword({ email, password }).
      const found = users.find(
        (u) => u.email.toLowerCase() === email.trim().toLowerCase()
      );
      if (!found)
      return { ok: false, error: 'No account found for that email.' };
      if (!password) return { ok: false, error: 'Password is required.' };
      if (
      found.role !== 'admin' &&
      found.role !== 'hr' &&
      found.role !== 'rider' &&
      found.role !== 'payroll')
      {
        return {
          ok: false,
          error: 'Only Admin, HR, Rider, and Payroll accounts can sign in.'
        };
      }
      if (found.status === 'suspended') {
        return { ok: false, error: 'This account is suspended.' };
      }
      const next: Session = { userId: found.id, role: found.role as Role };
      currentSession = next;
      writeSession(next);
      emit();
      return { ok: true };
    },
    []
  );

  const signOut = useCallback(() => {
    currentSession = null;
    writeSession(null);
    emit();
  }, []);

  const state: AuthState & {
    signIn: typeof signIn;
    signOut: typeof signOut;
  } = {
    session,
    user,
    signIn,
    signOut
  };
  return state;
}