import { useEffect, useState, useCallback, useMemo } from "react";
import { supabase } from "../lib/supabaseClient";
import { type AppUser, type EmploymentStatus, type UserRole, type UserStatus } from "../services/types";
import { pushToast } from "./useToast";
import { fetchIpLocation, logActivity } from "../lib/apiService";
import { getDeviceIdentifier } from "../lib/deviceFingerprint";
import { dispatchNotificationSafe } from "../services/notificationService";
import {
  clearOfflineRiderTrust,
  createOfflineRiderTrustRecord,
  getOfflineRiderTrust,
  saveOfflineRiderTrust,
  validateOfflineRiderTrust,
  type OfflineRiderTrustFailure
} from '../lib/offlineRiderTrust';
import { logoutCurrentSessionLocally } from '../services/authSecurity';
import { clearRiderSensitiveCache } from '../services/riderCacheService';
import { getStaffAvatarSignedUrl } from '../services/userService';
import { isStaffRole } from '../services/staffProfilePolicy';

const STORAGE_KEY = "attenrider.session.v1";

export type Role = Extract<UserRole, "admin" | "hr" | "rider" | "payroll">;

export interface Session {
  id: string;
  email: string;
  fullName: string;
  role: Role;
  riderId?: string;
  accountStatus: UserStatus;
  employmentStatus: EmploymentStatus;
}

export function isProfileLoginBlocked(profile: {
  role: string;
  status: string;
  employment_status: string;
}): boolean {
  return profile.employment_status === 'archived'
    || (profile.status === 'suspended' && profile.role !== 'rider');
}

function readSession(): Session | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Session;
    if (!parsed?.id || !parsed?.role) return null;
    return {
      ...parsed,
      accountStatus: parsed.accountStatus || 'active',
      employmentStatus: parsed.employmentStatus || 'active'
    };
  } catch {
    return null;
  }
}

function writeSession(s: Session | null) {
  if (typeof window === "undefined") return;
  if (s) window.localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  else window.localStorage.removeItem(STORAGE_KEY);
}

function offlineAccessDescription(reason: OfflineRiderTrustFailure): string {
  if (reason === 'expired') return 'Offline authorization has expired. Connect to the internet to revalidate this device.';
  if (reason === 'device_mismatch') return 'This device does not match the rider account’s trusted device.';
  if (reason === 'identity_mismatch') return 'The cached rider account does not match this device’s offline authorization.';
  return 'Connect to the internet once to authorize this device for offline rider access.';
}

// Module-level listeners so all hook consumers stay in sync.
const listeners = new Set<(s: Session | null) => void>();
const readinessListeners = new Set<(ready: boolean) => void>();
let currentSession: Session | null = readSession();
let hasInitialized = false;
let authReady = false;

function emit() {
  listeners.forEach((l) => l(currentSession));
}

function markAuthReady() {
  authReady = true;
  readinessListeners.forEach((listener) => listener(true));
}

async function reconcileCurrentSession(authUser: { id: string; email?: string | null }): Promise<void> {
  if (!currentSession || currentSession.id !== authUser.id) return;

  const { data: profile, error } = await supabase
    .from('users')
    .select('full_name, role, status, rider_id, employment_status')
    .eq('id', authUser.id)
    .single();

  if (error || !profile || isProfileLoginBlocked(profile)) return;

  const next: Session = {
    id: authUser.id,
    email: authUser.email ?? currentSession.email,
    fullName: profile.full_name,
    role: profile.role as Role,
    riderId: profile.rider_id || undefined,
    accountStatus: profile.status as UserStatus,
    employmentStatus: profile.employment_status as EmploymentStatus,
  };
  if (!currentSession || currentSession.id !== authUser.id) return;
  if (
    currentSession.email === next.email
    && currentSession.fullName === next.fullName
    && currentSession.role === next.role
    && currentSession.riderId === next.riderId
    && currentSession.accountStatus === next.accountStatus
    && currentSession.employmentStatus === next.employmentStatus
  ) return;
  currentSession = next;
  writeSession(next);
  emit();
}

// Listen for profile updates to keep session synchronized with database in real-time
if (typeof window !== "undefined") {
  window.addEventListener("profile-updated", async () => {
    if (!currentSession) return;
    try {
      const { data: profile, error } = await supabase
        .from("users")
        .select("full_name, role, status, rider_id, employment_status")
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
          accountStatus: profile.status as UserStatus,
          employmentStatus: profile.employment_status as EmploymentStatus,
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
  const [isReady, setIsReady] = useState(authReady);
  const [customAvatar, setCustomAvatar] = useState<string | null>(null);

  useEffect(() => {
    if (!session?.id) {
      setCustomAvatar(null);
      return;
    }
    let active = true;
    const loadAvatar = async () => {
      const legacyAvatar = localStorage.getItem(`custom_avatar_${session.id}`);
      if (!isStaffRole(session.role)) {
        if (active) setCustomAvatar(legacyAvatar);
        return;
      }
      try {
        const signedAvatar = await getStaffAvatarSignedUrl(session.id);
        if (active) setCustomAvatar(signedAvatar || legacyAvatar);
      } catch (error) {
        console.warn('Unable to refresh private staff profile photo:', error);
        if (active) setCustomAvatar(legacyAvatar);
      }
    };

    void loadAvatar();
    const handleAvatarUpdate = () => void loadAvatar();

    window.addEventListener("avatar-updated", handleAvatarUpdate);
    window.addEventListener("storage", handleAvatarUpdate);
    return () => {
      active = false;
      window.removeEventListener("avatar-updated", handleAvatarUpdate);
      window.removeEventListener("storage", handleAvatarUpdate);
    };
  }, [session?.id, session?.role]);

  useEffect(() => {
    const listener = (s: Session | null) => setSession(s);
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }, []);

  useEffect(() => {
    const listener = (ready: boolean) => setIsReady(ready);
    readinessListeners.add(listener);
    return () => {
      readinessListeners.delete(listener);
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
          const offlineSession = currentSession;
          let deniedReason: OfflineRiderTrustFailure | null = null;
          try {
            if (!offlineSession.riderId) {
              deniedReason = 'identity_mismatch';
            } else {
              const trust = await getOfflineRiderTrust();
              const currentDeviceId = await getDeviceIdentifier();
              const validation = validateOfflineRiderTrust(
                { authUserId: offlineSession.id, riderId: offlineSession.riderId },
                trust,
                currentDeviceId.fingerprintHash
              );
              if (!validation.allowed) deniedReason = validation.reason;
            }
          } catch (error) {
            console.warn('[Auth] Offline rider trust validation failed:', error);
            deniedReason = 'missing';
          }

          if (deniedReason) {
            console.warn(`[Auth] Offline rider access denied: ${deniedReason}.`);
            currentSession = null;
            writeSession(null);
            await clearOfflineRiderTrust();
            emit();
            pushToast({
              title: 'Offline Access Denied',
              description: offlineAccessDescription(deniedReason),
              tone: 'error'
            });
            return;
          }

          // Valid, unexpired rider/device trust: proceed with the cached session.
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
          .select("full_name, role, status, rider_id, employment_status")
          .eq("id", supabaseSession.user.id)
          .single();

        if (error || !profile) {
          await supabase.auth.signOut();
          currentSession = null;
          writeSession(null);
          emit();
          return;
        }

        if (isProfileLoginBlocked(profile)) {
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
            const { data: devCheck, error: deviceValidationError } = await supabase.rpc("validate_and_register_device", {
              p_device_uuid: deviceId.deviceUuid,
              p_fingerprint_hash: deviceId.fingerprintHash,
              p_device_name: deviceId.deviceName,
              p_platform: deviceId.platform,
              p_user_agent: deviceId.userAgent,
              p_ip: null,
            });

            if (deviceValidationError) throw deviceValidationError;

            const result = devCheck as { allowed: boolean; registered_device_name?: string } | null;
            if (result && !result.allowed) {
              await supabase.auth.signOut();
              currentSession = null;
              writeSession(null);
              await clearOfflineRiderTrust();
              emit();
              pushToast({
                title: "Device Access Revoked",
                description: `This rider account is locked to ${result.registered_device_name || "another device"}. Please contact HR/Admin.`,
                tone: "error",
              });
              return;
            }

            if (profile.rider_id) {
              await saveOfflineRiderTrust(createOfflineRiderTrustRecord(
                { authUserId: supabaseSession.user.id, riderId: profile.rider_id },
                deviceId.fingerprintHash
              ));
            } else {
              await clearOfflineRiderTrust();
            }
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
            accountStatus: profile.status as UserStatus,
            employmentStatus: profile.employment_status as EmploymentStatus,
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
      } finally {
        if (active) markAuthReady();
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
          void clearOfflineRiderTrust();
          emit();
        }
      } else if (event !== "INITIAL_SESSION") {
        setTimeout(() => {
          void reconcileCurrentSession(sbSession.user).catch((error) => {
            console.error('Unable to reconcile authenticated profile:', error);
          });
        }, 0);
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
      status: session.accountStatus,
      employmentStatus: session.employmentStatus,
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
          .select("full_name, role, status, rider_id, employment_status")
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

        if (profile.employment_status === 'archived') {
          await supabase.auth.signOut();
          return { ok: false, error: "This employment record is archived. Contact HR or Admin if this should be restored." };
        }

        if (profile.status === "suspended" && profile.role !== 'rider') {
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
              await clearOfflineRiderTrust();

              return {
                ok: false,
                error: `Device Lock Active: This rider account is actively bound to ${regDevice}${regDate}. Logins from untrusted devices are blocked. Contact HR or Admin to request a device reset/transfer.`,
              };
            }

            if (profile.rider_id) {
              await saveOfflineRiderTrust(createOfflineRiderTrustRecord(
                { authUserId: authData.user.id, riderId: profile.rider_id },
                deviceId.fingerprintHash
              ));
            } else {
              await clearOfflineRiderTrust();
            }
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
          accountStatus: profile.status as UserStatus,
          employmentStatus: profile.employment_status as EmploymentStatus,
        };

        currentSession = next;
        writeSession(next);
        emit();
        markAuthReady();

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
    const endingSession = currentSession;
    try {
      await supabase.auth.signOut();
    } catch (err) {
      console.warn("SignOut warning:", err);
    }
    currentSession = null;
    writeSession(null);
    void clearOfflineRiderTrust();
    if (endingSession?.role === 'rider') void clearRiderSensitiveCache(endingSession.id, endingSession.riderId);
    emit();
    pushToast({
      title: "Signed out",
      description: "You have been logged out successfully.",
      tone: "info"
    });
  }, []);

  const signOutLocally = useCallback(async () => {
    const endingSession = currentSession;
    try {
      await logoutCurrentSessionLocally();
    } catch (err) {
      console.warn('Local sign-out warning:', err);
    }
    currentSession = null;
    writeSession(null);
    void clearOfflineRiderTrust();
    if (endingSession?.role === 'rider') void clearRiderSensitiveCache(endingSession.id, endingSession.riderId);
    emit();
    pushToast({
      title: 'Session ended',
      description: 'This session was logged out from another signed-in device.',
      tone: 'info'
    });
  }, []);

  const state = {
    session,
    isReady,
    user,
    signIn,
    signOut,
    signOutLocally,
  };

  return state;
}
