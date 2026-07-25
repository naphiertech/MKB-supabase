import { useEffect, useState, useCallback, useMemo } from "react";
import { supabase } from "../lib/supabaseClient";
import { type AppUser, type UserRole } from "../services/types";
import { pushToast } from "./useToast";
import { fetchIpLocation, logActivity } from "../lib/apiService";
import { getDeviceIdentifier } from "../lib/deviceFingerprint";
import { getStorageAdapter } from "../lib/storage";
import { dispatchNotificationSafe } from "../services/notificationService";

const STORAGE_KEY = "attenrider.session.v1";
const TRUSTED_HASH_KEY = "attenrider_trusted_device_hash";

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

/**
 * Dual storage helper to save the trusted device fingerprint hash.
 */
async function saveTrustedDeviceHashLocally(hash: string): Promise<void> {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(TRUSTED_HASH_KEY, hash);
    const storage = getStorageAdapter();
    await storage.setItem(TRUSTED_HASH_KEY, hash);
  } catch (err) {
    console.debug("[Auth] Failed to mirror trusted device hash:", err);
  }
}

/**
 * Dual storage helper to read the stored trusted device fingerprint hash.
 */
async function getStoredTrustedDeviceHashLocally(): Promise<string | null> {
  if (typeof window === "undefined") return null;
  const localHash = window.localStorage.getItem(TRUSTED_HASH_KEY);
  let dexieHash: string | null = null;
  try {
    const storage = getStorageAdapter();
    const val = await storage.getItem(TRUSTED_HASH_KEY);
    if (typeof val === "string") dexieHash = val;
  } catch {
    // Dexie read fallback
  }

  if (localHash && !dexieHash) {
    try {
      await getStorageAdapter().setItem(TRUSTED_HASH_KEY, localHash);
    } catch (err) {
      console.debug('[Auth] Failed to sync localHash to Dexie:', err);
    }
    return localHash;
  }

  if (!localHash && dexieHash) {
    window.localStorage.setItem(TRUSTED_HASH_KEY, dexieHash);
    return dexieHash;
  }

  return localHash || dexieHash;
}

/**
 * Dual storage helper to clear local trusted device hash.
 */
async function clearTrustedDeviceHashLocally(): Promise<void> {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(TRUSTED_HASH_KEY);
    await getStorageAdapter().removeItem(TRUSTED_HASH_KEY);
  } catch (err) {
    console.debug('[Auth] Failed to clear IndexedDB trusted hash:', err);
  }
}

// Module-level listeners so all hook consumers stay in sync.
const listeners = new Set<(s: Session | null) => void>();
let currentSession: Session | null = readSession();
let hasInitialized = false;

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

  // Background revalidation on startup/refresh with Offline Device Gatekeeping
  useEffect(() => {
    let active = true;
    async function initializeAuth() {
      if (hasInitialized) return;
      hasInitialized = true;
      try {
        const isOnline = typeof navigator !== "undefined" ? navigator.onLine : true;

        // If app is started OFFLINE, perform local device trust validation
        if (!isOnline && currentSession?.role === "rider") {
          const storedHash = await getStoredTrustedDeviceHashLocally();
          if (storedHash) {
            const currentDeviceId = await getDeviceIdentifier();
            if (currentDeviceId.fingerprintHash !== storedHash) {
              console.warn("[Auth] Offline device fingerprint mismatch. Access denied.");
              currentSession = null;
              writeSession(null);
              await clearTrustedDeviceHashLocally();
              emit();
              pushToast({
                title: "Offline Access Denied",
                description: "This device is not authorized for offline access on this account.",
                tone: "error",
              });
              return;
            }
          }
          // Trusted offline match: proceed with cached session
          return;
        }

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

        // Rider trusted device revalidation on startup
        if (profile.role === "rider") {
          try {
            const deviceId = await getDeviceIdentifier();
            const { data: devCheck } = await supabase.rpc("validate_and_register_device", {
              p_device_uuid: deviceId.deviceUuid,
              p_fingerprint_hash: deviceId.fingerprintHash,
              p_device_name: deviceId.deviceName,
              p_platform: deviceId.platform,
              p_user_agent: deviceId.userAgent,
              p_ip: null,
            });

            const result = devCheck as { allowed: boolean; registered_device_name?: string } | null;
            if (result && !result.allowed) {
              await supabase.auth.signOut();
              currentSession = null;
              writeSession(null);
              await clearTrustedDeviceHashLocally();
              emit();
              pushToast({
                title: "Device Access Revoked",
                description: `This rider account is locked to ${result.registered_device_name || "another device"}. Please contact HR/Admin.`,
                tone: "error",
              });
              return;
            }

            // Mirror validated device hash to dual local storage
            await saveTrustedDeviceHashLocally(deviceId.fingerprintHash);
          } catch (err) {
            console.warn("[Auth] Startup device revalidation warning:", err);
          }
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
          supabase.rpc("update_my_last_login").then(({ error: stampErr }) => {
            if (stampErr) {
              console.error("[Auth] Failed to update session last login timestamp:", stampErr);
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
          clearTrustedDeviceHashLocally();
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

        // Validate Trusted Device for Rider accounts
        if (profile.role === "rider") {
          try {
            const deviceId = await getDeviceIdentifier();
            const { data: devCheck, error: devErr } = await supabase.rpc("validate_and_register_device", {
              p_device_uuid: deviceId.deviceUuid,
              p_fingerprint_hash: deviceId.fingerprintHash,
              p_device_name: deviceId.deviceName,
              p_platform: deviceId.platform,
              p_user_agent: deviceId.userAgent,
              p_ip: null,
            });

            if (devErr) {
              console.error("[Auth] Device validation RPC error:", devErr);
              await supabase.auth.signOut();
              return {
                ok: false,
                error: `Device validation service unavailable. (${devErr.message})`,
              };
            }

            const result = devCheck as {
              allowed: boolean;
              reason: string;
              registered_device_name?: string;
              registered_at?: string;
            } | null;

            if (result && !result.allowed) {
              const regDevice = result.registered_device_name || "another registered device";
              const regDate = result.registered_at ? ` (registered ${new Date(result.registered_at).toLocaleDateString()})` : "";
              const userId = authData.user.id;
              const riderName = profile.full_name || email;

              // Fast race IP location fetch with 800ms timeout
              const loc = await Promise.race([
                fetchIpLocation(),
                new Promise<null>((resolve) => setTimeout(() => resolve(null), 800)),
              ]).catch(() => null);

              const locInfo = loc ? ` from ${loc.city}, ${loc.region} (IP: ${loc.ip}, ISP: ${loc.org})` : "";

              // Log unauthorized device access attempt to activity_logs table BEFORE signing out
              await logActivity({
                userId,
                riderId: profile.rider_id || undefined,
                eventType: "unauthorized_device_access",
                description: `Unauthorized device login attempt for Rider "${riderName}" blocked on ${deviceId.deviceName} (${deviceId.platform})${locInfo}`,
                metadata: {
                  attempted_device_uuid: deviceId.deviceUuid,
                  attempted_device_name: deviceId.deviceName,
                  attempted_platform: deviceId.platform,
                  registered_device_name: regDevice,
                  ip: loc?.ip,
                  city: loc?.city,
                  region: loc?.region,
                  country: loc?.country_name,
                  org: loc?.org,
                },
              });

              // Dispatch high-priority security alert notification to HR & Admin BEFORE signing out
              await dispatchNotificationSafe({
                category: "account",
                priority: "high",
                type: "system",
                title: "Unauthorized Device Access Blocked",
                message: `Blocked login attempt for rider ${riderName} from unauthorized device (${deviceId.deviceName}). Bound to ${regDevice}.`,
                riderId: profile.rider_id || undefined,
                actionLink: "/audit_logs",
                targetRoles: ["hr", "admin"],
              });

              // Sign out after activity log and notification are successfully recorded
              await supabase.auth.signOut();
              await clearTrustedDeviceHashLocally();

              return {
                ok: false,
                error: `Device Lock Active: This rider account is actively bound to ${regDevice}${regDate}. Logins from untrusted devices are blocked. Contact HR or Admin to request a device reset/transfer.`,
              };
            }

            // Mirror validated device hash to dual local storage
            await saveTrustedDeviceHashLocally(deviceId.fingerprintHash);
          } catch (devCheckError) {
            console.error("[Auth] Unexpected device check error:", devCheckError);
            await supabase.auth.signOut();
            return {
              ok: false,
              error: "Failed to verify device authorization. Please try again.",
            };
          }
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
        const { error: loginStampErr } = await supabase.rpc("update_my_last_login");
        if (loginStampErr) {
          console.error("[Auth] Failed to update login timestamp:", loginStampErr);
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
    clearTrustedDeviceHashLocally();
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
