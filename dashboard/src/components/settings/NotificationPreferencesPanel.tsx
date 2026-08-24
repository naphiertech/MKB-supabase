import { AlertTriangle, Loader2 } from 'lucide-react';
import {
  getConfigurablePreferenceKeys,
  type ConfigurableNotificationPreference,
} from '../../lib/notificationPresentation';
import type { NotificationPreferences } from '../../services/notifications/notificationPreferenceService';
import type { UserRole } from '../../services/notifications/notificationService';

interface NotificationPreferencesPanelProps {
  role: UserRole;
  value: NotificationPreferences;
  loading: boolean;
  error: string | null;
  onChange: (value: NotificationPreferences) => void;
}

const CATEGORY_COPY: Record<ConfigurableNotificationPreference, { label: string; description: string }> = {
  violation_alerts: {
    label: 'Violation Alerts',
    description: 'Show live geofence and violation toast or sound alerts.',
  },
  attendance_alerts: {
    label: 'Attendance Alerts',
    description: 'Show live clock-in, clock-out, absence, and attendance alerts.',
  },
  payroll_updates: {
    label: 'Payroll Updates',
    description: 'Show live payroll submission, approval, rejection, and payment updates.',
  },
  support_ticket_updates: {
    label: 'Support Ticket Updates',
    description: 'Show live replies and meaningful status changes for support tickets.',
  },
  system_updates: {
    label: 'System Updates',
    description: 'Show announcements, biometrics, and other normal system updates.',
  },
};

function PreferenceSwitch({
  label,
  description,
  checked,
  disabled,
  onToggle,
}: {
  label: string;
  description: string;
  checked: boolean;
  disabled: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="space-y-0.5">
        <h4 className="text-xs font-semibold text-foreground">{label}</h4>
        <p className="text-[10px] leading-relaxed text-muted-foreground">{description}</p>
      </div>
      <button
        type="button"
        role="switch"
        aria-label={label}
        aria-checked={checked}
        disabled={disabled}
        onClick={onToggle}
        className={`relative inline-flex h-6 w-11 shrink-0 rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-primary/35 disabled:cursor-wait disabled:opacity-60 ${checked ? 'bg-primary' : 'bg-border'}`}
      >
        <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-sm transition duration-200 ease-in-out ${checked ? 'translate-x-5' : 'translate-x-0'}`} />
      </button>
    </div>
  );
}

export function NotificationPreferencesPanel({ role, value, loading, error, onChange }: NotificationPreferencesPanelProps) {
  const categoryKeys = getConfigurablePreferenceKeys(role);
  const setPreference = (key: keyof NotificationPreferences, enabled: boolean) => {
    onChange({ ...value, [key]: enabled });
  };

  return (
    <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-3">
      <div className="space-y-6 lg:col-span-2">
        <div className="space-y-4 rounded-2xl border border-border bg-white p-5 shadow-xs">
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-bold text-foreground">In-app Notification Categories</h3>
              {loading && <Loader2 aria-label="Loading notification preferences" className="h-3.5 w-3.5 animate-spin text-primary" />}
            </div>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Choose which relevant live events may interrupt you with a toast or sound.
            </p>
          </div>

          {categoryKeys.map((key, index) => {
            const copy = CATEGORY_COPY[key];
            return (
              <div key={key} className="space-y-4">
                {index > 0 && <div className="h-px bg-border" />}
                <PreferenceSwitch
                  label={copy.label}
                  description={copy.description}
                  checked={value[key]}
                  disabled={loading}
                  onToggle={() => setPreference(key, !value[key])}
                />
              </div>
            );
          })}

          <div className="rounded-xl border border-primary/20 bg-accent/40 p-3 text-[11px] leading-relaxed text-muted-foreground">
            Notification Center history is always preserved. Disabling a category only suppresses its normal toast and sound presentation.
          </div>
        </div>
      </div>

      <div className="space-y-6">
        <div className="space-y-4 rounded-2xl border border-border bg-white p-5 shadow-xs">
          <h3 className="text-sm font-bold text-foreground">Presentation</h3>
          <PreferenceSwitch
            label="Toast Popups"
            description="Display allowed live notifications as in-app popup alerts."
            checked={value.toast_enabled}
            disabled={loading}
            onToggle={() => setPreference('toast_enabled', !value.toast_enabled)}
          />
          <div className="h-px bg-border" />
          <PreferenceSwitch
            label="Sound Effects"
            description="Play a short browser chime for allowed live notifications."
            checked={value.sound_enabled}
            disabled={loading}
            onToggle={() => setPreference('sound_enabled', !value.sound_enabled)}
          />
        </div>

        <div className="flex items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50 p-3 text-amber-900">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <p className="text-[10px] leading-relaxed">
            Critical and account-security notifications always remain visible as toast alerts. Sound still follows your Sound Effects preference.
          </p>
        </div>

        {error && (
          <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-[11px] leading-relaxed text-red-700">
            {error} Defaults remain active until saved preferences can be loaded.
          </div>
        )}
      </div>
    </div>
  );
}
