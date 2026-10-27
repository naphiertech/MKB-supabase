import { useState } from 'react';
import { ShieldAlert, Settings, RefreshCw, AlertTriangle } from 'lucide-react';
import { openDeveloperSettings } from '../../lib/deviceSecurity';

interface DeveloperOptionsBlockerProps {
  onRecheck: () => Promise<void> | void;
}

export function DeveloperOptionsBlocker({
  onRecheck,
}: DeveloperOptionsBlockerProps) {
  const [openingSettings, setOpeningSettings] = useState(false);
  const [rechecking, setRechecking] = useState(false);

  async function handleOpenSettings() {
    setOpeningSettings(true);
    try {
      await openDeveloperSettings();
    } finally {
      setTimeout(() => setOpeningSettings(false), 800);
    }
  }

  async function handleRecheck() {
    setRechecking(true);
    try {
      await onRecheck();
    } finally {
      setTimeout(() => setRechecking(false), 500);
    }
  }

  return (
    <div className="fixed inset-0 z-[99999] flex flex-col items-center justify-center bg-slate-900/95 backdrop-blur-md p-6 text-white font-[Geist,sans-serif]">
      <div className="w-full max-w-md bg-white text-slate-900 rounded-2xl p-6 sm:p-8 shadow-2xl border border-red-200">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-12 h-12 rounded-xl bg-red-100 flex items-center justify-center shrink-0">
            <ShieldAlert className="w-6 h-6 text-red-600" />
          </div>
          <div>
            <span className="inline-block text-[10px] font-bold uppercase tracking-wider text-red-700 bg-red-50 border border-red-200 px-2 py-0.5 rounded-full mb-1">
              Security Policy Enforced
            </span>
            <h1 className="text-lg font-bold text-slate-900 leading-tight">
              Developer Options Detected
            </h1>
          </div>
        </div>

        <p className="text-xs text-slate-600 leading-relaxed mb-4">
          To protect company dispatch integrity and prevent fake GPS / mock location spoofing, <strong>MKB RiderTrack</strong> cannot run while Developer Options is enabled on this phone.
        </p>

        <div className="bg-amber-50 border border-amber-200 rounded-xl p-3.5 mb-6 text-xs text-amber-950 space-y-1.5">
          <div className="font-semibold text-amber-900 flex items-center gap-1.5">
            <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
            <span>How to continue:</span>
          </div>
          <ol className="list-decimal list-inside space-y-1 text-amber-900/90 text-[11px] pl-1">
            <li>Tap <strong>Open Developer Options</strong> below.</li>
            <li>Turn off the toggle at the very top of the settings page.</li>
            <li>Return to this app.</li>
          </ol>
        </div>

        <div className="space-y-2.5">
          <button
            type="button"
            onClick={handleOpenSettings}
            disabled={openingSettings}
            className="w-full h-11 rounded-lg bg-primary hover:bg-primary-hover active:bg-primary/95 text-white font-semibold text-sm inline-flex items-center justify-center gap-2 transition focus:outline-none focus:ring-4 focus:ring-primary/25 shadow-sm cursor-pointer disabled:opacity-60"
          >
            <Settings className="w-4 h-4 shrink-0" />
            <span>{openingSettings ? 'Opening Settings…' : 'Open Developer Options'}</span>
          </button>

          <button
            type="button"
            onClick={handleRecheck}
            disabled={rechecking}
            className="w-full h-11 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 active:bg-slate-100 text-slate-800 font-semibold text-sm inline-flex items-center justify-center gap-2 transition focus:outline-none focus:ring-2 focus:ring-slate-300 cursor-pointer disabled:opacity-60"
          >
            <RefreshCw className={`w-4 h-4 shrink-0 ${rechecking ? 'animate-spin' : ''}`} />
            <span>{rechecking ? 'Checking…' : "I've Disabled It — Check Again"}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
