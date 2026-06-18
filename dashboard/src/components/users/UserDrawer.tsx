import { useEffect, useMemo, useState, useRef } from 'react';
import {
  X,
  Upload,
  Eye,
  EyeOff,
  Sparkles,
  Camera,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  Trash2 } from
'lucide-react';
import type { AppUser, UserRole, Zone } from '../../services/types';
import { FaceScanner } from '../attendance/FaceScanner';
import { useFaceRecognition } from '../../hooks/useFaceRecognition';
import { pushToast } from '../../hooks/useToast';
import { useAuth } from '../../hooks/useAuth';
import {
  ensureScriptsLoaded,
  loadFaceModels,
  getFaceDescriptor,
  getDescriptorFromUrl
} from '../../lib/faceAi';
type EditableRole = 'admin' | 'hr' | 'rider' | 'payroll';
type Shift = 'morning' | 'afternoon' | 'evening' | '';
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
  faceDescriptor: number[] | null; // Added
}
type FormErrors = Partial<Record<keyof FormState, string>>;
interface UserDrawerProps {
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
    faceDescriptor?: number[] | null; // Added
    tempPassword?: string;
  },
  mode: 'create' | 'edit')
  => void;
}
const ROLES: {
  value: EditableRole;
  label: string;
}[] = [
{
  value: 'admin',
  label: 'Admin'
},
{
  value: 'hr',
  label: 'HR'
},
{
  value: 'rider',
  label: 'Rider'
},
{
  value: 'payroll',
  label: 'Payroll'
}];

const SHIFTS: {
  value: Exclude<Shift, ''>;
  label: string;
  range: string;
}[] = [
{
  value: 'morning',
  label: 'Morning',
  range: '6AM–2PM'
},
{
  value: 'afternoon',
  label: 'Afternoon',
  range: '2PM–10PM'
},
{
  value: 'evening',
  label: 'Evening',
  range: '10PM–6AM'
}];

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
  faceDescriptor: null
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
    if (!form.zoneId) errors.zoneId = 'Assigned zone is required for riders.';
    if (!form.shift) errors.shift = 'Shift is required.';
    if (!form.faceImage) errors.faceImage = 'Face registration is required.';
  }
  return errors;
}
export function UserDrawer({
  open,
  user,
  zones,
  onClose,
  onSaved
}: UserDrawerProps) {
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
  const fieldRefs = useRef<
    Partial<Record<keyof FormState, HTMLElement | null>>>(
    {});
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
      
      const faceImg = (user as AppUser & { faceImage?: string }).faceImage ?? user.avatar ?? null;
      const faceDesc = (user as any).faceDescriptor ?? null;

      setForm({
        name: user.name,
        email: user.email,
        contact: (user as AppUser & { contact?: string }).contact ?? '',
        tempPassword: '',
        role: safeRole,
        status: user.status,
        mkbRiderId: (user as AppUser & { mkbRiderId?: string }).mkbRiderId ?? '',
        zoneId: user.zoneId ?? '',
        shift: (user as AppUser & { shift?: Shift }).shift ?? '',
        faceImage: faceImg,
        faceDescriptor: faceDesc
      });

      // Auto-compile descriptor in background if missing for a rider
      if (safeRole === 'rider' && faceImg && !faceDesc && !faceImg.includes('dicebear') && !faceImg.endsWith('.svg')) {
        console.log('[Admin UserDrawer] Auto-compiling missing descriptor for user:', user.name);
        (async () => {
          try {
            const active = await ensureScriptsLoaded();
            if (active) {
              await loadFaceModels();
              const desc = await getDescriptorFromUrl(faceImg);
              if (desc) {
                console.log('[Admin UserDrawer] Auto-compiled descriptor successfully in background.');
                setForm(f => ({ ...f, faceDescriptor: Array.from(desc) }));
              } else {
                console.warn('[Admin UserDrawer] Background descriptor compilation returned null.');
              }
            }
          } catch (err) {
            console.warn('[Admin UserDrawer] Background descriptor compilation failed:', err);
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
  }, [user, open]);
  const isRider = form.role === 'rider';
  const setField = <K extends keyof FormState,>(key: K, value: FormState[K]) => {
    setForm((f) => ({
      ...f,
      [key]: value
    }));
    if (errors[key])
    setErrors((e) => ({
      ...e,
      [key]: undefined
    }));
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
      const saved: AppUser & {
        contact?: string;
        mkbRiderId?: string;
        shift?: Shift;
        faceImage?: string | null;
        faceDescriptor?: number[] | null;
        tempPassword?: string;
      } = {
        id: user?.id ?? `u-${Date.now()}`,
        name: form.name.trim(),
        email: form.email.trim(),
        avatar:
        form.faceImage ??
        user?.avatar ??
        `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(form.name || 'new')}&backgroundColor=fff1e0`,
        role: form.role as UserRole,
        zoneId:
        form.role === 'rider' ? form.zoneId || null : form.zoneId || null,
        status: form.status,
        lastLogin: user?.lastLogin ?? 0,
        contact: form.contact,
        mkbRiderId: form.mkbRiderId,
        shift: form.shift,
        faceImage: form.faceImage,
        faceDescriptor: form.faceDescriptor,
        tempPassword: form.tempPassword
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
    } catch (err: any) {
      console.error(err);
      pushToast({
        title:
        mode === 'create' ? 'Failed to create user' : 'Failed to update user',
        description: err?.message || 'Try again.',
        tone: 'error'
      });
    } finally {
      setSubmitting(false);
    }
  };
  const errorList = useMemo(
    () =>
    Object.entries(errors).filter(([, v]) => !!v) as [
      keyof FormState,
      string][],

    [errors]
  );
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[1050]">
      <div
        className="absolute inset-0 bg-[#1A1410]/40 backdrop-blur-sm"
        onClick={() => !submitting && onClose()} />
      
      <aside className="absolute right-0 top-0 h-full w-full max-w-md bg-white border-l border-[#EFEAE2] shadow-2xl flex flex-col">
        <div className="flex items-center justify-between p-5 border-b border-[#EFEAE2]">
          <div>
            <div className="text-base font-semibold text-[#1A1410]">
              {mode === 'edit' ? 'Edit User' : 'Add User'}
            </div>
            <div className="text-xs text-[#6B6258]">
              Manage user account &amp; permissions
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={submitting}
            className="p-1.5 rounded-md text-[#6B6258] hover:text-[#1A1410] hover:bg-[#FAFAF7] disabled:opacity-50"
            aria-label="Close">
            
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto ar-scroll p-5 space-y-5">
          {showSummary && errorList.length > 0 &&
          <div className="rounded-lg border border-[#db6c00]/30 bg-[#FFF1E0] px-3 py-2.5 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-[#b85a00] mt-0.5 shrink-0" />
              <div className="text-xs text-[#1A1410]">
                <div className="font-semibold text-[#b85a00] mb-0.5">
                  Please fix {errorList.length} issue
                  {errorList.length === 1 ? '' : 's'} before continuing
                </div>
                <ul className="list-disc list-inside text-[#6B6258] space-y-0.5">
                  {errorList.slice(0, 4).map(([k, v]) =>
                <li key={k}>{v}</li>
                )}
                </ul>
              </div>
            </div>
          }

          {/* Avatar */}
          <div>
            <label className="block text-[11px] uppercase tracking-[0.14em] text-[#6B6258] mb-2 font-semibold">
              Avatar / Face Photo
            </label>
            <div className="flex items-center gap-3">
              <img
                src={
                  form.faceImage ??
                  user?.avatar ??
                  `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(form.name || 'new')}&backgroundColor=fff1e0`
                }
                alt=""
                className="w-16 h-16 rounded-full bg-[#FAFAF7] border border-[#EFEAE2] ring-2 ring-[#db6c00]/15 object-cover"
              />
              
              <div className="flex flex-col gap-1.5">
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
                          
                          // Compile face descriptor on the fly
                          try {
                            const active = await ensureScriptsLoaded();
                            if (active) {
                              await loadFaceModels();
                              const img = new Image();
                              img.onload = async () => {
                                const desc = await getFaceDescriptor(img);
                                if (desc) {
                                  console.log('[Admin UserDrawer] Face descriptor extracted from uploaded image successfully.');
                                  setField('faceDescriptor', Array.from(desc));
                                } else {
                                  console.warn('[Admin UserDrawer] No face detected in the uploaded image.');
                                  pushToast({
                                    title: 'Invalid Face Photo',
                                    description: 'No face detected in the uploaded image. Please use a clear 2x2 photo.',
                                    tone: 'warning'
                                  });
                                }
                              };
                              img.src = result;
                            }
                          } catch (err) {
                            console.error('[Admin UserDrawer] Failed to extract face descriptor from file:', err);
                          }
                        }
                      };
                      reader.readAsDataURL(file);
                      e.target.value = '';
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="inline-flex items-center gap-2 px-3 h-9 rounded-md bg-white border border-[#EFEAE2] text-xs text-[#1A1410] hover:border-[#db6c00]/30 hover:text-[#db6c00] transition font-semibold"
                  >
                    <Upload className="w-3.5 h-3.5" /> Upload photo
                  </button>
                  <button
                    type="button"
                    onClick={() => setCameraOpen(true)}
                    className="inline-flex items-center gap-2 px-3 h-9 rounded-md bg-[#db6c00] text-white text-xs hover:bg-[#b85a00] transition font-semibold"
                  >
                    <Camera className="w-3.5 h-3.5" /> Open Camera
                  </button>
                </div>
                {form.faceImage && (
                  <button
                    type="button"
                    onClick={() => setField('faceImage', null)}
                    className="text-left inline-flex items-center gap-1 text-[11px] text-[#6B6258] hover:text-red-600 transition font-medium w-fit"
                  >
                    <Trash2 className="w-3 h-3" /> Remove photo
                  </button>
                )}
              </div>
            </div>
          </div>

          <Field
            label="Full Name"
            error={errors.name}
            innerRef={(el) => fieldRefs.current.name = el}>
            
            <input
              value={form.name}
              onChange={(e) => setField('name', e.target.value)}
              placeholder="e.g. Juan dela Cruz"
              className="ar-input" />
            
          </Field>

          <Field
            label="Email"
            error={errors.email}
            innerRef={(el) => fieldRefs.current.email = el}>
            
            <input
              value={form.email}
              onChange={(e) => setField('email', e.target.value)}
              placeholder="name@mkb.ph"
              className="ar-input"
              autoComplete="off" />
            
          </Field>

          <Field
            label="Contact Number"
            error={errors.contact}
            innerRef={(el) => fieldRefs.current.contact = el}>
            
            <input
              value={form.contact}
              onChange={(e) =>
              setField(
                'contact',
                e.target.value.replace(/\D/g, '').slice(0, 11)
              )
              }
              placeholder="09XX XXX XXXX"
              inputMode="numeric"
              className="ar-input font-mono" />
            
          </Field>

          <Field
            label={
            mode === 'edit' ?
            'Reset Password (optional)' :
            'Temporary Password'
            }
            error={errors.tempPassword}
            innerRef={(el) => fieldRefs.current.tempPassword = el}
            helper={
            mode === 'edit' ?
            'Leave blank to keep current password.' :
            'User will be prompted to change this on first login.'
            }>
            
            <div className="flex items-center gap-1.5">
              <div className="relative flex-1">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={form.tempPassword}
                  onChange={(e) => setField('tempPassword', e.target.value)}
                  placeholder="Min. 8 characters"
                  className="ar-input pr-9"
                  autoComplete="new-password" />
                
                <button
                  type="button"
                  onClick={() => setShowPassword((s) => !s)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded text-[#6B6258] hover:text-[#1A1410]"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}>
                  
                  {showPassword ?
                  <EyeOff className="w-4 h-4" /> :

                  <Eye className="w-4 h-4" />
                  }
                </button>
              </div>
              <button
                type="button"
                onClick={() => {
                  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*';
                  let pass = '';
                  for (let i = 0; i < 12; i++) {
                    pass += chars.charAt(Math.floor(Math.random() * chars.length));
                  }
                  setField('tempPassword', pass);
                  setShowPassword(true);
                }}
                className="inline-flex items-center gap-1.5 px-3 h-9 rounded-md bg-white border border-[#EFEAE2] text-xs text-[#1A1410] hover:border-[#db6c00]/30 hover:text-[#db6c00] transition shrink-0">
                <Sparkles className="w-3.5 h-3.5" /> Generate
              </button>
            </div>
          </Field>

          {currentUserRole !== 'hr' && (
            <Field
              label="Role"
              error={errors.role}
              innerRef={(el) => fieldRefs.current.role = el}>
              
              <div className="grid grid-cols-2 gap-1.5">
                {ROLES.map((r) => {
                  const active = form.role === r.value;
                  return (
                    <button
                      key={r.value}
                      type="button"
                      onClick={() => setField('role', r.value)}
                      className={`px-3 h-9 rounded-md border text-xs font-semibold transition ${active ? 'bg-[#FFF1E0] border-[#db6c00]/40 text-[#b85a00] ring-2 ring-[#db6c00]/15' : 'bg-white border-[#EFEAE2] text-[#1A1410] hover:border-[#db6c00]/30'}`}>
                      
                      {r.label}
                    </button>);
                })}
              </div>
            </Field>
          )}

          {/* Rider Details (with smooth height transition) */}
          <div className={`transition-all duration-300 ease-in-out overflow-hidden ${isRider ? 'max-h-[1000px] opacity-100 mt-5' : 'max-h-0 opacity-0 pointer-events-none'}`}>
            <div className="border-l-2 border-[#db6c00]/30 pl-4 space-y-5">
              <div className="text-[10px] uppercase tracking-[0.16em] font-semibold text-[#b85a00]">
                Rider Details
              </div>

              <Field
              label="MKB Rider ID"
              error={errors.mkbRiderId}
              innerRef={(el) => fieldRefs.current.mkbRiderId = el}>
              
                <div className="flex items-center gap-1.5">
                  <input
                  value={form.mkbRiderId}
                  onChange={(e) =>
                  setField('mkbRiderId', e.target.value.toUpperCase())
                  }
                  placeholder="MKB-0000"
                  className="ar-input font-mono flex-1" />
                
                  <button
                  type="button"
                  onClick={() => setField('mkbRiderId', generateMkbId())}
                  className="inline-flex items-center gap-1.5 px-3 h-9 rounded-md bg-white border border-[#EFEAE2] text-xs text-[#1A1410] hover:border-[#db6c00]/30 hover:text-[#db6c00] transition shrink-0">
                  
                    <Sparkles className="w-3.5 h-3.5" /> Auto-generate
                  </button>
                </div>
              </Field>

              <Field
              label="Assigned Zone"
              error={errors.zoneId}
              innerRef={(el) => fieldRefs.current.zoneId = el}>
              
                <select
                value={form.zoneId}
                onChange={(e) => setField('zoneId', e.target.value)}
                className="ar-input">
                
                  <option value="">Unassigned</option>
                  {zones.filter((z) => z.status === 'active' || z.id === form.zoneId).map((z) =>
                <option key={z.id} value={z.id}>
                      {z.name}
                    </option>
                )}
                </select>
              </Field>

              <Field
              label="Shift Schedule"
              error={errors.shift}
              innerRef={(el) => fieldRefs.current.shift = el}>
              
                <div className="grid grid-cols-3 gap-1.5">
                  {SHIFTS.map((s) => {
                  const active = form.shift === s.value;
                  return (
                    <button
                      key={s.value}
                      type="button"
                      onClick={() => setField('shift', s.value)}
                      className={`flex flex-col items-center justify-center px-2 h-12 rounded-md border text-[11px] font-semibold transition ${active ? 'bg-[#FFF1E0] border-[#db6c00]/40 text-[#b85a00]' : 'bg-white border-[#EFEAE2] text-[#1A1410] hover:border-[#db6c00]/30'}`}>
                      
                        <span>{s.label}</span>
                        <span
                        className={`text-[10px] font-mono ${active ? 'text-[#b85a00]/80' : 'text-[#6B6258]'}`}>
                        
                          {s.range}
                        </span>
                      </button>);
 
                })}
                </div>
              </Field>

              {/* Face Registration Status */}
              <div ref={(el) => fieldRefs.current.faceImage = el}>
                <label className="block text-[11px] uppercase tracking-[0.14em] text-[#6B6258] mb-1.5 font-semibold">
                  Face Registration Status
                </label>
                <div
                  className={`rounded-lg border-2 border-dashed px-4 py-3 transition ${
                    errors.faceImage ? 'border-red-300 bg-red-50/40' : form.faceImage ? 'border-emerald-300 bg-emerald-50/40' : 'border-[#EFEAE2] bg-[#FAFAF7]'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    {form.faceImage ? (
                      <>
                        <img
                          src={form.faceImage}
                          alt="Registered face"
                          className="w-10 h-10 rounded-full object-cover border-2 border-emerald-400 shrink-0"
                        />
                        <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-full bg-emerald-100 text-emerald-700 text-[11px] font-semibold">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          Face registered
                        </span>
                      </>
                    ) : (
                      <div className="text-[11px] text-[#6B6258] flex items-center gap-1.5 py-1">
                        <AlertTriangle className="w-4 h-4 text-[#db6c00]" />
                        <span>No face photo registered. Use the Avatar controls above to upload or scan.</span>
                      </div>
                    )}
                  </div>
                </div>

                {errors.faceImage && (
                  <div className="mt-1.5 text-[11px] text-red-600">
                    {errors.faceImage}
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="border-t border-[#EFEAE2]" />

          <Field label="Status">
            <div className="flex gap-1.5">
              {(['active', 'suspended'] as const).map((s) =>
              <button
                key={s}
                type="button"
                onClick={() => setField('status', s)}
                className={`flex-1 px-3 h-9 rounded-md border text-xs capitalize font-semibold transition ${form.status === s ? s === 'active' ? 'bg-emerald-50 border-emerald-500/40 text-emerald-700' : 'bg-red-50 border-red-500/40 text-red-700' : 'bg-white border-[#EFEAE2] text-[#1A1410] hover:border-[#db6c00]/30'}`}>
                
                  {s}
                </button>
              )}
            </div>
          </Field>
        </div>

        <div className="p-5 border-t border-[#EFEAE2] flex items-center gap-2 bg-[#FAFAF7]">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="px-4 h-9 rounded-md bg-white border border-[#EFEAE2] text-sm text-[#1A1410] hover:border-[#db6c00]/30 transition disabled:opacity-50">
            
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={submitting}
            className="flex-1 px-4 h-9 rounded-md bg-[#db6c00] hover:bg-[#b85a00] active:bg-[#a04e00] text-white text-sm font-semibold focus:ring-2 focus:ring-[#db6c00]/25 transition disabled:opacity-70 inline-flex items-center justify-center gap-2">
            
            {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
            {submitting ?
            mode === 'edit' ?
            'Saving…' :
            'Creating…' :
            mode === 'edit' ?
            'Save changes' :
            'Create user'}
          </button>
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
          select.ar-input {
            appearance: none;
            background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%236B6258' stroke-width='2'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E");
            background-repeat: no-repeat;
            background-position: right 12px center;
            padding-right: 32px;
          }
        `}</style>
      </aside>

      {cameraOpen &&
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
        }} />

      }
    </div>);

}
function Field({
  label,
  children,
  error,
  helper,
  innerRef






}: {label: string;children: React.ReactNode;error?: string;helper?: string;innerRef?: (el: HTMLDivElement | null) => void;}) {
  return (
    <div ref={innerRef}>
      <label className="block text-[11px] uppercase tracking-[0.14em] text-[#6B6258] mb-1.5 font-semibold">
        {label}
      </label>
      {children}
      {error ?
      <div className="mt-1 text-[11px] text-red-600">{error}</div> :
      helper ?
      <div className="mt-1 text-[11px] text-[#6B6258]">{helper}</div> :
      null}
    </div>);

}
/**
 * Lightweight face capture overlay that wraps the existing FaceScanner viewfinder.
 * Drives a real face detection scan and captures a gray-scaled snapshot on match success.
 */
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

  // Automatically pass grayscaled snapshot or seed avatar on successful face-match detection
  useEffect(() => {
    if (phase === 'matched') {
      const targetPhoto = result?.snapshotUrl || seedAvatar;
      const descriptor = result?.descriptor || [];
      const t = setTimeout(() => onCapture(targetPhoto, descriptor), 800);
      return () => clearTimeout(t);
    }
  }, [phase, result, seedAvatar, onCapture]);

  return (
    <div className="fixed inset-0 z-[1200] flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-[#1A1410]/60 backdrop-blur-sm"
        onClick={onCancel} />
      
      <div className="relative bg-white rounded-2xl border border-[#EFEAE2] shadow-2xl w-full max-w-sm p-5">
        <div className="flex items-center justify-between mb-4">
          <div>
            <div className="text-sm font-semibold text-[#1A1410]">
              Face Enrollment
            </div>
            <div className="text-[11px] text-[#6B6258]">
              Capture a clear photo of the rider's face
            </div>
          </div>
          <button
            onClick={onCancel}
            className="p-1.5 rounded-md text-[#6B6258] hover:text-[#1A1410] hover:bg-[#FAFAF7]"
            aria-label="Close">
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
          debugInfo={debugInfo} />
        

        <div className="mt-4 flex items-center gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 h-9 rounded-md bg-white border border-[#EFEAE2] text-sm text-[#1A1410] hover:border-[#db6c00]/30 transition">
            Cancel
          </button>
          <button
            type="button"
            onClick={start}
            disabled={phase === 'scanning' || phase === 'initializing'}
            className="flex-1 px-4 h-9 rounded-md bg-[#db6c00] hover:bg-[#b85a00] text-white text-sm font-semibold disabled:opacity-70 inline-flex items-center justify-center gap-2">
            
            {phase === 'matched' ?
              <>
                <CheckCircle2 className="w-4 h-4" /> Captured
              </> :
            phase === 'scanning' || phase === 'initializing' ?
              <>
                <Loader2 className="w-4 h-4 animate-spin" /> Capturing…
              </> :
              <>
                <Camera className="w-4 h-4" /> Capture
              </>
            }
          </button>
        </div>
      </div>
    </div>
  );
}

