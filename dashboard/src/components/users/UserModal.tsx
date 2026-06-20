import { useEffect, useMemo, useState, useRef } from 'react';
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
  X
} from 'lucide-react';
import type { AppUser, UserRole, Zone } from '../../services/types';
import { FaceScanner } from '../attendance/FaceScanner';
import { useFaceRecognition } from '../../hooks/useFaceRecognition';
import { pushToast } from '../../hooks/useToast';
import { useAuth } from '../../hooks/useAuth';
import { Modal } from '../common/Modal';
import { PROVINCES, PHILIPPINES_LOCATIONS } from '../../lib/phLocations';
import {
  ensureScriptsLoaded,
  loadFaceModels,
  getFaceDescriptor,
  getDescriptorFromUrl
} from '../../lib/faceAi';

type EditableRole = 'admin' | 'hr' | 'rider' | 'payroll';
type Shift = 'morning' | 'afternoon' | 'evening' | '';

type UserWithExtensions = AppUser & Partial<{
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
}>;

interface FormState {
  name: string;
  email: string;
  contact: string;
  tempPassword: string;
  role: EditableRole;
  status: 'active' | 'suspended';
  mkbRiderId: string;
  zoneId: string; // '' means Unassigned
  shift: Shift;
  faceImage: string | null;
  faceDescriptor: number[] | null;
  province: string;
  city: string;
  barangay: string;
  zipCode: string;
  streetAddress: string;
}

type FormErrors = Partial<Record<keyof FormState, string>>;

interface UserModalProps {
  open: boolean;
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
    },
    mode: 'create' | 'edit'
  ) => void;
}

const ROLES: {
  value: EditableRole;
  label: string;
}[] = [
  { value: 'admin', label: 'Admin' },
  { value: 'hr', label: 'HR' },
  { value: 'rider', label: 'Rider' },
  { value: 'payroll', label: 'Payroll' }
];

const SHIFTS: {
  value: Exclude<Shift, ''>;
  label: string;
  range: string;
}[] = [
  { value: 'morning', label: 'Morning', range: '6AM–2PM' },
  { value: 'afternoon', label: 'Afternoon', range: '2PM–10PM' },
  { value: 'evening', label: 'Evening', range: '10PM–6AM' }
];

const EMPTY_FORM: FormState = {
  name: '',
  email: '',
  contact: '',
  tempPassword: '',
  role: 'admin',
  status: 'active',
  mkbRiderId: '',
  zoneId: '',
  shift: '',
  faceImage: null,
  faceDescriptor: null,
  province: 'Zamboanga del Sur',
  city: 'Zamboanga City',
  barangay: '',
  zipCode: '',
  streetAddress: ''
};

function generateMkbId() {
  const n = Math.floor(1000 + Math.random() * 9000);
  return `MKB-${n}`;
}

function validate(form: FormState, mode: 'create' | 'edit'): FormErrors {
  const errors: FormErrors = {};
  if (!form.name.trim()) errors.name = 'Full name is required.';
  
  if (!form.email.trim()) {
    errors.email = 'Email is required.';
  } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) {
    errors.email = 'Invalid email format.';
  } else if (form.role !== 'rider' && !/@mkb\.ph$/i.test(form.email.trim())) {
    errors.email = 'Email must use the @mkb.ph domain.';
  }

  const digits = form.contact.replace(/\D/g, '');
  if (!digits) {
    errors.contact = 'Contact number is required.';
  } else if (digits.length !== 11) {
    errors.contact = 'Contact number must be 11 digits.';
  }

  if (mode === 'create') {
    if (!form.tempPassword)
      errors.tempPassword = 'Temporary password is required.';
    else if (form.tempPassword.length < 8)
      errors.tempPassword = 'Must be at least 8 characters.';
  } else if (form.tempPassword && form.tempPassword.length < 8) {
    errors.tempPassword = 'Must be at least 8 characters.';
  }

  if (!form.role) errors.role = 'Role is required.';

  if (form.role === 'rider') {
    if (!form.mkbRiderId.trim()) errors.mkbRiderId = 'MKB Rider ID is required.';
    if (!form.zoneId) errors.zoneId = 'Assigned zone is required.';
    if (!form.shift) errors.shift = 'Shift is required.';
    if (!form.faceImage) errors.faceImage = 'Face registration is required.';
    if (!form.province) errors.province = 'Province is required.';
    if (!form.city) errors.city = 'City/Municipality is required.';
    if (!form.barangay.trim()) errors.barangay = 'Barangay is required.';
    if (!form.zipCode.trim()) errors.zipCode = 'Zip Code is required.';
    if (!form.streetAddress.trim()) errors.streetAddress = 'Street Address is required.';
  }

  return errors;
}

export function UserModal({ open, user, zones, onClose, onSaved }: UserModalProps) {
  const { session } = useAuth();
  const currentUserRole = session?.role;
  const mode: 'create' | 'edit' = user ? 'edit' : 'create';

  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [errors, setErrors] = useState<FormErrors>({});
  const [submitting, setSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showSummary, setShowSummary] = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const fieldRefs = useRef<Partial<Record<keyof FormState, HTMLElement | null>>>({});

  useEffect(() => {
    if (!open) return;
    if (user) {
      const safeRole: EditableRole =
        currentUserRole === 'hr' ? 'rider' : (
        user.role === 'admin' ||
        user.role === 'hr' ||
        user.role === 'rider' ||
        user.role === 'payroll' ?
        user.role as EditableRole :
        'admin');
      
      const faceImg = (user as UserWithExtensions).faceImage ?? user.avatar ?? null;
      const faceDesc = (user as UserWithExtensions).faceDescriptor ?? null;

      setForm({
        name: user.name,
        email: user.email,
        contact: (user as UserWithExtensions).contact ?? '',
        tempPassword: '',
        role: safeRole,
        status: user.status,
        mkbRiderId: (user as UserWithExtensions).mkbRiderId ?? '',
        zoneId: user.zoneId ?? '',
        shift: (user as UserWithExtensions).shift ?? '',
        faceImage: faceImg,
        faceDescriptor: faceDesc,
        province: (user as UserWithExtensions).province || 'Zamboanga del Sur',
        city: (user as UserWithExtensions).city || 'Zamboanga City',
        barangay: (user as UserWithExtensions).barangay || '',
        zipCode: (user as UserWithExtensions).zipCode || '',
        streetAddress: (user as UserWithExtensions).streetAddress || ''
      });

      // Auto-compile descriptor in background if missing for a rider
      if (safeRole === 'rider' && faceImg && !faceDesc && !faceImg.includes('dicebear') && !faceImg.endsWith('.svg')) {
        console.log('[Admin UserModal] Auto-compiling missing descriptor for user:', user.name);
        (async () => {
          try {
            const active = await ensureScriptsLoaded();
            if (active) {
              await loadFaceModels();
              const desc = await getDescriptorFromUrl(faceImg);
              if (desc) {
                console.log('[Admin UserModal] Auto-compiled descriptor successfully in background.');
                setForm(f => ({ ...f, faceDescriptor: Array.from(desc) }));
              }
            }
          } catch (err) {
            console.warn('[Admin UserModal] Background descriptor compilation failed:', err);
          }
        })();
      }
    } else {
      setForm({
        ...EMPTY_FORM,
        role: currentUserRole === 'hr' ? 'rider' : 'admin'
      });
    }
    setErrors({});
    setShowSummary(false);
    setShowPassword(false);
    setSubmitting(false);
  }, [user, open, currentUserRole]);

  const isRider = form.role === 'rider';

  // Dynamic lists based on province selection
  const cities = useMemo(() => {
    if (!form.province) return [];
    return PHILIPPINES_LOCATIONS[form.province] || [];
  }, [form.province]);

  const setField = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((f) => {
      const next = { ...f, [key]: value };
      // Cascade city selection when province changes
      if (key === 'province') {
        const nextCities = PHILIPPINES_LOCATIONS[value as string] || [];
        next.city = nextCities.includes('Zamboanga City') ? 'Zamboanga City' : nextCities[0] || '';
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
      // Scroll first error into view
      const firstKey = Object.keys(v)[0] as keyof FormState;
      const el = fieldRefs.current[firstKey];
      if (el && typeof el.scrollIntoView === 'function') {
        el.scrollIntoView({
          behavior: 'smooth',
          block: 'center'
        });
      }
      return;
    }
    setShowSummary(false);
    setSubmitting(true);
    try {
      const saved = {
        id: user?.id ?? `u-${Date.now()}`,
        name: form.name.trim(),
        email: form.email.trim(),
        avatar:
          form.faceImage ??
          user?.avatar ??
          `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(form.name || 'new')}&backgroundColor=fff1e0`,
        role: form.role as UserRole,
        zoneId: form.role === 'rider' ? form.zoneId || null : null,
        status: form.status,
        lastLogin: user?.lastLogin ?? 0,
        contact: form.contact,
        mkbRiderId: form.role === 'rider' ? form.mkbRiderId : '',
        shift: form.role === 'rider' ? form.shift : '',
        faceImage: form.role === 'rider' ? form.faceImage : null,
        faceDescriptor: form.role === 'rider' ? form.faceDescriptor : null,
        tempPassword: form.tempPassword,
        // Location parameters
        province: form.role === 'rider' ? form.province : '',
        city: form.role === 'rider' ? form.city : '',
        barangay: form.role === 'rider' ? form.barangay.trim() : '',
        zipCode: form.role === 'rider' ? form.zipCode.trim() : '',
        streetAddress: form.role === 'rider' ? form.streetAddress.trim() : ''
      };

      await onSaved?.(saved, mode);
      pushToast({
        title: mode === 'create' ? 'User created successfully' : 'User updated',
        description:
          mode === 'create' ?
          `${saved.name} (${ROLES.find((r) => r.value === saved.role)?.label ?? saved.role})` :
          saved.name,
        tone: 'success'
      });
      onClose();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Try again.';
      console.error(err);
      pushToast({
        title: mode === 'create' ? 'Failed to create user' : 'Failed to update user',
        description: message,
        tone: 'error'
      });
    } finally {
      setSubmitting(false);
    }
  };

  const errorList = useMemo(
    () => Object.entries(errors).filter(([, v]) => !!v) as [keyof FormState, string][],
    [errors]
  );

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={mode === 'edit' ? 'Edit User' : 'Add User'}
      subtitle="Manage user credentials, permissions, and location assignments."
      size={isRider ? '2xl' : 'lg'}
      dismissible={!submitting}
    >
      <div className="flex flex-col max-h-[75vh]">
        {/* Scrollable Form Content Area */}
        <div className="flex-1 overflow-y-auto pr-2 ar-scroll space-y-4 pb-4">
          {showSummary && errorList.length > 0 && (
            <div className="rounded-lg border border-[#db6c00]/30 bg-[#FFF1E0] px-3 py-2.5 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-[#b85a00] mt-0.5 shrink-0" />
              <div className="text-xs text-[#1A1410]">
                <div className="font-semibold text-[#b85a00] mb-0.5">
                  Please fix {errorList.length} issue{errorList.length === 1 ? '' : 's'} before continuing
                </div>
                <ul className="list-disc list-inside text-[#6B6258] space-y-0.5">
                  {errorList.slice(0, 4).map(([k, v]) => (
                    <li key={k}>{v}</li>
                  ))}
                </ul>
              </div>
            </div>
          )}

          <div className={`grid gap-6 ${isRider ? 'grid-cols-1 md:grid-cols-2' : 'grid-cols-1'}`}>
            {/* LEFT COLUMN: Main Account Details */}
            <div className="space-y-4">
              <div className="text-xs font-semibold text-[#b85a00] uppercase tracking-wider border-b border-[#EFEAE2] pb-1">
                Account Credentials
              </div>

              <Field label="Full Name" error={errors.name} innerRef={(el) => (fieldRefs.current.name = el)}>
                <input
                  value={form.name}
                  onChange={(e) => setField('name', e.target.value)}
                  placeholder="e.g. Juan dela Cruz"
                  className="ar-input"
                  disabled={submitting}
                />
              </Field>

              <Field label="Email Address" error={errors.email} innerRef={(el) => (fieldRefs.current.email = el)}>
                <input
                  value={form.email}
                  onChange={(e) => setField('email', e.target.value)}
                  placeholder="name@mkb.ph"
                  className="ar-input"
                  autoComplete="off"
                  disabled={submitting}
                />
              </Field>

              <div className="grid grid-cols-2 gap-3">
                <Field label="Contact Number" error={errors.contact} innerRef={(el) => (fieldRefs.current.contact = el)}>
                  <input
                    value={form.contact}
                    onChange={(e) => setField('contact', e.target.value.replace(/\D/g, '').slice(0, 11))}
                    placeholder="09XX XXX XXXX"
                    inputMode="numeric"
                    className="ar-input font-mono"
                    disabled={submitting}
                  />
                </Field>

                <Field label="Status">
                  <div className="flex gap-1">
                    {(['active', 'suspended'] as const).map((s) => (
                      <button
                        key={s}
                        type="button"
                        disabled={submitting}
                        onClick={() => setField('status', s)}
                        className={`flex-1 h-9 rounded-md border text-xs capitalize font-semibold transition ${
                          form.status === s
                            ? s === 'active'
                              ? 'bg-emerald-50 border-emerald-500/40 text-emerald-700 font-bold'
                              : 'bg-red-50 border-red-500/40 text-red-700 font-bold'
                            : 'bg-white border-[#EFEAE2] text-[#1A1410] hover:border-[#db6c00]/30 cursor-pointer'
                        }`}
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </Field>
              </div>

              <Field
                label={mode === 'edit' ? 'Reset Password (optional)' : 'Temporary Password'}
                error={errors.tempPassword}
                innerRef={(el) => (fieldRefs.current.tempPassword = el)}
                helper={mode === 'edit' ? 'Leave blank to keep current password.' : 'User will change this on first login.'}
              >
                <div className="flex items-center gap-1.5">
                  <div className="relative flex-1">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={form.tempPassword}
                      onChange={(e) => setField('tempPassword', e.target.value)}
                      placeholder="Min. 8 characters"
                      className="ar-input pr-9"
                      autoComplete="new-password"
                      disabled={submitting}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((s) => !s)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded text-[#6B6258] hover:text-[#1A1410] cursor-pointer"
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                  <button
                    type="button"
                    disabled={submitting}
                    onClick={() => {
                      const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*';
                      let pass = '';
                      for (let i = 0; i < 12; i++) {
                        pass += chars.charAt(Math.floor(Math.random() * chars.length));
                      }
                      setField('tempPassword', pass);
                      setShowPassword(true);
                    }}
                    className="inline-flex items-center gap-1.5 px-3 h-9 rounded-md bg-white border border-[#EFEAE2] text-xs text-[#1A1410] hover:border-[#db6c00]/30 hover:text-[#db6c00] transition shrink-0 cursor-pointer font-semibold"
                  >
                    <Sparkles className="w-3.5 h-3.5" /> Generate
                  </button>
                </div>
              </Field>

              {currentUserRole !== 'hr' && (
                <Field label="System Role" error={errors.role} innerRef={(el) => (fieldRefs.current.role = el)}>
                  <div className="grid grid-cols-4 gap-1.5">
                    {ROLES.map((r) => {
                      const active = form.role === r.value;
                      return (
                        <button
                          key={r.value}
                          type="button"
                          disabled={submitting}
                          onClick={() => setField('role', r.value)}
                          className={`h-9 rounded-md border text-[11px] font-semibold transition cursor-pointer ${
                            active
                              ? 'bg-[#FFF1E0] border-[#db6c00]/40 text-[#b85a00] ring-2 ring-[#db6c00]/15'
                              : 'bg-white border-[#EFEAE2] text-[#1A1410] hover:border-[#db6c00]/30'
                          }`}
                        >
                          {r.label}
                        </button>
                      );
                    })}
                  </div>
                </Field>
              )}
            </div>

            {/* RIGHT COLUMN: Face Registration & Rider specific details */}
            <div className="space-y-4">
              <div className="text-xs font-semibold text-[#b85a00] uppercase tracking-wider border-b border-[#EFEAE2] pb-1">
                Rider Details &amp; Registration
              </div>

              {/* Photo Section */}
              <div>
                <label className="block text-[11px] uppercase tracking-[0.14em] text-[#6B6258] mb-2 font-semibold">
                  Rider Face Photo
                </label>
                <div className="flex items-center gap-3">
                  <img
                    src={
                      form.faceImage ??
                      user?.avatar ??
                      `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(form.name || 'new')}&backgroundColor=fff1e0`
                    }
                    alt=""
                    className="w-14 h-14 rounded-full bg-[#FAFAF7] border border-[#EFEAE2] ring-2 ring-[#db6c00]/15 object-cover"
                  />
                  
                  <div className="flex flex-col gap-1">
                    <div className="flex items-center gap-2">
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
                            if (typeof result === 'string') {
                              setField('faceImage', result);
                              
                              // Extract descriptor
                              try {
                                const active = await ensureScriptsLoaded();
                                if (active) {
                                  await loadFaceModels();
                                  const img = new Image();
                                  img.onload = async () => {
                                    const desc = await getFaceDescriptor(img);
                                    if (desc) {
                                      console.log('[Admin UserModal] Face descriptor extracted from upload.');
                                      setField('faceDescriptor', Array.from(desc));
                                    } else {
                                      pushToast({
                                        title: 'Invalid Face Photo',
                                        description: 'No face detected. Please use a clear 2x2 photo.',
                                        tone: 'warning'
                                      });
                                    }
                                  };
                                  img.src = result;
                                }
                              } catch (err) {
                                console.error('[Admin UserModal] Extraction failed:', err);
                              }
                            }
                          };
                          reader.readAsDataURL(file);
                          e.target.value = '';
                        }}
                      />
                      <button
                        type="button"
                        disabled={submitting}
                        onClick={() => fileInputRef.current?.click()}
                        className="inline-flex items-center gap-1.5 px-2.5 h-8 rounded-md bg-white border border-[#EFEAE2] text-xs text-[#1A1410] hover:border-[#db6c00]/30 hover:text-[#db6c00] transition cursor-pointer font-semibold"
                      >
                        <Upload className="w-3 h-3" /> Upload
                      </button>
                      <button
                        type="button"
                        disabled={submitting}
                        onClick={() => setCameraOpen(true)}
                        className="inline-flex items-center gap-1.5 px-2.5 h-8 rounded-md bg-[#db6c00] text-white text-xs hover:bg-[#b85a00] transition cursor-pointer font-semibold"
                      >
                        <Camera className="w-3.5 h-3.5" /> Scan Face
                      </button>
                    </div>
                    {form.faceImage && (
                      <button
                        type="button"
                        disabled={submitting}
                        onClick={() => {
                          setField('faceImage', null);
                          setField('faceDescriptor', null);
                        }}
                        className="text-left inline-flex items-center gap-1 text-[10px] text-[#6B6258] hover:text-red-600 transition cursor-pointer font-medium w-fit"
                      >
                        <Trash2 className="w-3 h-3" /> Remove Photo
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {/* Rider operational params */}
              {isRider && (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="MKB Rider ID" error={errors.mkbRiderId} innerRef={(el) => (fieldRefs.current.mkbRiderId = el)}>
                      <div className="flex items-center gap-1.5">
                        <input
                          value={form.mkbRiderId}
                          onChange={(e) => setField('mkbRiderId', e.target.value.toUpperCase())}
                          placeholder="MKB-0000"
                          className="ar-input font-mono flex-1"
                          disabled={submitting}
                        />
                        <button
                          type="button"
                          disabled={submitting}
                          onClick={() => setField('mkbRiderId', generateMkbId())}
                          className="inline-flex items-center gap-1 px-2 h-9 rounded-md bg-white border border-[#EFEAE2] text-[10px] text-[#1A1410] hover:border-[#db6c00]/30 hover:text-[#db6c00] transition shrink-0 cursor-pointer font-semibold"
                        >
                          <Sparkles className="w-3 h-3" /> Generate
                        </button>
                      </div>
                    </Field>

                    <Field label="Assigned Zone" error={errors.zoneId} innerRef={(el) => (fieldRefs.current.zoneId = el)}>
                      <select
                        value={form.zoneId}
                        onChange={(e) => setField('zoneId', e.target.value)}
                        className="ar-input"
                        disabled={submitting}
                      >
                        <option value="">Unassigned</option>
                        {zones
                          .filter((z) => z.status === 'active' || z.id === form.zoneId)
                          .map((z) => (
                            <option key={z.id} value={z.id}>
                              {z.name}
                            </option>
                          ))}
                      </select>
                    </Field>
                  </div>

                  <Field label="Shift Schedule" error={errors.shift} innerRef={(el) => (fieldRefs.current.shift = el)}>
                    <div className="grid grid-cols-3 gap-1.5">
                      {SHIFTS.map((s) => {
                        const active = form.shift === s.value;
                        return (
                          <button
                            key={s.value}
                            type="button"
                            disabled={submitting}
                            onClick={() => setField('shift', s.value)}
                            className={`flex flex-col items-center justify-center h-12 rounded-md border text-[11px] font-semibold transition cursor-pointer ${
                              active
                                ? 'bg-[#FFF1E0] border-[#db6c00]/40 text-[#b85a00] font-bold'
                                : 'bg-white border-[#EFEAE2] text-[#1A1410] hover:border-[#db6c00]/30'
                            }`}
                          >
                            <span>{s.label}</span>
                            <span className={`text-[10px] font-mono ${active ? 'text-[#b85a00]/80' : 'text-[#6B6258]'}`}>
                              {s.range}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </Field>

                  {/* Country-State-City Cascading Fields */}
                  <div className="border-t border-[#EFEAE2] pt-3 mt-3">
                    <div className="text-[10px] uppercase tracking-wider text-[#b85a00] font-bold mb-3">
                      Home Address details (locked to Philippines)
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <Field label="Province" error={errors.province} innerRef={(el) => (fieldRefs.current.province = el)}>
                        <select
                          value={form.province}
                          onChange={(e) => setField('province', e.target.value)}
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

                      <Field label="City / Municipality" error={errors.city} innerRef={(el) => (fieldRefs.current.city = el)}>
                        <select
                          value={form.city}
                          onChange={(e) => setField('city', e.target.value)}
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

                    <div className="grid grid-cols-3 gap-3 mt-3">
                      <div className="col-span-2">
                        <Field label="Barangay" error={errors.barangay} innerRef={(el) => (fieldRefs.current.barangay = el)}>
                          <input
                            value={form.barangay}
                            onChange={(e) => setField('barangay', e.target.value)}
                            placeholder="e.g. Santa Maria"
                            className="ar-input"
                            disabled={submitting}
                          />
                        </Field>
                      </div>

                      <div>
                        <Field label="Zip Code" error={errors.zipCode} innerRef={(el) => (fieldRefs.current.zipCode = el)}>
                          <input
                            value={form.zipCode}
                            onChange={(e) => setField('zipCode', e.target.value.replace(/\D/g, '').slice(0, 4))}
                            placeholder="e.g. 7000"
                            inputMode="numeric"
                            className="ar-input font-mono"
                            disabled={submitting}
                          />
                        </Field>
                      </div>
                    </div>

                    <div className="mt-3">
                      <Field label="Street Address" error={errors.streetAddress} innerRef={(el) => (fieldRefs.current.streetAddress = el)}>
                        <input
                          value={form.streetAddress}
                          onChange={(e) => setField('streetAddress', e.target.value)}
                          placeholder="House no., Block/Lot, Street name, subdivision..."
                          className="ar-input"
                          disabled={submitting}
                        />
                      </Field>
                    </div>
                  </div>

                  {/* Face Registration Status Indicator */}
                  <div ref={(el) => (fieldRefs.current.faceImage = el)} className="mt-3 pt-3 border-t border-[#EFEAE2]">
                    <div
                      className={`rounded-lg border-2 border-dashed px-3 py-2 flex items-center justify-between transition ${
                        errors.faceImage ? 'border-red-300 bg-red-50/40' : form.faceImage ? 'border-emerald-300 bg-emerald-50/40' : 'border-[#EFEAE2] bg-[#FAFAF7]'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        {form.faceImage ? (
                          <>
                            <img
                              src={form.faceImage}
                              alt="Registered face"
                              className="w-8 h-8 rounded-full object-cover border border-emerald-400 shrink-0"
                            />
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 text-[10px] font-bold">
                              <CheckCircle2 className="w-3 h-3" /> Face Registered
                            </span>
                          </>
                        ) : (
                          <div className="text-[10px] text-[#6B6258] flex items-center gap-1">
                            <AlertTriangle className="w-3.5 h-3.5 text-[#db6c00]" />
                            <span>No face scan. Click "Scan Face" above to enroll.</span>
                          </div>
                        )}
                      </div>
                    </div>
                    {errors.faceImage && <div className="mt-1 text-[10px] text-red-600 font-medium">{errors.faceImage}</div>}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Pinned Modal Actions Footer - Outside Scroll Container */}
        <div className="pt-4 border-t border-[#EFEAE2] flex items-center justify-end gap-2 bg-[#FAFAF7] -mx-5 -mb-5 p-4 mt-2 shrink-0">
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
            {submitting ? (mode === 'edit' ? 'Saving…' : 'Creating…') : mode === 'edit' ? 'Save Changes' : 'Create User'}
          </button>
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
        .ar-scroll::-webkit-scrollbar { width: 6px; height: 6px; }
        .ar-scroll::-webkit-scrollbar-track { background: #FAFAF7; }
        .ar-scroll::-webkit-scrollbar-thumb { background: #EFEAE2; border-radius: 3px; }
        .ar-scroll::-webkit-scrollbar-thumb:hover { background: #db6c00/30; }
      `}</style>

      {cameraOpen && (
        <FaceCaptureModal
          riderName={form.name || 'New rider'}
          seedAvatar={
            form.faceImage ??
            `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(form.name || 'capture')}&backgroundColor=fff1e0`
          }
          onCancel={() => setCameraOpen(false)}
          onCapture={(dataUrl, descriptor) => {
            setField('faceImage', dataUrl);
            setField('faceDescriptor', descriptor);
            setCameraOpen(false);
          }}
        />
      )}
    </Modal>
  );
}

function Field({
  label,
  children,
  error,
  helper,
  innerRef
}: {
  label: string;
  children: React.ReactNode;
  error?: string;
  helper?: string;
  innerRef?: (el: HTMLDivElement | null) => void;
}) {
  return (
    <div ref={innerRef} className="space-y-1">
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

function FaceCaptureModal({
  riderName,
  seedAvatar,
  onCapture,
  onCancel
}: {
  riderName: string;
  seedAvatar: string;
  onCapture: (dataUrl: string, descriptor: number[]) => void;
  onCancel: () => void;
}) {
  const { phase, progress, result, start, videoRef, canvasRef, debugInfo } = useFaceRecognition({
    durationMs: 2500
  });

  useEffect(() => {
    if (phase === 'matched') {
      const targetPhoto = result?.snapshotUrl || seedAvatar;
      const descriptor = result?.descriptor || [];
      const t = setTimeout(() => onCapture(targetPhoto, descriptor), 800);
      return () => clearTimeout(t);
    }
  }, [phase, result, seedAvatar, onCapture]);

  return (
    <div className="fixed inset-0 z-[1300] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-[#1A1410]/60 backdrop-blur-sm" onClick={onCancel} />
      
      <div className="relative bg-white rounded-2xl border border-[#EFEAE2] shadow-2xl w-full max-w-sm p-5 z-[1310]">
        <div className="flex items-center justify-between mb-4">
          <div>
            <div className="text-sm font-semibold text-[#1A1410]">Face Enrollment</div>
            <div className="text-[11px] text-[#6B6258]">Capture a clear photo of the rider's face</div>
          </div>
          <button
            onClick={onCancel}
            className="p-1.5 rounded-md text-[#6B6258] hover:text-[#1A1410] hover:bg-[#FAFAF7]"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <FaceScanner
          phase={phase}
          progress={progress}
          riderName={riderName}
          riderAvatar={seedAvatar}
          videoRef={videoRef}
          canvasRef={canvasRef}
          debugInfo={debugInfo}
        />

        <div className="mt-4 flex items-center gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 h-9 rounded-md bg-white border border-[#EFEAE2] text-sm text-[#1A1410] hover:border-[#db6c00]/30 transition cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={start}
            disabled={phase === 'scanning' || phase === 'initializing'}
            className="flex-1 px-4 h-9 rounded-md bg-[#db6c00] hover:bg-[#b85a00] text-white text-sm font-semibold disabled:opacity-70 inline-flex items-center justify-center gap-2 cursor-pointer"
          >
            {phase === 'matched' ? (
              <>
                <CheckCircle2 className="w-4 h-4" /> Captured
              </>
            ) : phase === 'scanning' || phase === 'initializing' ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" /> Capturing…
              </>
            ) : (
              <>
                <Camera className="w-4 h-4" /> Capture
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
