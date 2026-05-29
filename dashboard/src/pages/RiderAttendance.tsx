import { Clock4, ArrowLeft } from 'lucide-react';
interface RiderAttendanceProps {
  onBack: () => void;
}
export function RiderAttendance({ onBack }: RiderAttendanceProps) {
  return (
    <div className="p-4 md:p-6 lg:p-7 max-w-3xl mx-auto">
      <button
        onClick={onBack}
        className="inline-flex items-center gap-1.5 text-sm text-[#6B6258] hover:text-[#1A1410] mb-4 transition-colors">
        
        <ArrowLeft className="w-4 h-4" />
        Back to dashboard
      </button>

      <div className="rounded-2xl border border-[#EFEAE2] bg-white p-8 text-center shadow-sm">
        <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-[#FFF1E0] text-[#db6c00] mb-3 ring-1 ring-[#db6c00]/20">
          <Clock4 className="w-6 h-6" />
        </div>
        <h1 className="text-[#1A1410] font-semibold text-lg">
          Time-In / Time-Out
        </h1>
        <p className="text-sm text-[#6B6258] mt-1 max-w-md mx-auto">
          The dedicated attendance flow lives here. For now, use the hero panel
          on your dashboard to clock in or out with facial recognition.
        </p>
        <button
          onClick={onBack}
          className="mt-5 inline-flex items-center gap-1.5 h-10 px-4 rounded-md bg-[#db6c00] hover:bg-[#b85a00] text-white text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-[#db6c00]/25 shadow-sm">
          
          Open the attendance panel
        </button>
      </div>
    </div>);

}
