import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../hooks/useAuth';
import { Modal } from './Modal';
import { pushToast } from '../../hooks/useToast';
import { Loader2, Eye, EyeOff } from 'lucide-react';

interface ProfileSettingsModalProps {
  open: boolean;
  onClose: () => void;
}

export function ProfileSettingsModal({ open, onClose }: ProfileSettingsModalProps) {
  const { session, user } = useAuth();
  
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (open && user) {
      setName(user.name || '');
      setEmail(user.email || '');
      setPassword('');
      setConfirmPassword('');
      setErrors({});
    }
  }, [open, user]);

  const validate = () => {
    const errs: Record<string, string> = {};
    if (!name.trim()) errs.name = 'Full name is required';
    if (!email.trim()) {
      errs.email = 'Email is required';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      errs.email = 'Invalid email format';
    }
    if (password) {
      if (password.length < 8) {
        errs.password = 'Password must be at least 8 characters';
      }
      if (password !== confirmPassword) {
        errs.confirmPassword = 'Passwords do not match';
      }
    }
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate() || !session?.id) return;

    setSubmitting(true);
    try {
      // 1. Update Supabase Auth profile
      const authUpdates: any = {
        email: email !== user?.email ? email.trim() : undefined,
        data: { full_name: name.trim() }
      };
      
      if (password) {
        authUpdates.password = password;
      }

      const { error: authErr } = await supabase.auth.updateUser(authUpdates);
      if (authErr) throw authErr;

      // 2. Synchronize with public.users table
      const { error: dbErr } = await supabase
        .from('users')
        .update({
          full_name: name.trim(),
          email: email.trim()
        })
        .eq('id', session.id);

      if (dbErr) throw dbErr;

      pushToast({
        title: 'Account updated successfully',
        description: 'Your profile changes have been saved.',
        tone: 'success'
      });
      onClose();
    } catch (err: any) {
      console.error('Failed to update credentials:', err);
      pushToast({
        title: 'Update failed',
        description: err?.message || 'Please try again.',
        tone: 'error'
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Account Settings"
      subtitle="Update your profile information and credentials"
      size="md"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Full Name */}
        <div>
          <label className="block text-[11px] uppercase tracking-[0.14em] text-[#6B6258] mb-1.5 font-semibold">
            Full Name
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. John Doe"
            className="prof-input"
          />
          {errors.name && <p className="text-xs text-red-600 mt-1">{errors.name}</p>}
        </div>

        {/* Email Address */}
        <div>
          <label className="block text-[11px] uppercase tracking-[0.14em] text-[#6B6258] mb-1.5 font-semibold">
            Email Address
          </label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="name@company.com"
            className="prof-input"
          />
          {errors.email && <p className="text-xs text-red-600 mt-1">{errors.email}</p>}
        </div>

        <div className="border-t border-[#EFEAE2] my-4 pt-3" />
        <p className="text-[11px] text-[#6B6258] italic mb-2">Leave password fields blank if you do not want to change your password.</p>

        {/* Password */}
        <div>
          <label className="block text-[11px] uppercase tracking-[0.14em] text-[#6B6258] mb-1.5 font-semibold">
            New Password
          </label>
          <div className="relative">
            <input
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Min. 8 characters"
              className="prof-input pr-9"
              autoComplete="new-password"
            />
            <button
              type="button"
              onClick={() => setShowPassword((s) => !s)}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-[#6B6258] hover:text-[#1A1410] rounded"
            >
              {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
          {errors.password && <p className="text-xs text-red-600 mt-1">{errors.password}</p>}
        </div>

        {/* Confirm Password */}
        <div>
          <label className="block text-[11px] uppercase tracking-[0.14em] text-[#6B6258] mb-1.5 font-semibold">
            Confirm Password
          </label>
          <input
            type={showPassword ? 'text' : 'password'}
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            placeholder="Repeat new password"
            className="prof-input"
          />
          {errors.confirmPassword && <p className="text-xs text-red-600 mt-1">{errors.confirmPassword}</p>}
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-3 pt-4 border-t border-[#EFEAE2] mt-5">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="px-4 py-2 text-sm font-semibold text-[#6B6258] hover:text-[#1A1410] hover:bg-[#F5F0E8] rounded-lg transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="px-4 py-2 text-sm font-semibold text-white bg-[#db6c00] hover:bg-[#c45f00] rounded-lg shadow-sm transition-colors disabled:opacity-75 flex items-center gap-1.5"
          >
            {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
            {submitting ? 'Saving...' : 'Save Settings'}
          </button>
        </div>
      </form>

      <style>{`
        .prof-input {
          width: 100%;
          height: 38px;
          padding: 0 12px;
          background: #FAFAF7;
          border: 1px solid #EFEAE2;
          border-radius: 8px;
          color: #1A1410;
          font-size: 13px;
          outline: none;
          transition: border-color 150ms ease, box-shadow 150ms ease;
        }
        .prof-input:focus {
          border-color: #db6c00;
          box-shadow: 0 0 0 3px rgba(219, 108, 0, 0.12);
        }
      `}</style>
    </Modal>
  );
}
