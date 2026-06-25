import { useEffect, useState, useCallback, useMemo } from "react";
import { supabase } from "../lib/supabaseClient";
import { type AppUser, type UserRole } from "../services/types";
import { pushToast } from "./useToast";
import { fetchIpLocation, logActivity } from "../lib/apiService";

const STORAGE_KEY = "attenrider.session.v1";

export type Role = Extract<UserRole, "admin" | "hr" | "rider" | "payroll">;

export interface Session {
  id: string;
  email: string;
  fullName: string;
  role: Role;
  riderId?: string;
}

function readSession(): Session | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Session;
    if (!parsed?.id || !parsed?.role) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeSession(s: Session | null) {
  if (typeof window === "undefined") return;
  if (s) window.localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  else window.localStorage.removeItem(STORAGE_KEY);
}

// Module-level listeners so all hook consumers stay in sync.
const listeners = new Set<(s: Session | null) => void>();
let currentSession: Session | null = readSession();

function emit() {
  listeners.forEach((l) => l(currentSession));
}

// Listen for profile updates to keep session synchronized with database in real-time
if (typeof window !== "undefined") {
  window.addEventListener("profile-updated", async () => {
    if (!currentSession) return;
    try {
      const { data: profile, error } = await supabase
        .from("users")
        .select("full_name, role, status, rider_id")
        .eq("id", currentSession.id)
        .single();

      if (!error && profile) {
        const { data: { session: supabaseSession } } = await supabase.auth.getSession();
        const next: Session = {
          id: currentSession.id,
          email: supabaseSession?.user?.email ?? currentSession.email,
          fullName: profile.full_name,
          role: profile.role as Role,
          riderId: profile.rider_id || undefined,
        };
        currentSession = next;
        writeSession(next);
        emit();
      }
    } catch (err) {
      console.error("Error refreshing session on profile-updated:", err);
    }
  });
}

export interface SignInResult {
  ok: boolean;
  error?: string;
}

export function useAuth() {
  const [session, setSession] = useState<Session | null>(currentSession);
  const [customAvatar, setCustomAvatar] = useState<string | null>(null);

  useEffect(() => {
    if (!session?.id) {
      setCustomAvatar(null);
      return;
    }
    setCustomAvatar(localStorage.getItem(`custom_avatar_${session.id}`));

    const handleAvatarUpdate = () => {
      setCustomAvatar(localStorage.getItem(`custom_avatar_${session.id}`));
    };

    window.addEventListener("avatar-updated", handleAvatarUpdate);
    window.addEventListener("storage", handleAvatarUpdate);
    return () => {
      window.removeEventListener("avatar-updated", handleAvatarUpdate);
      window.removeEventListener("storage", handleAvatarUpdate);
    };
  }, [session?.id]);

  useEffect(() => {
    const listener = (s: Session | null) => setSession(s);
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }, []);

  // Background revalidation on startup/refresh
  useEffect(() => {
    let active = true;
    async function initializeAuth() {
      try {
        const {
          data: { session: supabaseSession },
        } = await supabase.auth.getSession();

        if (!supabaseSession?.user) {
          if (currentSession !== null) {
            currentSession = null;
            writeSession(null);
            emit();
          }
          return;
        }

        // Fetch latest profile status & details
        const { data: profile, error } = await supabase
          .from("users")
          .select("full_name, role, status, rider_id")
          .eq("id", supabaseSession.user.id)
          .single();

        if (error || !profile) {
          await supabase.auth.signOut();
          currentSession = null;
          writeSession(null);
          emit();
          return;
        }

        if (profile.status === "suspended") {
          await supabase.auth.signOut();
          currentSession = null;
          writeSession(null);
          emit();
          return;
        }

        if (active) {
          const next: Session = {
            id: supabaseSession.user.id,
            email: supabaseSession.user.email ?? "",
            fullName: profile.full_name,
            role: profile.role as Role,
            riderId: profile.rider_id || undefined,
          };
          currentSession = next;
          writeSession(next);
          emit();

          // Safely record user active session timestamp
          supabase.rpc('update_my_last_login').then(({ error }) => {
            if (error) {
              console.error('[Auth] Failed to update session last login timestamp:', error);
            }
          });
        }
      } catch (err) {
        console.error("Auth initialization error:", err);
      }
    }

    initializeAuth();

    // Sync active signouts/changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, sbSession) => {
      if (event === "SIGNED_OUT" || !sbSession) {
        if (currentSession !== null) {
          currentSession = null;
          writeSession(null);
          emit();
        }
      }
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  // Adapt the user profile to match the legacy AppUser interface required by components
  const user = useMemo<AppUser | null>(() => {
    if (!session) return null;
    return {
      id: session.id,
      name: session.fullName,
      avatar: customAvatar || `https://api.dicebear.com/7.x/adventurer/svg?seed=${encodeURIComponent(session.fullName)}`,
      email: session.email,
      role: session.role,
      zoneId: null,
      status: "active",
      lastLogin: Date.now(),
    };
  }, [session, customAvatar]);

  const signIn = useCallback(
    async (email: string, password: string): Promise<SignInResult> => {
      try {
        const { data: authData, error: authError } =
          await supabase.auth.signInWithPassword({
            email: email.trim(),
            password,
          });

        if (authError || !authData.user) {
          return {
            ok: false,
            error: authError?.message || "Invalid login credentials.",
          };
        }

        const { data: profile, error: profileError } = await supabase
          .from("users")
          .select("full_name, role, status, rider_id")
          .eq("id", authData.user.id)
          .single();

        if (profileError || !profile) {
          const userId = authData.user.id;
          await supabase.auth.signOut();
          return {
            ok: false,
            error: `User profile not found in database. (UUID: ${userId})`,
          };
        }

        if (profile.status === "suspended") {
          await supabase.auth.signOut();
          return { ok: false, error: "This account is suspended." };
        }

        const next: Session = {
          id: authData.user.id,
          email: authData.user.email ?? "",
          fullName: profile.full_name,
          role: profile.role as Role,
          riderId: profile.rider_id || undefined,
        };

        currentSession = next;
        writeSession(next);
        emit();

        // Record user login timestamp in database
        const { error: loginStampErr } = await supabase.rpc('update_my_last_login');
        if (loginStampErr) {
          console.error('[Auth] Failed to update login timestamp:', loginStampErr);
        }

        // Record user IP & Location in activity_logs database table asynchronously
        fetchIpLocation().then((loc) => {
          const locationDesc = loc 
            ? `${loc.city}, ${loc.region}, ${loc.country_name} (IP: ${loc.ip}, ISP: ${loc.org})`
            : "Unknown Location";
          logActivity({
            userId: authData.user.id,
            eventType: "login",
            description: `User signed in from ${locationDesc}`,
            metadata: loc ? { ip: loc.ip, city: loc.city, region: loc.region, country: loc.country_name, org: loc.org } : {}
          });
        });

        return { ok: true };
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "An unexpected error occurred during login.";
        return {
          ok: false,
          error: message,
        };
      }
    },
    [],
  );

  const signOut = useCallback(async () => {
    try {
      await supabase.auth.signOut();
    } catch (err) {
      console.warn("SignOut warning:", err);
    }
    currentSession = null;
    writeSession(null);
    emit();
    pushToast({
      title: "Signed out",
      description: "You have been logged out successfully.",
      tone: "info"
    });
  }, []);

  const state = {
    session,
    user,
    signIn,
    signOut,
  };

  return state;
}
