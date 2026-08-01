import { useEffect, useMemo, useState, useRef } from "react";
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
} from "lucide-react";
import type { AppUser, UserRole, Zone } from "../../services/types";
import { pushToast } from "../../hooks/useToast";
import { useAuth } from "../../hooks/useAuth";
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
  validate,
} from "./userFormUtils";
import { checkEmployeeDuplicates } from "../../services/userService";

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
  zoneId: "",
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

export function UserForm({ user, zones, onClose, onSaved }: UserFormProps) {
  const { session } = useAuth();
  const currentUserRole = session?.role;
  const mode: "create" | "edit" = user ? "edit" : "create";

  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [errors, setErrors] = useState<FormErrors>({});
  const [submitting, setSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showSummary, setShowSummary] = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

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

      setForm({
        firstName: fName,
        middleName: mName,
        lastName: lName,
        email: user.email,
        contact: (user as UserWithExtensions).contact ?? "",
        tempPassword: "",
        role: safeRole,
        status: user.status,
        mkbRiderId: (user as UserWithExtensions).mkbRiderId ?? "",
        zoneId: user.zoneId ?? "",
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
      });

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
      setForm({
        ...EMPTY_FORM,
        role: currentUserRole === "hr" ? "rider" : "admin",
      });
    }
    setErrors({});
    setShowSummary(false);
    setShowPassword(false);
    setSubmitting(false);
  }, [user, currentUserRole]);

  const isRider = form.role === "rider";



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

  const handleSubmit = async () => {
    const v = validate(form, mode);
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
        status: form.status,
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
    <div className="flex flex-col min-h-screen bg-[#FAFAF7] text-[#1A1410] font-[Geist,sans-serif]">
      {/* Top sticky action header */}
      <div className="sticky top-0 bg-[#FAFAF7]/90 backdrop-blur-md border-b border-[#EFEAE2] z-50 px-4 py-3 md:px-6 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="p-2 -ml-2 rounded-lg text-[#6B6258] hover:text-[#1A1410] hover:bg-[#EFEAE2]/50 transition shrink-0 cursor-pointer"
            aria-label="Back"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-lg font-bold tracking-tight text-[#1A1410]">
              {mode === "edit"
                ? `Edit User: ${form.firstName} ${form.lastName}`
                : "Add New User"}
            </h1>
            <p className="text-xs text-[#6B6258] hidden sm:block">
              {mode === "edit"
                ? "Modify user profile, system access roles, and assignments."
                : "Register a new account and configure settings."}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="px-4 h-9 rounded-md bg-white border border-[#EFEAE2] text-sm text-[#1A1410] hover:border-[#db6c00]/30 transition disabled:opacity-50 cursor-pointer font-medium"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={submitting}
            className="px-5 h-9 rounded-md bg-[#db6c00] hover:bg-[#b85a00] active:bg-[#a04e00] text-white text-sm font-semibold focus:ring-2 focus:ring-[#db6c00]/25 transition disabled:opacity-70 cursor-pointer inline-flex items-center justify-center gap-2 shadow-sm"
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
      <div className="flex-1 max-w-7xl w-full mx-auto px-4 py-6 md:px-6 space-y-6">
        {showSummary && errorList.length > 0 && (
          <div className="rounded-xl border border-[#db6c00]/30 bg-[#FFF1E0] p-4 flex items-start gap-3 shadow-sm">
            <AlertTriangle className="w-5 h-5 text-[#b85a00] shrink-0" />
            <div>
              <div className="text-sm font-semibold text-[#b85a00] mb-1">
                Please fix {errorList.length} issue
                {errorList.length === 1 ? "" : "s"} before saving:
              </div>
              <ul className="list-disc list-inside text-xs text-[#6B6258] space-y-1">
                {errorList.map(([k, v]) => (
                  <li key={k}>{v}</li>
                ))}
              </ul>
            </div>
          </div>
        )}

        <div
          className={`grid gap-6 ${isRider ? "grid-cols-1 lg:grid-cols-3" : "max-w-3xl mx-auto grid-cols-1"}`}
        >
          {/* LEFT AREA: Spacious details (2/3 width for Rider, full for non-Rider) */}
          <div className={`space-y-6 ${isRider ? "lg:col-span-2" : ""}`}>
            {/* CARD 1: Account Info */}
            <div id="personal" className="bg-white rounded-xl border border-[#EFEAE2] p-5 md:p-6 shadow-sm space-y-5">
              <div className="text-sm font-bold text-[#b85a00] uppercase tracking-wider border-b border-[#EFEAE2] pb-2">
                Personal Information
              </div>

              {/* Name Fields */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <Field
                  label="First Name"
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
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field
                  label="Email Address"
                  error={errors.email}
                  innerRef={(el) => (fieldRefs.current.email = el)}
                >
                  <input
                    value={form.email}
                    onChange={(e) => setField("email", e.target.value)}
                    placeholder="name@mkb.ph"
                    className="ar-input"
                    autoComplete="off"
                    disabled={submitting}
                  />
                </Field>
                <Field
                  label="Contact Number"
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
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field
                  label="Employment Type"
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
                  error={errors.dateOfHire}
                  innerRef={(el) => (fieldRefs.current.dateOfHire = el)}
                >
                  <input
                    type="date"
                    value={form.dateOfHire}
                    onChange={(e) => setField("dateOfHire", e.target.value)}
                    className="ar-input text-[#1A1410] uppercase text-xs"
                    disabled={submitting}
                  />
                </Field>
              </div>
            </div>

            {/* CARD 2: Home Address (Only for Rider) */}
            {isRider && (
              <>
                <div id="address" className="bg-white rounded-xl border border-[#EFEAE2] p-5 md:p-6 shadow-sm space-y-5">
                  <div className="text-sm font-bold text-[#b85a00] uppercase tracking-wider border-b border-[#EFEAE2] pb-2">
                    Address Details (Locked to Philippines)
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <Field
                      label="Province"
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
                <div id="emergency" className="bg-white rounded-xl border border-[#EFEAE2] p-5 md:p-6 shadow-sm space-y-5">
                  <div className="text-sm font-bold text-[#b85a00] uppercase tracking-wider border-b border-[#EFEAE2] pb-2">
                    Emergency Contact Details (Required)
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <Field
                      label="Emergency Contact Name"
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
              <div className="bg-white rounded-xl border border-[#EFEAE2] p-5 md:p-6 shadow-sm space-y-5">
                <div className="text-sm font-bold text-[#b85a00] uppercase tracking-wider border-b border-[#EFEAE2] pb-2">
                  Account Configuration &amp; Credentials
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Field label="Account Status">
                    <div className="flex gap-2">
                      {(["active", "suspended"] as const).map((s) => (
                        <button
                          key={s}
                          type="button"
                          disabled={submitting}
                          onClick={() => setField("status", s)}
                          className={`flex-1 h-9 rounded-md border text-xs capitalize font-semibold transition ${
                            form.status === s
                              ? s === "active"
                                ? "bg-emerald-50 border-emerald-500/40 text-emerald-700 font-bold"
                                : "bg-red-50 border-red-500/40 text-red-700 font-bold"
                              : "bg-white border-[#EFEAE2] text-[#1A1410] hover:border-[#db6c00]/30 cursor-pointer"
                          }`}
                        >
                          {s}
                        </button>
                      ))}
                    </div>
                  </Field>

                  {currentUserRole !== "hr" && (
                    <Field
                      label="System Role"
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
                </div>

                <Field
                  label={
                    mode === "edit"
                      ? "Reset Password (optional)"
                      : "Temporary Password"
                  }
                  error={errors.tempPassword}
                  innerRef={(el) => (fieldRefs.current.tempPassword = el)}
                  helper={
                    mode === "edit"
                      ? "Leave blank to keep current password."
                      : "User will change this on first login."
                  }
                >
                  <div className="flex items-center gap-1.5">
                    <div className="relative flex-1">
                      <input
                        type={showPassword ? "text" : "password"}
                        value={form.tempPassword}
                        onChange={(e) =>
                          setField("tempPassword", e.target.value)
                        }
                        placeholder="Min. 8 characters"
                        className="ar-input pr-9"
                        autoComplete="new-password"
                        disabled={submitting}
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword((s) => !s)}
                        className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded text-[#6B6258] hover:text-[#1A1410] cursor-pointer"
                      >
                        {showPassword ? (
                          <EyeOff className="w-4 h-4" />
                        ) : (
                          <Eye className="w-4 h-4" />
                        )}
                      </button>
                    </div>
                    <button
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
                      className="inline-flex items-center gap-1.5 px-3 h-9 rounded-md bg-white border border-[#EFEAE2] text-xs text-[#1A1410] hover:border-[#db6c00]/30 hover:text-[#db6c00] transition shrink-0 cursor-pointer font-semibold"
                    >
                      <Sparkles className="w-3.5 h-3.5" /> Generate
                    </button>
                  </div>
                </Field>
              </div>
            )}

            {/* CARD: Remarks & Notes */}
            <div id="notes" className="bg-white rounded-xl border border-[#EFEAE2] p-5 md:p-6 shadow-sm space-y-4">
              <div className="text-sm font-bold text-[#b85a00] uppercase tracking-wider border-b border-[#EFEAE2] pb-2">
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
              <div id="face" className="bg-white rounded-xl border border-[#EFEAE2] p-5 md:p-6 shadow-sm space-y-4">
                <div className="text-sm font-bold text-[#b85a00] uppercase tracking-wider border-b border-[#EFEAE2] pb-2">
                  Face Registration
                </div>

                <div className="flex flex-col items-center justify-center p-4 bg-[#FAFAF7] rounded-xl border border-[#EFEAE2] relative">
                  <img
                    src={
                      form.faceImage ??
                      user?.avatar ??
                      `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(
                        `${form.firstName} ${form.lastName}`.trim() || "new",
                      )}&backgroundColor=fff1e0`
                    }
                    alt="Rider Portrait"
                    className="w-28 h-28 rounded-full border-2 border-white ring-4 ring-[#db6c00]/15 object-cover shadow-md mb-4 bg-white"
                  />

                  <div className="flex items-center gap-2 w-full">
                    <input
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
                      className="flex-1 inline-flex items-center justify-center gap-1.5 h-9 rounded-md bg-white border border-[#EFEAE2] text-xs text-[#1A1410] hover:border-[#db6c00]/30 hover:text-[#db6c00] transition cursor-pointer font-semibold shadow-sm"
                    >
                      <Upload className="w-3.5 h-3.5" /> Upload
                    </button>
                    <button
                      type="button"
                      disabled={submitting}
                      onClick={() => setCameraOpen(true)}
                      className="flex-1 inline-flex items-center justify-center gap-1.5 h-9 rounded-md bg-[#db6c00] text-white text-xs hover:bg-[#b85a00] transition cursor-pointer font-semibold shadow-sm"
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
                      className="mt-3 inline-flex items-center gap-1 text-[10px] text-[#6B6258] hover:text-red-600 transition cursor-pointer font-medium"
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
                          : "border-[#EFEAE2] bg-[#FAFAF7]"
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
                          <AlertTriangle className="w-4 h-4 text-[#db6c00] shrink-0" />
                          <span className="text-[#6B6258]">
                            Scan face to enroll rider.
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                  {errors.faceImage && (
                    <div className="mt-1 text-[10px] text-red-600 font-medium">
                      {errors.faceImage}
                    </div>
                  )}
                </div>
              </div>

              {/* CARD 4: Operational Configs */}
              <div id="operations" className="bg-white rounded-xl border border-[#EFEAE2] p-5 md:p-6 shadow-sm space-y-4">
                <div className="text-sm font-bold text-[#b85a00] uppercase tracking-wider border-b border-[#EFEAE2] pb-2">
                  Operational Settings
                </div>

                <Field
                  label="MKB Rider ID"
                  error={errors.mkbRiderId}
                  innerRef={(el) => (fieldRefs.current.mkbRiderId = el)}
                >
                  <div className="flex items-center gap-1.5">
                    <input
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
                      className="inline-flex items-center gap-1 px-2 h-9 rounded-md bg-white border border-[#EFEAE2] text-[10px] text-[#1A1410] hover:border-[#db6c00]/30 hover:text-[#db6c00] transition shrink-0 cursor-pointer font-semibold"
                    >
                      <Sparkles className="w-3.5 h-3.5" /> Generate
                    </button>
                  </div>
                </Field>

                <Field
                  label="Assigned Geofence Zone"
                  error={errors.zoneId}
                  innerRef={(el) => (fieldRefs.current.zoneId = el)}
                >
                  <select
                    value={form.zoneId}
                    onChange={(e) => setField("zoneId", e.target.value)}
                    className="ar-input"
                    disabled={submitting}
                  >
                    <option value="">Unassigned</option>
                    {zones
                      .filter(
                        (z) => z.status === "active" || z.id === form.zoneId,
                      )
                      .map((z) => (
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
              <div className="bg-white rounded-xl border border-[#EFEAE2] p-5 md:p-6 shadow-sm space-y-4">
                <div className="text-sm font-bold text-[#b85a00] uppercase tracking-wider border-b border-[#EFEAE2] pb-2">
                  Access &amp; Security
                </div>

                <div className="grid grid-cols-1 gap-4">
                  <Field label="Account Status">
                    <div className="flex gap-2">
                      {(["active", "suspended"] as const).map((s) => (
                        <button
                          key={s}
                          type="button"
                          disabled={submitting}
                          onClick={() => setField("status", s)}
                          className={`flex-1 h-9 rounded-md border text-xs capitalize font-semibold transition ${
                            form.status === s
                              ? s === "active"
                                ? "bg-emerald-50 border-emerald-500/40 text-emerald-700 font-bold"
                                : "bg-red-50 border-red-500/40 text-red-700 font-bold"
                              : "bg-white border-[#EFEAE2] text-[#1A1410] hover:border-[#db6c00]/30 cursor-pointer"
                          }`}
                        >
                          {s}
                        </button>
                      ))}
                    </div>
                  </Field>

                  {currentUserRole !== "hr" && (
                    <Field
                      label="System Role"
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
                        ? "Reset Password (optional)"
                        : "Temporary Password"
                    }
                    error={errors.tempPassword}
                    innerRef={(el) => (fieldRefs.current.tempPassword = el)}
                    helper={
                      mode === "edit"
                        ? "Leave blank to keep current password."
                        : "User will change this on first login."
                    }
                  >
                    <div className="flex items-center gap-1.5">
                      <div className="relative flex-1">
                        <input
                          type={showPassword ? "text" : "password"}
                          value={form.tempPassword}
                          onChange={(e) =>
                            setField("tempPassword", e.target.value)
                          }
                          placeholder="Min. 8 characters"
                          className="ar-input pr-9"
                          autoComplete="new-password"
                          disabled={submitting}
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword((s) => !s)}
                          className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded text-[#6B6258] hover:text-[#1A1410] cursor-pointer"
                        >
                          {showPassword ? (
                            <EyeOff className="w-4 h-4" />
                          ) : (
                            <Eye className="w-4 h-4" />
                          )}
                        </button>
                      </div>
                      <button
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
                        className="inline-flex items-center gap-1.5 px-3 h-9 rounded-md bg-white border border-[#EFEAE2] text-xs text-[#1A1410] hover:border-[#db6c00]/30 hover:text-[#db6c00] transition shrink-0 cursor-pointer font-semibold"
                      >
                        <Sparkles className="w-3.5 h-3.5" /> Generate
                      </button>
                    </div>
                  </Field>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

    <style>{`
      .ar-input {
        width: 100%;
        height: 36px;
        padding: 0 12px;
        background: #FFFFFF;
        border: 1px solid #EFEAE2;
        border-radius: 6px;
        color: #1A1410;
        font-size: 13px;
        outline: none;
        transition: border-color 150ms ease, box-shadow 150ms ease;
      }
      .ar-input:focus { border-color: #db6c00; box-shadow: 0 0 0 3px rgba(219, 108, 0, 0.15); }
      .ar-input::placeholder { color: #A39B8E; }
      .ar-input:disabled { background: #FAFAF7; color: #6B6258; cursor: not-allowed; }
      select.ar-input {
        appearance: none;
        background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%236B6258' stroke-width='2'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E");
        background-repeat: no-repeat;
        background-position: right 10px center;
        padding-right: 28px;
      }
      .ar-textarea {
        width: 100%;
        padding: 10px 12px;
        background: #FFFFFF;
        border: 1px solid #EFEAE2;
        border-radius: 6px;
        color: #1A1410;
        font-size: 13px;
        outline: none;
        resize: vertical;
        transition: border-color 150ms ease, box-shadow 150ms ease;
      }
      .ar-textarea:focus { border-color: #db6c00; box-shadow: 0 0 0 3px rgba(219, 108, 0, 0.15); }
      .ar-textarea::placeholder { color: #A39B8E; }
      .ar-textarea:disabled { background: #FAFAF7; color: #6B6258; cursor: not-allowed; }
    `}</style>

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
}: {
  label: string;
  children: React.ReactNode;
  error?: string;
  helper?: string;
  innerRef?: (el: HTMLDivElement | null) => void;
}) {
  return (
    <div ref={innerRef} className="space-y-1 w-full">
      <label className="block text-[11px] uppercase tracking-[0.14em] text-[#6B6258] font-semibold">
        {label}
      </label>
      {children}
      {error ? (
        <div className="text-[10px] text-red-600 font-medium">{error}</div>
      ) : helper ? (
        <div className="text-[10px] text-[#6B6258] font-medium">{helper}</div>
      ) : null}
    </div>
  );
}
