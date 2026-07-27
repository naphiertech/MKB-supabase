import React, { useState, useMemo, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { createPortal } from 'react-dom';
import { Search, X, User, MapPin, ChevronRight } from 'lucide-react';

interface RiderLookup {
  id: string;
  name: string;
  mkb_id: string;
  zones: { name: string } | null;
}

interface SearchableRiderComboboxModalProps {
  isOpen: boolean;
  onClose: () => void;
  riders: RiderLookup[];
  onSelectRider: (riderId: string) => void;
}

export function SearchableRiderComboboxModal({
  isOpen,
  onClose,
  riders,
  onSelectRider,
}: SearchableRiderComboboxModalProps) {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);

  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setSelectedIndex(0);
    }
  }, [isOpen]);

  const filteredRiders = useMemo(() => {
    if (!query.trim()) return riders;
    const q = query.toLowerCase().trim();
    return riders.filter(
      (r) =>
        r.name.toLowerCase().includes(q) ||
        (r.mkb_id && r.mkb_id.toLowerCase().includes(q)) ||
        (r.zones?.name && r.zones.name.toLowerCase().includes(q))
    );
  }, [riders, query]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev < filteredRiders.length - 1 ? prev + 1 : prev));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev > 0 ? prev - 1 : 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (filteredRiders[selectedIndex]) {
        onSelectRider(filteredRiders[selectedIndex].id);
        onClose();
      }
    } else if (e.key === 'Escape') {
      onClose();
    }
  };

  if (typeof document === 'undefined') return null;

  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[9999] flex items-start justify-center pt-16 md:pt-24 p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-[#1A1410]/55 backdrop-blur-md"
          />

          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: -10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: -10 }}
            transition={{ type: 'spring', stiffness: 350, damping: 30 }}
            className="relative w-full max-w-xl bg-white border border-[#EFEAE2] rounded-2xl shadow-2xl overflow-hidden flex flex-col z-10 max-h-[80vh]"
          >
            {/* Search Input Box */}
            <div className="px-4 py-3.5 border-b border-[#EFEAE2] flex items-center gap-3 bg-white sticky top-0 shrink-0">
              <Search className="w-5 h-5 text-[#db6c00] shrink-0" />
              <input
                type="text"
                autoFocus
                placeholder="Search rider name, MKB ID, or zone..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={handleKeyDown}
                className="w-full bg-transparent text-sm text-[#1A1410] placeholder:text-[#A39988] outline-none font-medium"
              />
              {query && (
                <button
                  type="button"
                  onClick={() => setQuery('')}
                  className="p-1 text-[#A39988] hover:text-[#1A1410] rounded transition"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>

            {/* Results List */}
            <div className="flex-1 overflow-y-auto p-2 space-y-1 min-h-0">
              {filteredRiders.length === 0 ? (
                <div className="p-8 text-center text-xs text-[#6B6258]">
                  No riders matching &ldquo;<span className="font-semibold">{query}</span>&rdquo;
                </div>
              ) : (
                filteredRiders.map((r, idx) => {
                  const isSelected = idx === selectedIndex;
                  return (
                    <div
                      key={r.id}
                      onClick={() => {
                        onSelectRider(r.id);
                        onClose();
                      }}
                      onMouseEnter={() => setSelectedIndex(idx)}
                      className={`px-3.5 py-3 rounded-xl cursor-pointer transition flex items-center justify-between ${
                        isSelected
                          ? 'bg-[#FFF1E0] border border-[#db6c00]/30 text-[#1A1410]'
                          : 'hover:bg-[#FAFAF7] border border-transparent text-[#1A1410]'
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div
                          className={`w-9 h-9 rounded-xl border flex items-center justify-center shrink-0 ${
                            isSelected
                              ? 'bg-[#db6c00] text-white border-[#db6c00]'
                              : 'bg-[#FAFAF7] border-[#EFEAE2] text-[#db6c00]'
                          }`}
                        >
                          <User className="w-4 h-4" />
                        </div>
                        <div className="min-w-0">
                          <div className="text-xs font-bold truncate">{r.name}</div>
                          <div className="text-[11px] font-mono text-[#6B6258] flex items-center gap-2 mt-0.5">
                            <span>{r.mkb_id || 'MKB-RIDER'}</span>
                            <span>&bull;</span>
                            <span className="flex items-center gap-0.5">
                              <MapPin className="w-3 h-3 text-[#db6c00]/70" />
                              {r.zones?.name || 'No Zone'}
                            </span>
                          </div>
                        </div>
                      </div>
                      <ChevronRight
                        className={`w-4 h-4 transition ${
                          isSelected ? 'text-[#db6c00] translate-x-0.5' : 'text-[#A39988]'
                        }`}
                      />
                    </div>
                  );
                })
              )}
            </div>

            {/* Footer tips */}
            <div className="px-4 py-2.5 bg-[#FAFAF7] border-t border-[#EFEAE2] flex items-center justify-between text-[10.5px] text-[#6B6258] font-mono shrink-0">
              <div className="flex items-center gap-2">
                <span className="px-1.5 py-0.5 rounded bg-white border border-[#EFEAE2] font-bold">
                  &uarr;&darr;
                </span>
                <span>Navigate</span>
                <span className="px-1.5 py-0.5 rounded bg-white border border-[#EFEAE2] font-bold">
                  &crarr;
                </span>
                <span>Select</span>
              </div>
              <div>{filteredRiders.length} riders found</div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body
  );
}
