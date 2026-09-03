import { cloneElement, isValidElement, useEffect, useId, useMemo, useState, useRef } from "react";
import {
  Upload,
  Eye,
  EyeOff,
  Sparkles,
  Camera,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  Trash2,
  ArrowLeft,
  ShieldCheck,
} from "lucide-react";
import type { AppUser, UserRole, Zone } from "../../services/types";
import { pushToast } from "../../hooks/useToast";
import { useAuth } from "../../hooks/useAuth";
import { useHub } from "../../context/HubContext";
import { PROVINCES, PHILIPPINES_LOCATIONS } from "../../lib/phLocations";
import {
  ensureScriptsLoaded,
  loadFaceModels,
  getFaceDescriptor,
  getDescriptorFromUrl,
} from "../../lib/faceAi";
import { FaceCaptureModal } from "./FaceCaptureModal";
import {
  type EditableRole,
  type Shift,
  type FormState,
  type FormErrors,
  generateMkbId,
  compressBase64Image,
  filterZonesForRiderHub,
  resolveInitialRiderHubId,
  validate,
} from "./userFormUtils";
import { checkEmployeeDuplicates } from "../../services/users/userService";
import { getMissingStaffProfileFields, isStaffRole } from "../../lib/users/staffProfilePolicy";
import type { Hub } from "../../services/hubs/hubService";

type UserWithExtensions = AppUser &
  Partial<{
    contact: string;
    mkbRiderId: string;
    shift: Shift;
    faceImage: string | null;
    faceDescriptor: number[] | null;
    province: string;
    city: string;
    barangay: string;
    zipCode: string;
    streetAddress: string;
    emergencyContactName: string;
    emergencyContactPhone: string;
    employmentType: string;
    dateOfHire: string;
    vehicleType: string;
    vehiclePlateNumber: string;
    notes: string;
  }>;

interface UserFormProps {
  user?: AppUser | null;
  zones: Zone[];
  hubs: Hub[];
  onClose: () => void;
  onSaved?: (
    user: AppUser & {
      contact?: string;
      mkbRiderId?: string;
      shift?: Shift;
      faceImage?: string | null;
      faceDescriptor?: number[] | null;
      tempPassword?: string;
      province?: string;
      city?: string;
      barangay?: string;
      zipCode?: string;
      streetAddress?: string;
      emergencyContactName?: string;
      emergencyContactPhone?: string;
      employmentType?: string;
      dateOfHire?: string;
      vehicleType?: string;
      vehiclePlateNumber?: string;
      notes?: string;
    },
    mode: "create" | "edit",
  ) => void;
}

const ROLES: {
  value: EditableRole;
  label: string;
}[] = [
  { value: "admin", label: "Admin" },
  { value: "hr", label: "HR" },
  { value: "rider", label: "Rider" },
  { value: "payroll", label: "Payroll" },
];

const EMPTY_FORM: FormState = {
  firstName: "",
  middleName: "",
  lastName: "",
  email: "",
  contact: "",
  tempPassword: "",
  role: "admin",
  status: "active",
  mkbRiderId: "",
  hubId: "",
  zoneId: "",
  hubAccessScope: "global",
  hubIds: [],
  shift: "",
  faceImage: null,
  faceDescriptor: null,
  province: "Zamboanga del Sur",
  city: "Zamboanga City",
  barangay: "",
  zipCode: "",
  streetAddress: "",
  emergencyContactName: "",
  emergencyContactPhone: "",
  employmentType: "",
  dateOfHire: "",
  vehicleType: "",
  vehiclePlateNumber: "",
  notes: "",
};

export function UserForm({ user, zones, hubs, onClose, onSaved }: UserFormProps) {
  const { session } = useAuth();
  const { selectedHubId, canSelectAll } = useHub();
  const currentUserRole = session?.role;
  const mode: "create" | "edit" = user ? "edit" : "create";

  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [errors, setErrors] = useState<FormErrors>({});
  const [submitting, setSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showSummary, setShowSummary] = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const initialFormRef = useRef<FormState | null>(null);
  const activeAuthorizedHubs = useMemo(() => hubs.filter((hub) => hub.active), [hubs]);
  const activeAuthorizedHubIds = useMemo(
    () => activeAuthorizedHubs.map((hub) => hub.id),
    [activeAuthorizedHubs],
  );

  const fieldRefs = useRef<
    Partial<Record<keyof FormState, HTMLElement | null>>
  >({});

  useEffect(() => {
    if (user) {
      const safeRole: EditableRole =
        currentUserRole === "hr"
          ? "rider"
          : user.role === "admin" ||
              user.role === "hr" ||
              user.role === "rider" ||
              user.role === "payroll"
            ? (user.role as EditableRole)
            : "admin";

      const faceImg =
        (user as UserWithExtensions).faceImage ?? user.avatar ?? null;
      const faceDesc = (user as UserWithExtensions).faceDescriptor ?? null;

      const nameParts = (user.name || "").trim().split(/\s+/);
      let fName = "";
      let mName = "";
      let lName = "";
      if (nameParts.length === 1) {
        fName = nameParts[0];
      } else if (nameParts.length === 2) {
        fName = nameParts[0];
        lName = nameParts[1];
      } else if (nameParts.length >= 3) {
        fName = nameParts[0];
        mName = nameParts[1];
        lName = nameParts.slice(2).join(" ");
      }

      const initialForm: FormState = {
        firstName: fName,
        middleName: mName,
        lastName: lName,
        email: user.email,
        contact: (user as UserWithExtensions).contact ?? "",
        tempPassword: "",
        role: safeRole,
        status: user.status,
        mkbRiderId: (user as UserWithExtensions).mkbRiderId ?? "",
        hubId: resolveInitialRiderHubId({
          existingHubId: user.hubId,
          selectedWorkspaceHubId: selectedHubId,
          canSelectAll,
          activeAuthorizedHubIds,
        }),
        zoneId: user.zoneId ?? "",
        hubAccessScope: user.hubAccessScope ?? "assigned",
        hubIds: user.authorizedHubIds ?? [],
        shift: (user as UserWithExtensions).shift ?? "",
        faceImage: faceImg,
        faceDescriptor: faceDesc,
        province: (user as UserWithExtensions).province || "Zamboanga del Sur",
        city: (user as UserWithExtensions).city || "Zamboanga City",
        barangay: (user as UserWithExtensions).barangay || "",
        zipCode: (user as UserWithExtensions).zipCode || "",
        streetAddress: (user as UserWithExtensions).streetAddress || "",
        emergencyContactName: (user as UserWithExtensions).emergencyContactName ?? "",
        emergencyContactPhone: (user as UserWithExtensions).emergencyContactPhone ?? "",
        employmentType: (user as UserWithExtensions).employmentType ?? "",
        dateOfHire: (user as UserWithExtensions).dateOfHire ?? "",
        vehicleType: (user as UserWithExtensions).vehicleType ?? "",
        vehiclePlateNumber: (user as UserWithExtensions).vehiclePlateNumber ?? "",
        notes: (user as UserWithExtensions).notes ?? "",
      };
      initialFormRef.current = initialForm;
      setForm(initialForm);

      // Auto-compile descriptor in background if missing for a rider
      if (
        safeRole === "rider" &&
        faceImg &&
        !faceDesc &&
        !faceImg.includes("dicebear") &&
        !faceImg.endsWith(".svg")
      ) {
        console.log(
          "[Admin UserForm] Auto-compiling missing descriptor for user:",
          user.name,
        );
        (async () => {
          try {
            const active = await ensureScriptsLoaded();
            if (active) {
              await loadFaceModels();
              const desc = await getDescriptorFromUrl(faceImg);
              if (desc) {
                console.log(
                  "[Admin UserForm] Auto-compiled descriptor successfully in background.",
                );
                setForm((f) => ({ ...f, faceDescriptor: Array.from(desc) }));
              }
            }
          } catch (err) {
            console.warn(
              "[Admin UserForm] Background descriptor compilation failed:",
              err,
            );
          }
        })();
      }
    } else {
      const initialForm: FormState = {
        ...EMPTY_FORM,
        role: currentUserRole === "hr" ? "rider" : "admin",
        hubAccessScope: currentUserRole === "hr" ? "assigned" : "global",
        hubId: resolveInitialRiderHubId({
          selectedWorkspaceHubId: selectedHubId,
          canSelectAll,
          activeAuthorizedHubIds,
        }),
      };
      initialFormRef.current = initialForm;
      setForm(initialForm);
    }
    setErrors({});
    setShowSummary(false);
    setShowPassword(false);
    setSubmitting(false);
  }, [activeAuthorizedHubIds, canSelectAll, currentUserRole, selectedHubId, user]);

  const isRider = form.role === "rider";
  const riderHubLocked = !canSelectAll;
  const riderZones = useMemo(
    () => filterZonesForRiderHub(zones, form.hubId, form.zoneId),
    [form.hubId, form.zoneId, zones],
  );
  const missingStaffFields = useMemo(
    () => isStaffRole(form.role)
      ? getMissingStaffProfileFields({
          contact: form.contact,
          employmentType: form.employmentType,
          dateOfHire: form.dateOfHire,
        })
      : [],
    [form.contact, form.dateOfHire, form.employmentType, form.role],
  );



  const cities = useMemo(() => {
    if (!form.province) return [];
    return PHILIPPINES_LOCATIONS[form.province] || [];
  }, [form.province]);

  const setField = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((f) => {
      const next = { ...f, [key]: value };
      if (key === "province") {
        const nextCities = PHILIPPINES_LOCATIONS[value as string] || [];
        next.city = nextCities.includes("Zamboanga City")
          ? "Zamboanga City"
          : nextCities[0] || "";
      }
      return next;
    });

    if (errors[key]) {
      setErrors((e) => ({ ...e, [key]: undefined }));
    }
  };

  const setRiderHub = (hubId: string) => {
    setForm((current) => ({
      ...current,
      hubId,
      zoneId: current.zoneId && zones.some(
        (zone) => zone.id === current.zoneId && zone.hubId === hubId,
      ) ? current.zoneId : "",
    }));
    setErrors((current) => ({ ...current, hubId: undefined, zoneId: undefined }));
  };

  const handleSubmit = async () => {
    const v = validate(form, mode, mode === "edit" ? initialFormRef.current ?? undefined : undefined);
    setErrors(v);
    if (Object.keys(v).length > 0) {
      setShowSummary(true);
      const firstKey = Object.keys(v)[0] as keyof FormState;
      const el = fieldRefs.current[firstKey];
      if (el && typeof el.scrollIntoView === "function") {
        el.scrollIntoView({
          behavior: "smooth",
          block: "center",
        });
      }
      return;
    }
    setShowSummary(false);
    setSubmitting(true);
    try {
      // Perform pre-submission database duplicate check (Rider ID, email, plate number, contact, face biometric)
      const existingRiderId = mode === "edit" ? (user as unknown as { rider_id?: string; riderId?: string })?.rider_id || (user as unknown as { riderId?: string })?.riderId : undefined;
      const dupCheck = await checkEmployeeDuplicates({
        mkbRiderId: form.role === "rider" ? form.mkbRiderId : undefined,
        email: form.email,
        vehiclePlateNumber: form.role === "rider" ? form.vehiclePlateNumber : undefined,
        contact: form.contact,
        faceDescriptor: form.role === "rider" ? form.faceDescriptor : undefined,
        excludeUserId: mode === "edit" ? user?.id : undefined,
        excludeRiderId: existingRiderId,
      });

      if (dupCheck.hasDuplicate) {
        if (dupCheck.duplicateField === "mkb_id") setErrors(prev => ({ ...prev, mkbRiderId: dupCheck.message }));
        else if (dupCheck.duplicateField === "email") setErrors(prev => ({ ...prev, email: dupCheck.message }));
        else if (dupCheck.duplicateField === "vehicle_plate_number") setErrors(prev => ({ ...prev, vehiclePlateNumber: dupCheck.message }));
        else if (dupCheck.duplicateField === "contact") setErrors(prev => ({ ...prev, contact: dupCheck.message }));
        else if (dupCheck.duplicateField === "face_descriptor") setErrors(prev => ({ ...prev, faceImage: dupCheck.message }));

        pushToast({
          title: "Duplicate Registration Blocked",
          description: dupCheck.message || "An employee record with matching details or face already exists.",
          tone: "error",
        });
        setSubmitting(false);
        return;
      }

      const fullName =
        `${form.firstName.trim()} ${form.middleName.trim() ? form.middleName.trim() + " " : ""}${form.lastName.trim()}`.trim();
      const saved = {
        id: user?.id ?? `u-${Date.now()}`,
        name: fullName,
        email: form.email.trim(),
        avatar:
          form.faceImage ??
          user?.avatar ??
          `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(fullName || "new")}&backgroundColor=fff1e0`,
        role: form.role as UserRole,
        zoneId: form.role === "rider" ? form.zoneId || null : null,
        hubId: form.role === "rider" ? form.hubId || null : null,
        hubAccessScope: form.role === "rider" ? "assigned" : form.hubAccessScope,
        authorizedHubIds: form.role === "rider" ? [] : form.hubIds,
        status: form.status,
        employmentStatus: user?.employmentStatus ?? 'active',
        lastLogin: user?.lastLogin ?? 0,
        contact: form.contact,
        mkbRiderId: form.role === "rider" ? form.mkbRiderId : "",
        shift: form.role === "rider" ? form.shift : "",
        faceImage: form.role === "rider" ? form.faceImage : null,
        faceDescriptor: form.role === "rider" ? form.faceDescriptor : null,
        tempPassword: form.tempPassword,
        province: form.role === "rider" ? form.province : "",
        city: form.role === "rider" ? form.city : "",
        barangay: form.role === "rider" ? form.barangay.trim() : "",
        zipCode: form.role === "rider" ? form.zipCode.trim() : "",
        streetAddress: form.role === "rider" ? form.streetAddress.trim() : "",
        emergencyContactName: form.role === "rider" ? form.emergencyContactName.trim() : "",
        emergencyContactPhone: form.role === "rider" ? form.emergencyContactPhone.trim() : "",
        employmentType: form.employmentType,
        dateOfHire: form.dateOfHire,
        vehicleType: form.role === "rider" ? form.vehicleType : "",
        vehiclePlateNumber: form.role === "rider" ? form.vehiclePlateNumber.trim() : "",
        notes: form.notes.trim(),
      };

      await onSaved?.(saved, mode);
      pushToast({
        title: mode === "create" ? "User created successfully" : "User updated",
        description:
          mode === "create"
            ? `${saved.name} (${ROLES.find((r) => r.value === saved.role)?.label ?? saved.role})`
            : saved.name,
        tone: "success",
      });
      onClose();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Try again.";
      console.error(err);
      pushToast({
        title:
          mode === "create" ? "Failed to create user" : "Failed to update user",
        description: message,
        tone: "error",
      });
    } finally {
      setSubmitting(false);
    }
  };

  const errorList = useMemo(
    () =>
      Object.entries(errors).filter(([, v]) => !!v) as [
        keyof FormState,
        string,
      ][],
    [errors],
  );

  return (
    <div className="flex flex-col min-h-screen bg-panel-bg text-foreground font-[Geist,sans-serif]">
      {/* Top sticky action header */}
      <div className="sticky top-16 z-40 flex flex-col items-stretch justify-between gap-3 border-b border-border bg-panel-bg/95 px-4 py-3 backdrop-blur-md sm:flex-row sm:items-center sm:gap-4 md:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="p-2 -ml-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-border/50 transition shrink-0 cursor-pointer"
            aria-label="Back"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="min-w-0">
            <h1 className="text-wrap-safe text-base font-bold leading-tight tracking-tight text-foreground sm:text-lg">
              {mode === "edit"
                ? `Edit User: ${form.firstName} ${form.lastName}`
                : "Add New User"}
            </h1>
            <p className="text-xs text-muted-foreground hidden sm:block">
              {mode === "edit"
                ? "Modify user profile, system access roles, and assignments."
                : "Register a new account and configure settings."}
            </p>
          </div>
        </div>

        <div className="grid w-full grid-cols-2 items-center gap-2 sm:flex sm:w-auto">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="h-10 rounded-md border border-border bg-white px-4 text-sm font-medium text-foreground transition hover:border-primary/30 disabled:opacity-50 sm:h-9 cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={submitting}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-primary px-3 text-sm font-semibold text-white shadow-sm transition hover:bg-primary-hover active:bg-primary-hover focus:ring-2 focus:ring-primary/25 disabled:opacity-70 sm:h-9 sm:px-5 cursor-pointer"
          >
            {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
            {submitting
              ? "Saving…"
              : mode === "edit"
                ? "Save Changes"
                : "Create User"}
          </button>
        </div>
      </div>

      {/* Main Spacious Content */}
      <div className="dashboard-page flex-1 space-y-6">
        <p className="text-xs font-medium text-muted-foreground">
          Required fields are marked with <span className="font-bold text-red-600">*</span>.
        </p>
        {mode === "edit" && missingStaffFields.length > 0 && (
          <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4" role="status">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" />
            <div>
              <p className="text-sm font-semibold text-amber-900">Profile incomplete</p>
              <p className="mt-0.5 text-xs leading-relaxed text-amber-800">
                Missing: {missingStaffFields.join(", ")}. You may save unrelated valid changes now and complete these details when verified information is available.
              </p>
            </div>
          </div>
        )}
        {showSummary && errorList.length > 0 && (
          <div className="rounded-xl border border-primary/30 bg-accent p-4 flex items-start gap-3 shadow-sm">
            <AlertTriangle className="w-5 h-5 text-accent-foreground shrink-0" />
            <div>
              <div className="text-sm font-semibold text-accent-foreground mb-1">
                Please fix {errorList.length} issue
                {errorList.length === 1 ? "" : "s"} before saving:
              </div>
              <ul className="list-disc list-inside text-xs text-muted-foreground space-y-1">
                {errorList.map(([k, v]) => (
                  <li key={k}>{v}</li>
                ))}
              </ul>
            </div>
          </div>
        )}

        <div
          className={`grid gap-6 ${isRider ? "grid-cols-1 lg:grid-cols-3" : "grid-cols-1"}`}
        >
            {/* LEFT AREA: Spacious details (2/3 width for Rider, full for non-Rider) */}
            <div className={`space-y-6 ${isRider ? "lg:col-span-2" : ""}`}>
              {/* CARD 1: Account Info */}
              <div id="personal" className="bg-white rounded-xl border border-border p-5 md:p-6 shadow-sm space-y-5">
                <div className="text-sm font-bold text-accent-foreground uppercase tracking-wider border-b border-border pb-2">
                  Personal Information
                </div>

                {/* Name Fields */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 lg:gap-5">
                  <Field
                    label="First Name"
                    required
                    error={errors.firstName}
                    innerRef={(el) => (fieldRefs.current.firstName = el)}
                  >
                    <input
                      value={form.firstName}
                      onChange={(e) => setField("firstName", e.target.value)}
                      placeholder="e.g. Juan"
                      className="ar-input"
                      disabled={submitting}
                    />
                  </Field>
                  <Field
                    label="Middle Name (Opt)"
                    error={errors.middleName}
                    innerRef={(el) => (fieldRefs.current.middleName = el)}
                  >
                    <input
                      value={form.middleName}
                      onChange={(e) => setField("middleName", e.target.value)}
                      placeholder="e.g. Santos"
                      className="ar-input"
                      disabled={submitting}
                    />
                  </Field>
                  <Field
                    label="Last Name"
                    required
                    error={errors.lastName}
                    innerRef={(el) => (fieldRefs.current.lastName = el)}
                  >
                    <input
                      value={form.lastName}
                      onChange={(e) => setField("lastName", e.target.value)}
                      placeholder="e.g. dela Cruz"
                      className="ar-input"
                      disabled={submitting}
                    />
                  </Field>
                </div>

                {/* Contact & Email */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 lg:gap-5">
                <Field
                  label="Email Address"
                  required
                  error={errors.email}
                  innerRef={(el) => (fieldRefs.current.email = el)}
                >
                  <input
                    value={form.email}
                    onChange={(e) => setField("email", e.target.value)}
                    placeholder={isRider ? "name@example.com" : "name@gmail.com"}
                    className="ar-input"
                    autoComplete="off"
                    readOnly={mode === "edit" && !isRider}
                    disabled={submitting}
                    aria-describedby={mode === "edit" && !isRider ? "staff-email-edit-help" : undefined}
                  />
                  {mode === "edit" && !isRider && (
                    <p id="staff-email-edit-help" className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
                      Staff login email changes require confirmation and must be requested by the account owner in Settings.
                    </p>
                  )}
                </Field>
                <Field
                  label="Contact Number"
                  required
                  error={errors.contact}
                  innerRef={(el) => (fieldRefs.current.contact = el)}
                >
                  <input
                    value={form.contact}
                    onChange={(e) =>
                      setField(
                        "contact",
                        e.target.value.replace(/\D/g, "").slice(0, 11),
                      )
                    }
                    placeholder="09XX XXX XXXX"
                    inputMode="numeric"
                    className="ar-input font-mono"
                    disabled={submitting}
                  />
                </Field>
              </div>

              {/* Employment details */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 lg:gap-5">
                <Field
                  label="Employment Type"
                  required
                  error={errors.employmentType}
                  innerRef={(el) => (fieldRefs.current.employmentType = el)}
                >
                  <select
                    value={form.employmentType}
                    onChange={(e) => setField("employmentType", e.target.value)}
                    className="ar-input"
                    disabled={submitting}
                  >
                    <option value="">Select Type</option>
                    <option value="full-time">Full-time</option>
                    <option value="part-time">Part-time</option>
                    <option value="contractual">Contractual</option>
                  </select>
                </Field>
                <Field
                  label="Date of Hire / Start Date"
                  required
                  error={errors.dateOfHire}
                  innerRef={(el) => (fieldRefs.current.dateOfHire = el)}
                >
                  <input
                    type="date"
                    value={form.dateOfHire}
                    onChange={(e) => setField("dateOfHire", e.target.value)}
                    className="ar-input text-foreground uppercase text-xs"
                    disabled={submitting}
                  />
                </Field>
              </div>
            </div>

            {/* CARD 2: Home Address (Only for Rider) */}
            {isRider && (
              <>
                <div id="address" className="bg-white rounded-xl border border-border p-5 md:p-6 shadow-sm space-y-5">
                  <div className="text-sm font-bold text-accent-foreground uppercase tracking-wider border-b border-border pb-2">
                    Address Details (Locked to Philippines)
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <Field
                      label="Province"
                      required
                      error={errors.province}
                      innerRef={(el) => (fieldRefs.current.province = el)}
                    >
                      <select
                        value={form.province}
                        onChange={(e) => setField("province", e.target.value)}
                        className="ar-input"
                        disabled={submitting}
                      >
                        <option value="">Select Province</option>
                        {PROVINCES.map((p) => (
                          <option key={p} value={p}>
                            {p}
                          </option>
                        ))}
                      </select>
                    </Field>

                    <Field
                      label="City / Municipality"
                      required
                      error={errors.city}
                      innerRef={(el) => (fieldRefs.current.city = el)}
                    >
                      <select
                        value={form.city}
                        onChange={(e) => setField("city", e.target.value)}
                        className="ar-input"
                        disabled={submitting || !form.province}
                      >
                        <option value="">Select City</option>
                        {cities.map((c) => (
                          <option key={c} value={c}>
                            {c}
                          </option>
                        ))}
                      </select>
                    </Field>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div className="sm:col-span-2">
                      <Field
                        label="Barangay"
                        required
                        error={errors.barangay}
                        innerRef={(el) => (fieldRefs.current.barangay = el)}
                      >
                        <input
                          value={form.barangay}
                          onChange={(e) => setField("barangay", e.target.value)}
                          placeholder="e.g. Santa Maria"
                          className="ar-input"
                          disabled={submitting}
                        />
                      </Field>
                    </div>
                    <div>
                      <Field
                        label="Zip Code"
                        required
                        error={errors.zipCode}
                        innerRef={(el) => (fieldRefs.current.zipCode = el)}
                      >
                        <input
                          value={form.zipCode}
                          onChange={(e) =>
                            setField(
                              "zipCode",
                              e.target.value.replace(/\D/g, "").slice(0, 4),
                            )
                          }
                          placeholder="e.g. 7000"
                          inputMode="numeric"
                          className="ar-input font-mono"
                          disabled={submitting}
                        />
                      </Field>
                    </div>
                  </div>

                  <Field
                    label="Street Address"
                    required
                    error={errors.streetAddress}
                    innerRef={(el) => (fieldRefs.current.streetAddress = el)}
                  >
                    <input
                      value={form.streetAddress}
                      onChange={(e) => setField("streetAddress", e.target.value)}
                      placeholder="House no., Block/Lot, Street name, subdivision..."
                      className="ar-input"
                      disabled={submitting}
                    />
                  </Field>
                </div>

                {/* Emergency Contact */}
                <div id="emergency" className="bg-white rounded-xl border border-border p-5 md:p-6 shadow-sm space-y-5">
                  <div className="text-sm font-bold text-accent-foreground uppercase tracking-wider border-b border-border pb-2">
                    Emergency Contact Details (Required)
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <Field
                      label="Emergency Contact Name"
                      required
                      error={errors.emergencyContactName}
                      innerRef={(el) => (fieldRefs.current.emergencyContactName = el)}
                    >
                      <input
                        value={form.emergencyContactName}
                        onChange={(e) => setField("emergencyContactName", e.target.value)}
                        placeholder="e.g. Maria dela Cruz"
                        className="ar-input"
                        disabled={submitting}
                      />
                    </Field>
                    <Field
                      label="Emergency Contact Number"
                      required
                      error={errors.emergencyContactPhone}
                      innerRef={(el) => (fieldRefs.current.emergencyContactPhone = el)}
                    >
                      <input
                        value={form.emergencyContactPhone}
                        onChange={(e) =>
                          setField(
                            "emergencyContactPhone",
                            e.target.value.replace(/\D/g, "").slice(0, 11),
                          )
                        }
                        placeholder="09XX XXX XXXX"
                        inputMode="numeric"
                        className="ar-input font-mono"
                        disabled={submitting}
                      />
                    </Field>
                  </div>
                </div>
              </>
            )}

            {/* Non-Rider security/status setup in left panel to look balanced */}
            {!isRider && (
              <div className="bg-white rounded-xl border border-border p-5 md:p-6 shadow-sm space-y-5">
                <div className="text-sm font-bold text-accent-foreground uppercase tracking-wider border-b border-border pb-2">
                  Account Configuration &amp; Credentials
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
                  {/* LEFT COLUMN: Account Status, System Role, Hub Access */}
                  <div className="space-y-4">
                    <Field label="Account Status" required>
                      <div className={`h-9 rounded-md border px-3 inline-flex items-center text-xs capitalize font-bold ${form.status === 'suspended' ? 'bg-red-50 border-red-500/40 text-red-700' : 'bg-emerald-50 border-emerald-500/40 text-emerald-700'}`}>{form.status}</div>
                      <p className="mt-1.5 text-[10px] text-muted-foreground">Use the employee list account action to restrict or restore Rider access, or suspend or reactivate staff access.</p>
                    </Field>

                    {currentUserRole !== "hr" && (
                      <Field
                        label="System Role"
                        required
                        error={errors.role}
                        innerRef={(el) => (fieldRefs.current.role = el)}
                      >
                        <select
                          value={form.role}
                          onChange={(e) =>
                            setField("role", e.target.value as EditableRole)
                          }
                          className="ar-input capitalize"
                          disabled={submitting}
                        >
                          {ROLES.map((r) => (
                            <option key={r.value} value={r.value}>
                              {r.label}
                            </option>
                          ))}
                        </select>
                      </Field>
                    )}

                    {currentUserRole === "admin" && isStaffRole(form.role) && (
                      <Field label="Hub access" required error={errors.hubIds} innerRef={(el) => (fieldRefs.current.hubIds = el)}>
                        <div className="space-y-3 rounded-lg border border-border bg-panel-bg p-3">
                          <label className="flex items-center gap-2 text-xs font-medium cursor-pointer">
                            <input type="radio" checked={form.hubAccessScope === 'global'} onChange={() => setField('hubAccessScope', 'global')} disabled={submitting} />
                            Global access (All Hubs and any specific hub)
                          </label>
                          <label className="flex items-center gap-2 text-xs font-medium cursor-pointer">
                            <input type="radio" checked={form.hubAccessScope === 'assigned'} onChange={() => setField('hubAccessScope', 'assigned')} disabled={submitting} />
                            Assigned hubs only
                          </label>
                          {form.hubAccessScope === 'assigned' && (
                            <div className="grid gap-2 border-t border-border pt-3 sm:grid-cols-2">
                              {hubs.length === 0 ? <p className="text-xs text-muted-foreground">Create a hub before assigning local staff.</p> : hubs.map((hub) => (
                                <label key={hub.id} className="flex items-center gap-2 text-xs cursor-pointer">
                                  <input
                                    type="checkbox"
                                    checked={form.hubIds.includes(hub.id)}
                                    onChange={(event) => setField('hubIds', event.target.checked ? [...form.hubIds, hub.id] : form.hubIds.filter((id) => id !== hub.id))}
                                    disabled={submitting}
                                  />
                                  {hub.name}{hub.active ? '' : ' (Inactive)'}
                                </label>
                              ))}
                            </div>
                          )}
                        </div>
                      </Field>
                    )}
                  </div>

                  {/* RIGHT COLUMN: Temporary Password & Credential Helper Content */}
                  <div className="space-y-4">
                    <Field
                      label={
                        mode === "edit"
                          ? "Password Changes"
                          : "Temporary Password"
                      }
                      error={errors.tempPassword}
                      required={mode === "create"}
                      controlId="employee-password"
                      innerRef={(el) => (fieldRefs.current.tempPassword = el)}
                      helper={
                        mode === "edit"
                          ? "Use Send Password Reset from the employee list. Passwords are never displayed here."
                          : "User will change this on first login."
                      }
                    >
                      <div className="flex items-center gap-1.5">
                        <div className="relative flex-1">
                          <input
                            id="employee-password"
                            type={showPassword ? "text" : "password"}
                            value={form.tempPassword}
                            onChange={(e) =>
                              setField("tempPassword", e.target.value)
                            }
                            placeholder={mode === "edit" ? "Use Send Password Reset" : "Min. 8 characters"}
                            className="ar-input pr-9"
                            autoComplete="new-password"
                            disabled={submitting || mode === "edit"}
                          />
                          {mode === "create" && <button
                            type="button"
                            onClick={() => setShowPassword((s) => !s)}
                            className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded text-muted-foreground hover:text-foreground cursor-pointer"
                          >
                            {showPassword ? (
                              <EyeOff className="w-4 h-4" />
                            ) : (
                              <Eye className="w-4 h-4" />
                            )}
                          </button>}
                        </div>
                        {mode === "create" && <button
                          type="button"
                          disabled={submitting}
                          onClick={() => {
                            const chars =
                              "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*";
                            let pass = "";
                            for (let i = 0; i < 12; i++) {
                              pass += chars.charAt(
                                Math.floor(Math.random() * chars.length),
                              );
                            }
                            setField("tempPassword", pass);
                            setShowPassword(true);
                          }}
                          className="inline-flex items-center gap-1.5 px-3 h-9 rounded-md bg-white border border-border text-xs text-foreground hover:border-primary/30 hover:text-primary transition shrink-0 cursor-pointer font-semibold"
                        >
                          <Sparkles className="w-3.5 h-3.5" /> Generate
                        </button>}
                      </div>
                    </Field>

                    {mode === "create" ? (
                      <div className="rounded-lg border border-border bg-panel-bg/60 p-3.5 space-y-2.5">
                        <div className="flex items-center gap-2 text-xs font-semibold text-foreground">
                          <ShieldCheck className="w-4 h-4 text-primary shrink-0" />
                          <span>Credential Security Policy</span>
                        </div>
                        <ul className="text-[11px] text-muted-foreground space-y-1.5 leading-relaxed">
                          <li className="flex items-start gap-1.5">
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5" />
                            <span>Temporary password requires at least 8 characters.</span>
                          </li>
                          <li className="flex items-start gap-1.5">
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5" />
                            <span>Staff will be prompted to set a personal password upon first sign-in.</span>
                          </li>
                          <li className="flex items-start gap-1.5">
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5" />
                            <span>Account becomes active immediately upon saving.</span>
                          </li>
                        </ul>
                      </div>
                    ) : (
                      <div className="rounded-lg border border-border bg-panel-bg/60 p-3.5 space-y-2">
                        <div className="flex items-center gap-2 text-xs font-semibold text-foreground">
                          <ShieldCheck className="w-4 h-4 text-primary shrink-0" />
                          <span>Password Management</span>
                        </div>
                        <p className="text-[11px] text-muted-foreground leading-relaxed">
                          Active staff passwords are encrypted and cannot be viewed or changed directly. Use the Send Password Reset action from the Users Registry list to dispatch a secure reset link.
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* CARD: Remarks & Notes */}
            <div id="notes" className="bg-white rounded-xl border border-border p-5 md:p-6 shadow-sm space-y-4">
              <div className="text-sm font-bold text-accent-foreground uppercase tracking-wider border-b border-border pb-2">
                HR Onboarding Notes / Remarks (Optional)
              </div>
              <Field
                label="Notes & Observations"
                error={errors.notes}
                innerRef={(el) => (fieldRefs.current.notes = el)}
              >
                <textarea
                  value={form.notes}
                  onChange={(e) => setField("notes", e.target.value)}
                  placeholder="Type any HR remarks, performance/onboarding metrics here..."
                  className="ar-textarea"
                  disabled={submitting}
                  rows={4}
                />
              </Field>
            </div>
          </div>

          {/* RIGHT AREA: Rider operations/scanning (1/3 width sidebar) */}
          {isRider && (
            <div className="space-y-6">
              {/* CARD 3: Face photo scanning */}
              <div id="face" className="bg-white rounded-xl border border-border p-5 md:p-6 shadow-sm space-y-4">
                <label htmlFor="face-registration-file" id="face-registration-label" className="block text-sm font-bold text-accent-foreground uppercase tracking-wider border-b border-border pb-2">
                  Face Registration <span className="text-red-600" aria-hidden="true">*</span><span className="sr-only"> required</span>
                </label>

                <div role="group" aria-labelledby="face-registration-label" aria-describedby={errors.faceImage ? "face-registration-error" : undefined} aria-invalid={Boolean(errors.faceImage)} className="flex flex-col items-center justify-center p-4 bg-panel-bg rounded-xl border border-border relative">
                  <img
                    src={
                      form.faceImage ??
                      user?.avatar ??
                      `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(
                        `${form.firstName} ${form.lastName}`.trim() || "new",
                      )}&backgroundColor=fff1e0`
                    }
                    alt="Rider Portrait"
                    className="w-28 h-28 rounded-full border-2 border-white ring-4 ring-primary/15 object-cover shadow-md mb-4 bg-white"
                  />

                  <div className="flex items-center gap-2 w-full">
                    <input
                      id="face-registration-file"
                      ref={fileInputRef}
                      type="file"
                      accept="image/png,image/jpeg"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        const reader = new FileReader();
                        reader.onload = async () => {
                          const result = reader.result;
                          if (typeof result === "string") {
                            const compressed =
                              await compressBase64Image(result);

                            try {
                              const active = await ensureScriptsLoaded();
                              if (active) {
                                await loadFaceModels();
                                const img = new Image();
                                img.onload = async () => {
                                  const desc = await getFaceDescriptor(img);
                                  if (desc) {
                                    const descriptorArray = Array.from(desc);
                                    // Check duplicate face biometric immediately on 2x2 image upload
                                    const existingRiderId = mode === "edit" ? (user as unknown as { rider_id?: string; riderId?: string })?.rider_id || (user as unknown as { riderId?: string })?.riderId : undefined;
                                    const dupCheck = await checkEmployeeDuplicates({
                                      faceDescriptor: descriptorArray,
                                      excludeRiderId: existingRiderId,
                                    });

                                    if (dupCheck.hasDuplicate && dupCheck.duplicateField === "face_descriptor") {
                                      pushToast({
                                        title: "Duplicate Face Biometric Blocked",
                                        description: dupCheck.message || "This face is already registered to another employee.",
                                        tone: "error",
                                      });
                                      setErrors(prev => ({ ...prev, faceImage: dupCheck.message }));
                                      setField("faceImage", null);
                                      setField("faceDescriptor", null);
                                      return;
                                    }

                                    console.log(
                                      "[Admin UserForm] Face descriptor extracted & verified from upload.",
                                    );
                                    setField("faceImage", compressed);
                                    setField("faceDescriptor", descriptorArray);
                                    setErrors(prev => ({ ...prev, faceImage: undefined }));
                                  } else {
                                    pushToast({
                                      title: "Invalid Face Photo",
                                      description:
                                        "No face detected. Please upload a clear 2x2 front-facing photo.",
                                      tone: "warning",
                                    });
                                    setField("faceImage", compressed);
                                  }
                                };
                                img.src = compressed;
                              } else {
                                setField("faceImage", compressed);
                              }
                            } catch (err) {
                              console.error(
                                "[Admin UserForm] Extraction failed:",
                                err,
                              );
                              setField("faceImage", compressed);
                            }
                          }
                        };
                        reader.readAsDataURL(file);
                        e.target.value = "";
                      }}
                    />
                    <button
                      type="button"
                      disabled={submitting}
                      onClick={() => fileInputRef.current?.click()}
                      className="flex-1 inline-flex items-center justify-center gap-1.5 h-9 rounded-md bg-white border border-border text-xs text-foreground hover:border-primary/30 hover:text-primary transition cursor-pointer font-semibold shadow-sm"
                    >
                      <Upload className="w-3.5 h-3.5" /> Upload
                    </button>
                    <button
                      type="button"
                      disabled={submitting}
                      onClick={() => setCameraOpen(true)}
                      className="flex-1 inline-flex items-center justify-center gap-1.5 h-9 rounded-md bg-primary text-white text-xs hover:bg-primary-hover transition cursor-pointer font-semibold shadow-sm"
                    >
                      <Camera className="w-3.5 h-3.5" /> Scan Face
                    </button>
                  </div>

                  {form.faceImage && (
                    <button
                      type="button"
                      disabled={submitting}
                      onClick={() => {
                        setField("faceImage", null);
                        setField("faceDescriptor", null);
                      }}
                      className="mt-3 inline-flex items-center gap-1 text-[10px] text-muted-foreground hover:text-red-600 transition cursor-pointer font-medium"
                    >
                      <Trash2 className="w-3.5 h-3.5" /> Remove Face
                      Registration
                    </button>
                  )}
                </div>

                {/* Status bar */}
                <div ref={(el) => (fieldRefs.current.faceImage = el)}>
                  <div
                    className={`rounded-lg border px-3 py-2.5 flex items-center justify-between transition ${
                      errors.faceImage
                        ? "border-red-200 bg-red-50/40"
                        : form.faceImage
                          ? "border-emerald-200 bg-emerald-50/40"
                          : "border-border bg-panel-bg"
                    }`}
                  >
                    <div className="flex items-center gap-2 text-xs">
                      {form.faceImage ? (
                        <>
                          <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                          <span className="font-bold text-emerald-700">
                            Face Verified &amp; Registered
                          </span>
                        </>
                      ) : (
                        <>
                          <AlertTriangle className="w-4 h-4 text-primary shrink-0" />
                          <span className="text-muted-foreground">
                            Scan face to enroll rider.
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                  {errors.faceImage && (
                    <div id="face-registration-error" role="alert" className="mt-1 text-[10px] text-red-600 font-medium">
                      {errors.faceImage}
                    </div>
                  )}
                </div>
              </div>

              {/* CARD 4: Operational Configs */}
              <div id="operations" className="bg-white rounded-xl border border-border p-5 md:p-6 shadow-sm space-y-4">
                <div className="text-sm font-bold text-accent-foreground uppercase tracking-wider border-b border-border pb-2">
                  Operational Settings
                </div>

                <Field
                  label="MKB Rider ID"
                  required
                  controlId="mkb-rider-id"
                  error={errors.mkbRiderId}
                  innerRef={(el) => (fieldRefs.current.mkbRiderId = el)}
                >
                  <div className="flex items-center gap-1.5">
                    <input
                      id="mkb-rider-id"
                      value={form.mkbRiderId}
                      onChange={(e) =>
                        setField("mkbRiderId", e.target.value.toUpperCase())
                      }
                      placeholder="MKB-0000"
                      className="ar-input font-mono flex-1"
                      disabled={submitting}
                    />
                    <button
                      type="button"
                      disabled={submitting}
                      onClick={() => setField("mkbRiderId", generateMkbId())}
                      className="inline-flex items-center gap-1 px-2 h-9 rounded-md bg-white border border-border text-[10px] text-foreground hover:border-primary/30 hover:text-primary transition shrink-0 cursor-pointer font-semibold"
                    >
                      <Sparkles className="w-3.5 h-3.5" /> Generate
                    </button>
                  </div>
                </Field>

                <Field
                  label="Assigned Hub"
                  required
                  controlId="assigned-hub"
                  error={errors.hubId}
                  innerRef={(el) => (fieldRefs.current.hubId = el)}
                >
                  <select
                    id="assigned-hub"
                    value={form.hubId}
                    onChange={(event) => setRiderHub(event.target.value)}
                    className="ar-input"
                    disabled={submitting || riderHubLocked || mode === "edit"}
                  >
                    <option value="">Select a hub</option>
                    {activeAuthorizedHubs.map((hub) => (
                      <option key={hub.id} value={hub.id}>{hub.name}</option>
                    ))}
                  </select>
                  {riderHubLocked && form.hubId && (
                    <p className="mt-1.5 text-[10px] text-muted-foreground">
                      This Rider is locked to your assigned hub.
                    </p>
                  )}
                  {mode === "edit" && (
                    <p className="mt-1.5 text-[10px] text-muted-foreground">
                      Use Rider Assignments to transfer or temporarily deploy an existing Rider.
                    </p>
                  )}
                  {activeAuthorizedHubs.length === 0 && (
                    <p className="mt-1.5 text-[10px] text-muted-foreground">
                      No active authorized hubs are available.
                    </p>
                  )}
                </Field>

                <Field
                  label="Assigned Geofence Zone"
                  required
                  error={errors.zoneId}
                  innerRef={(el) => (fieldRefs.current.zoneId = el)}
                >
                  <select
                    value={form.zoneId}
                    onChange={(e) => setField("zoneId", e.target.value)}
                    className="ar-input"
                    disabled={submitting || !form.hubId || mode === "edit"}
                  >
                    <option value="">{form.hubId ? "Select a zone" : "Select a hub first"}</option>
                    {riderZones.map((z) => (
                        <option key={z.id} value={z.id}>
                          {z.name}
                        </option>
                      ))}
                  </select>
                </Field>

                {/* Vehicle Type & Plate Details */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
                  <Field
                    label="Vehicle Type"
                    required
                    error={errors.vehicleType}
                    innerRef={(el) => (fieldRefs.current.vehicleType = el)}
                  >
                    <select
                      value={form.vehicleType}
                      onChange={(e) => setField("vehicleType", e.target.value)}
                      className="ar-input"
                      disabled={submitting}
                    >
                      <option value="">Select Type</option>
                      <option value="motorcycle">Motorcycle</option>
                      <option value="bicycle">Bicycle</option>
                      <option value="e-bike">E-Bike</option>
                      <option value="none">None</option>
                    </select>
                  </Field>
                  <Field
                    label="Vehicle Plate Number"
                    required={form.vehicleType === 'motorcycle' || form.vehicleType === 'e-bike'}
                    error={errors.vehiclePlateNumber}
                    innerRef={(el) => (fieldRefs.current.vehiclePlateNumber = el)}
                  >
                    <input
                      value={form.vehiclePlateNumber}
                      onChange={(e) => setField("vehiclePlateNumber", e.target.value.toUpperCase())}
                      placeholder={form.vehicleType === 'bicycle' || form.vehicleType === 'none' ? "N/A" : "e.g. ABC 1234"}
                      className="ar-input font-mono"
                      disabled={submitting || form.vehicleType === 'bicycle' || form.vehicleType === 'none' || form.vehicleType === ''}
                    />
                  </Field>
                </div>
              </div>

              {/* CARD 5: System Access Roles */}
              <div className="bg-white rounded-xl border border-border p-5 md:p-6 shadow-sm space-y-4">
                <div className="text-sm font-bold text-accent-foreground uppercase tracking-wider border-b border-border pb-2">
                  Access &amp; Security
                </div>

                <div className="grid grid-cols-1 gap-4">
                  <Field label="Account Status" required>
                    <div className={`h-9 rounded-md border px-3 inline-flex items-center text-xs capitalize font-bold ${form.status === 'suspended' ? 'bg-red-50 border-red-500/40 text-red-700' : 'bg-emerald-50 border-emerald-500/40 text-emerald-700'}`}>{form.status}</div>
                    <p className="mt-1.5 text-[10px] text-muted-foreground">Use the employee list account action to restrict or restore Rider access, or suspend or reactivate staff access.</p>
                  </Field>

                  {currentUserRole !== "hr" && (
                    <Field
                      label="System Role"
                      required
                      error={errors.role}
                      innerRef={(el) => (fieldRefs.current.role = el)}
                    >
                      <select
                        value={form.role}
                        onChange={(e) =>
                          setField("role", e.target.value as EditableRole)
                        }
                        className="ar-input capitalize"
                        disabled={submitting}
                      >
                        {ROLES.map((r) => (
                          <option key={r.value} value={r.value}>
                            {r.label}
                          </option>
                        ))}
                      </select>
                    </Field>
                  )}

                  <Field
                    label={
                      mode === "edit"
                        ? "Password Changes"
                        : "Temporary Password"
                    }
                    error={errors.tempPassword}
                    required={mode === "create"}
                    controlId="employee-password"
                    innerRef={(el) => (fieldRefs.current.tempPassword = el)}
                    helper={
                      mode === "edit"
                        ? "Use Send Password Reset from the employee list. Passwords are never displayed here."
                        : "User will change this on first login."
                    }
                  >
                    <div className="flex items-center gap-1.5">
                      <div className="relative flex-1">
                      <input
                        id="employee-password"
                          type={showPassword ? "text" : "password"}
                          value={form.tempPassword}
                          onChange={(e) =>
                            setField("tempPassword", e.target.value)
                          }
                          placeholder={mode === "edit" ? "Use Send Password Reset" : "Min. 8 characters"}
                          className="ar-input pr-9"
                          autoComplete="new-password"
                          disabled={submitting || mode === "edit"}
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword((s) => !s)}
                          className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded text-muted-foreground hover:text-foreground cursor-pointer"
                        >
                          {showPassword ? (
                            <EyeOff className="w-4 h-4" />
                          ) : (
                            <Eye className="w-4 h-4" />
                          )}
                        </button>
                      </div>
                      {mode === "create" && <button
                        type="button"
                        disabled={submitting}
                        onClick={() => {
                          const chars =
                            "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*";
                          let pass = "";
                          for (let i = 0; i < 12; i++) {
                            pass += chars.charAt(
                              Math.floor(Math.random() * chars.length),
                            );
                          }
                          setField("tempPassword", pass);
                          setShowPassword(true);
                        }}
                        className="inline-flex items-center gap-1.5 px-3 h-9 rounded-md bg-white border border-border text-xs text-foreground hover:border-primary/30 hover:text-primary transition shrink-0 cursor-pointer font-semibold"
                      >
                        <Sparkles className="w-3.5 h-3.5" /> Generate
                      </button>}
                    </div>
                  </Field>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {cameraOpen && (
        <FaceCaptureModal
          riderName={`${form.firstName} ${form.lastName}`.trim() || "New rider"}
          seedAvatar={
            form.faceImage ??
            `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(
              `${form.firstName} ${form.lastName}`.trim() || "capture",
            )}&backgroundColor=fff1e0`
          }
          onCancel={() => setCameraOpen(false)}
          onCapture={async (dataUrl, descriptor) => {
            if (descriptor && Array.isArray(descriptor) && descriptor.length === 128) {
              const existingRiderId = mode === "edit" ? (user as unknown as { rider_id?: string; riderId?: string })?.rider_id || (user as unknown as { riderId?: string })?.riderId : undefined;
              const dupCheck = await checkEmployeeDuplicates({
                faceDescriptor: descriptor,
                excludeRiderId: existingRiderId,
              });

              if (dupCheck.hasDuplicate && dupCheck.duplicateField === "face_descriptor") {
                pushToast({
                  title: "Duplicate Face Biometric Blocked",
                  description: dupCheck.message || "This face is already registered to another employee.",
                  tone: "error",
                });
                setErrors(prev => ({ ...prev, faceImage: dupCheck.message }));
                setCameraOpen(false);
                return;
              }
            }

            const compressed = await compressBase64Image(dataUrl);
            setField("faceImage", compressed);
            setField("faceDescriptor", descriptor);
            setErrors(prev => ({ ...prev, faceImage: undefined }));
            setCameraOpen(false);
          }}
        />
      )}
    </div>
  );
}

function Field({
  label,
  children,
  error,
  helper,
  innerRef,
  required = false,
  controlId,
}: {
  label: string;
  children: React.ReactNode;
  error?: string;
  helper?: string;
  innerRef?: (el: HTMLDivElement | null) => void;
  required?: boolean;
  controlId?: string;
}) {
  const fieldId = useId();
  const messageId = `${fieldId}-message`;
  const isDirectControl =
    isValidElement(children) &&
    typeof children.type === "string" &&
    ["input", "select", "textarea"].includes(children.type);
  const control = isDirectControl
    ? cloneElement(children as React.ReactElement<Record<string, unknown>>, {
        id: fieldId,
        "aria-required": required || undefined,
        "aria-invalid": Boolean(error),
        "aria-describedby": error || helper ? messageId : undefined,
      })
    : children;

  return (
    <div ref={innerRef} className="space-y-1 w-full">
      <label
        id={`${fieldId}-label`}
        htmlFor={isDirectControl ? fieldId : controlId}
        className="block text-[11px] uppercase tracking-[0.14em] text-muted-foreground font-semibold"
      >
        {label}{required && <><span className="text-red-600" aria-hidden="true"> *</span><span className="sr-only"> required</span></>}
      </label>
      {isDirectControl ? control : <div role="group" aria-labelledby={`${fieldId}-label`} aria-required={required || undefined} aria-invalid={Boolean(error)} aria-describedby={error || helper ? messageId : undefined}>{control}</div>}
      {error ? (
        <div id={messageId} className="text-[10px] text-red-600 font-medium" role="alert">{error}</div>
      ) : helper ? (
        <div id={messageId} className="text-[10px] text-muted-foreground font-medium">{helper}</div>
      ) : null}
    </div>
  );
}
