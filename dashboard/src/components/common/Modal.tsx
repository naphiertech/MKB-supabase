import React, { useEffect } from 'react';
import { X } from 'lucide-react';
interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  subtitle?: string;
  /** Width preset */
  size?: 'sm' | 'md' | 'lg';
  /** Disable closing via backdrop/Esc (useful during a critical scan). */
  dismissible?: boolean;
  children: React.ReactNode;
}
const SIZE: Record<NonNullable<ModalProps['size']>, string> = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-2xl'
};
export function Modal({
  open,
  onClose,
  title,
  subtitle,
  size = 'md',
  dismissible = true,
  children
}: ModalProps) {
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && dismissible) onClose();
    }
    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [open, onClose, dismissible]);
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-[1000] flex items-center justify-center px-4 py-8"
      role="dialog"
      aria-modal="true"
      aria-labelledby={title ? 'modal-title' : undefined}>
      
      <button
        type="button"
        aria-label="Close"
        tabIndex={-1}
        onClick={() => dismissible && onClose()}
        className="absolute inset-0 bg-[#1A1410]/40 backdrop-blur-sm" />
      
      <div
        className={`relative w-full ${SIZE[size]} bg-white border border-[#EFEAE2] rounded-2xl shadow-[0_30px_60px_-20px_rgba(26,20,16,0.25)] overflow-hidden animate-[fadeIn_.18s_ease-out]`}>
        
        {(title || dismissible) &&
        <div className="flex items-start justify-between gap-3 px-5 pt-5 pb-3 border-b border-[#EFEAE2]/70">
            <div className="min-w-0">
              {title &&
            <h2
              id="modal-title"
              className="text-[#1A1410] font-semibold text-base tracking-tight">
              
                  {title}
                </h2>
            }
              {subtitle &&
            <p className="text-xs text-[#6B6258] mt-0.5">{subtitle}</p>
            }
            </div>
            {dismissible &&
          <button
            type="button"
            onClick={onClose}
            aria-label="Close dialog"
            className="text-[#6B6258] hover:text-[#1A1410] p-1.5 -mr-1.5 -mt-1.5 rounded-md hover:bg-[#FAFAF7]">
            
                <X className="w-4 h-4" />
              </button>
          }
          </div>
        }
        <div className="px-5 py-5">{children}</div>
      </div>
    </div>);

}