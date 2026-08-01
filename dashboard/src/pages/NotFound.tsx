import { ArrowLeft, MapPin, ShieldAlert } from 'lucide-react';
import { motion } from 'framer-motion';
import { BRANDING } from '../config/branding';

export function NotFound() {
  const currentPath = typeof window !== 'undefined' ? window.location.pathname : '';

  const handleGoHome = () => {
    window.location.href = '/';
  };

  return (
    <div className="min-h-screen w-full bg-gradient-to-br from-accent via-accent/60 to-white text-foreground font-[Geist,sans-serif] flex flex-col items-center justify-center p-6 relative overflow-hidden">
      {/* Decorative Ornaments & Blobs */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -top-32 -left-32 w-[420px] h-[420px] rounded-full bg-primary/15 blur-3xl" />
        <div className="absolute -bottom-40 -right-32 w-[480px] h-[480px] rounded-full bg-amber-500/10 blur-3xl" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[700px] rounded-full border border-primary/10" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[460px] h-[460px] rounded-full border border-primary/5" />
        <MapPin className="absolute top-16 right-24 w-5 h-5 text-primary/30" />
        <MapPin className="absolute bottom-24 left-24 w-4 h-4 text-primary/20" />
      </div>

      {/* Main Glass Card */}
      <motion.div
        initial={{ opacity: 0, y: 30, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.5, ease: 'easeOut' }}
        className="relative z-10 w-full max-w-md bg-white/80 backdrop-blur-md border border-border rounded-2xl p-8 text-center shadow-xl flex flex-col items-center"
      >
        {/* Isometric 404 Reference Image */}
        <motion.div
          animate={{ y: [0, -6, 0] }}
          transition={{
            duration: 4,
            repeat: Infinity,
            ease: 'easeInOut',
          }}
          className="w-56 md:w-64 h-auto aspect-video flex items-center justify-center mb-6"
        >
          <img
            src="/404.png"
            alt="404 Pallet lost in transit"
            className="w-full h-full object-contain filter drop-shadow-md select-none"
          />
        </motion.div>

        {/* Status Badge */}
        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-red-50 border border-red-200 text-[10px] uppercase tracking-wider text-red-700 font-bold mb-4">
          <ShieldAlert className="w-3.5 h-3.5" />
          Lost in Transit
        </div>

        {/* Headings */}
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground mb-2">
          Route Not Found
        </h1>
        
        {/* Description */}
        <p className="text-sm text-muted-foreground leading-relaxed mb-6">
          The coordinates you entered don't point to an active terminal route. It looks like you've reached a restricted loading zone or invalid URL pathway.
        </p>

        {/* Path Indicator */}
        {currentPath && (
          <div className="w-full bg-panel-bg border border-border rounded-lg px-4 py-2.5 text-xs font-mono text-muted-foreground mb-6 flex items-center justify-center gap-1.5 select-all hover:bg-white transition-colors">
            <span className="text-primary font-semibold">Path:</span>
            <span>{currentPath}</span>
          </div>
        )}

        {/* Action Button */}
        <motion.button
          type="button"
          onClick={handleGoHome}
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          className="w-full h-11 rounded-lg font-semibold text-sm inline-flex items-center justify-center gap-2 transition focus:outline-none focus:ring-4 bg-primary hover:bg-primary-hover text-white focus:ring-primary/25 shadow-md hover:shadow-lg cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" />
          Return to Dashboard
        </motion.button>
      </motion.div>

      {/* Footer Branding */}
      <div className="text-center mt-8 text-[11px] text-muted-foreground/60 font-mono relative z-10">
        {BRANDING.copyright}
      </div>
    </div>
  );
}
