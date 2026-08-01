import React, { useState, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { createPortal } from 'react-dom';
import * as XLSX from 'xlsx';
import { 
  X, 
  Upload, 
  FileSpreadsheet, 
  ArrowRight, 
  CheckCircle, 
  AlertCircle, 
  Loader2, 
  HelpCircle, 
  ChevronRight 
} from 'lucide-react';
import { bulkUpsertParcelLogs } from '../../services/parcelService';
import { pushToast } from '../../hooks/useToast';

interface RiderLookup {
  id: string;
  name: string;
  mkb_id: string;
}

interface BulkParcelUploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  riders: RiderLookup[];
  onUploadSuccess: () => void;
  currentUserId?: string;
}

interface ParsedRow {
  raw: unknown[];
  riderId: string | null;
  riderName: string;
  mkbId: string;
  date: string;
  parcels: number;
  rate: number;
  isValid: boolean;
  error?: string;
}

export function BulkParcelUploadModal({
  isOpen,
  onClose,
  riders,
  onUploadSuccess,
  currentUserId
}: BulkParcelUploadModalProps) {
  const [step, setStep] = useState<1 | 2 | 3>(1); // 1: Upload, 2: Map, 3: Preview
  const [, setFile] = useState<File | null>(null);
  const [sheetData, setSheetData] = useState<unknown[][]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  
  // Mapping selections
  const [riderCol, setRiderCol] = useState<string>('');
  const [dateCol, setDateCol] = useState<string>('');
  const [parcelsCol, setParcelsCol] = useState<string>('');
  const [rateCol, setRateCol] = useState<string>('');
  const [defaultRate, setDefaultRate] = useState<number>(12); // Default to ₱12/parcel

  const [uploading, setUploading] = useState(false);

  // Drag over state
  const [dragActive, setDragActive] = useState(false);

  const resetState = useCallback(() => {
    setStep(1);
    setFile(null);
    setSheetData([]);
    setHeaders([]);
    setRiderCol('');
    setDateCol('');
    setParcelsCol('');
    setRateCol('');
    setUploading(false);
  }, []);

  const handleClose = useCallback(() => {
    resetState();
    onClose();
  }, [onClose, resetState]);

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  }, []);

  const processFile = useCallback((fileObj: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array', cellDates: true });
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        
        // Parse sheet to 2D array of raw values
        const rows = XLSX.utils.sheet_to_json<unknown[]>(worksheet, { header: 1 });
        if (rows.length < 2) {
          pushToast({
            title: "Empty Spreadsheet",
            description: "The uploaded file doesn't seem to contain enough rows.",
            tone: "warning"
          });
          return;
        }

        // Get headers (first row with non-empty values)
        const rawHeaders = (rows[0] || []).map((h) => String(h || '').trim());
        setHeaders(rawHeaders.filter(h => h.length > 0));
        setSheetData(rows);
        setFile(fileObj);
        setStep(2);

        // Auto-guess columns
        rawHeaders.forEach((h: string) => {
          const lower = h.toLowerCase();
          if (lower.includes('rider') || lower.includes('mkb') || lower.includes('name') || lower.includes('employee') || lower.includes('id')) {
            if (!riderCol) setRiderCol(h);
          }
          if (lower.includes('date') || lower.includes('day') || lower.includes('time')) {
            if (!dateCol) setDateCol(h);
          }
          if (lower.includes('parcel') || lower.includes('delivery') || lower.includes('qty') || lower.includes('count') || lower.includes('delivered')) {
            if (!parcelsCol) setParcelsCol(h);
          }
          if (lower.includes('rate') || lower.includes('price') || lower.includes('cost')) {
            if (!rateCol) setRateCol(h);
          }
        });

      } catch (err) {
        console.error('Error parsing Excel:', err);
        pushToast({
          title: "Failed to read file",
          description: "Make sure it is a valid Excel or CSV spreadsheet.",
          tone: "error"
        });
      }
    };
    reader.readAsArrayBuffer(fileObj);
  }, [riderCol, dateCol, parcelsCol, rateCol]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      processFile(e.dataTransfer.files[0]);
    }
  }, [processFile]);

  const handleFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      processFile(e.target.files[0]);
    }
  }, [processFile]);

  // Clean strings to help match IDs/Names
  const cleanStr = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

  // Parse Excel Date safely
  const parseExcelDate = (val: unknown): string => {
    if (val instanceof Date) {
      return val.toISOString().split('T')[0];
    }
    const str = String(val || '').trim();
    if (/^\d{4}-\d{2}-\d{2}/.test(str)) {
      return str.split('T')[0];
    }
    // Attempt standard parse
    const parsed = Date.parse(str);
    if (!isNaN(parsed)) {
      return new Date(parsed).toISOString().split('T')[0];
    }
    return '';
  };

  // Convert 2D sheet rows into strongly typed parsed list
  const parsedRecords = useMemo<ParsedRow[]>(() => {
    if (sheetData.length < 2 || !riderCol || !dateCol || !parcelsCol) return [];

    const headerIndexes = {
      rider: headers.indexOf(riderCol),
      date: headers.indexOf(dateCol),
      parcels: headers.indexOf(parcelsCol),
      rate: rateCol ? headers.indexOf(rateCol) : -1
    };

    const dataRows = sheetData.slice(1);
    
    return dataRows.map((row): ParsedRow => {
      const rawRiderVal = String(row[headerIndexes.rider] || '').trim();
      const rawDateVal = row[headerIndexes.date];
      const rawParcelsVal = Number(row[headerIndexes.parcels]);
      const rawRateVal = headerIndexes.rate !== -1 ? Number(row[headerIndexes.rate]) : null;

      // Match Rider Lookup
      let matchedRider: RiderLookup | undefined = undefined;
      const cleanRiderVal = cleanStr(rawRiderVal);

      if (cleanRiderVal.length > 0) {
        // Try MKB ID match first
        matchedRider = riders.find(r => cleanStr(r.mkb_id) === cleanRiderVal);
        if (!matchedRider) {
          // Try Name match
          matchedRider = riders.find(r => cleanStr(r.name) === cleanRiderVal);
        }
      }

      const dateStr = parseExcelDate(rawDateVal);
      const parcels = isNaN(rawParcelsVal) ? 0 : rawParcelsVal;
      const rate = (rawRateVal === null || isNaN(rawRateVal)) ? defaultRate : rawRateVal;

      let isValid = true;
      let error = '';

      if (!rawRiderVal) {
        isValid = false;
        error = 'Rider identifier empty';
      } else if (!matchedRider) {
        isValid = false;
        error = `Rider not found: "${rawRiderVal}"`;
      } else if (!dateStr) {
        isValid = false;
        error = 'Invalid or missing date';
      } else if (parcels < 0) {
        isValid = false;
        error = 'Parcels cannot be negative';
      }

      return {
        raw: row,
        riderId: matchedRider?.id || null,
        riderName: matchedRider?.name || rawRiderVal || 'Unknown',
        mkbId: matchedRider?.mkb_id || 'N/A',
        date: dateStr,
        parcels,
        rate,
        isValid,
        error
      };
    });
  }, [sheetData, headers, riderCol, dateCol, parcelsCol, rateCol, defaultRate, riders]);

  // Totals calculations
  const totals = useMemo(() => {
    const valid = parsedRecords.filter(r => r.isValid);
    return {
      total: parsedRecords.length,
      valid: valid.length,
      invalid: parsedRecords.length - valid.length,
      parcels: valid.reduce((sum, r) => sum + r.parcels, 0),
      gross: valid.reduce((sum, r) => sum + (r.parcels * r.rate), 0)
    };
  }, [parsedRecords]);

  // Execute bulk save to DB
  const handleImportSave = async () => {
    const validRecords = parsedRecords.filter(r => r.isValid);
    if (validRecords.length === 0) {
      pushToast({
        title: "No valid records",
        description: "Please fix mapping or errors before uploading.",
        tone: "warning"
      });
      return;
    }

    setUploading(true);
    try {
      const logsToUpsert = validRecords.map(r => ({
        rider_id: r.riderId!,
        date: r.date,
        parcels: r.parcels,
        rate: r.rate,
        created_by: currentUserId || ''
      }));

      await bulkUpsertParcelLogs(logsToUpsert);

      pushToast({
        title: "Import Successful",
        description: `Imported ${validRecords.length} parcel delivery records successfully.`,
        tone: "success"
      });
      
      onUploadSuccess();
      handleClose();
    } catch (err) {
      console.error('Failed to import logs:', err);
      const errMsg = err instanceof Error ? err.message : 'An error occurred during bulk database save.';
      pushToast({
        title: "Import Failed",
        description: errMsg,
        tone: "error"
      });
    } finally {
      setUploading(false);
    }
  };

  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 md:p-6 lg:p-8">
          {/* Backdrop overlay */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={handleClose}
            className="absolute inset-0 bg-foreground/55 backdrop-blur-md"
          />

          {/* Centered Modal Card */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 15 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 15 }}
            transition={{ type: 'spring', stiffness: 300, damping: 30 }}
            className="relative w-full max-w-[90vw] md:max-w-4xl lg:max-w-5xl max-h-[90vh] bg-white border border-border rounded-2xl shadow-2xl flex flex-col overflow-hidden z-10"
          >
        {/* Header */}
        <div className="px-6 py-5 border-b border-border flex items-center justify-between bg-white shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-accent border border-primary/30 flex items-center justify-center">
              <FileSpreadsheet className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h3 className="text-base font-bold text-foreground">Smart Excel Bulk Importer</h3>
              <p className="text-[11px] text-muted-foreground mt-0.5">Automate daily delivery parcel inputs for all 300+ riders</p>
            </div>
          </div>
          <button
            onClick={handleClose}
            className="w-8 h-8 rounded-full bg-panel-bg hover:bg-accent/50 hover:text-primary transition flex items-center justify-center"
          >
            <X className="w-4 h-4" />
          </button>
        </div>


        {/* Wizard Progress Steps Bar */}
        <div className="px-6 py-3 bg-panel-bg border-b border-border flex items-center gap-6 text-xs font-semibold shrink-0">
          <div className={`flex items-center gap-1.5 ${step === 1 ? 'text-primary' : 'text-muted-foreground'}`}>
            <span className={`w-5 h-5 rounded-full flex items-center justify-center border text-[10px] ${step === 1 ? 'border-primary bg-primary text-white' : 'border-border bg-white'}`}>1</span>
            Upload Spreadsheet
          </div>
          <ChevronRight className="w-3.5 h-3.5 text-muted-foreground/30" />
          <div className={`flex items-center gap-1.5 ${step === 2 ? 'text-primary' : 'text-muted-foreground'}`}>
            <span className={`w-5 h-5 rounded-full flex items-center justify-center border text-[10px] ${step === 2 ? 'border-primary bg-primary text-white' : 'border-border bg-white'}`}>2</span>
            Map Columns
          </div>
          <ChevronRight className="w-3.5 h-3.5 text-muted-foreground/30" />
          <div className={`flex items-center gap-1.5 ${step === 3 ? 'text-primary' : 'text-muted-foreground'}`}>
            <span className={`w-5 h-5 rounded-full flex items-center justify-center border text-[10px] ${step === 3 ? 'border-primary bg-primary text-white' : 'border-border bg-white'}`}>3</span>
            Preview & Confirm
          </div>
        </div>

        {/* Step Content */}
        <div className="flex-1 overflow-y-auto p-6 min-h-0 bg-white">
          
          {/* STEP 1: UPLOAD */}
          {step === 1 && (
            <div 
              onDragEnter={handleDrag}
              onDragOver={handleDrag}
              onDragLeave={handleDrag}
              onDrop={handleDrop}
              className={`h-72 border-2 border-dashed rounded-xl flex flex-col items-center justify-center p-6 text-center transition cursor-pointer relative ${
                dragActive 
                  ? 'border-primary bg-accent/20' 
                  : 'border-border hover:border-primary/40 hover:bg-panel-bg'
              }`}
            >
              <input
                type="file"
                id="excel-file-upload"
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                accept=".xlsx,.xls,.csv"
                onChange={handleFileInput}
              />
              <div className="w-16 h-16 rounded-full bg-accent flex items-center justify-center mb-4">
                <Upload className="w-8 h-8 text-primary" />
              </div>
              <h4 className="text-sm font-bold text-foreground mb-1">Drag and drop your spreadsheet here</h4>
              <p className="text-xs text-muted-foreground mb-4">Supports .xlsx, .xls, and .csv files from Shopee / Courier platforms</p>
              <button 
                type="button" 
                className="px-4 py-2 bg-white border border-border hover:border-primary/40 text-foreground text-xs font-semibold rounded-lg shadow-sm"
              >
                Browse Files
              </button>
            </div>
          )}

          {/* STEP 2: COLUMN MAPPER */}
          {step === 2 && (
            <div className="space-y-6">
              <div className="p-4 bg-accent/30 border border-primary/10 rounded-xl flex items-start gap-3">
                <HelpCircle className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                <div>
                  <h4 className="text-xs font-bold text-primary">Map Your Spreadsheet Columns</h4>
                  <p className="text-[11px] text-muted-foreground mt-1 leading-relaxed">
                    Select which columns in your Excel file contain the target data. This prevents errors even if the spreadsheet format changes in the future!
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                {/* Rider Col */}
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-foreground block">Rider Identifier Column *</label>
                  <select
                    value={riderCol}
                    onChange={(e) => setRiderCol(e.target.value)}
                    className="w-full h-10 px-3 rounded-lg border border-border bg-panel-bg text-xs focus:ring-1 focus:ring-primary/30 outline-none text-foreground"
                  >
                    <option value="">-- Choose Column --</option>
                    {headers.map(h => (
                      <option key={h} value={h}>{h}</option>
                    ))}
                  </select>
                  <span className="text-[10px] text-muted-foreground">Matches rider name, email, or MKB ID</span>
                </div>

                {/* Date Col */}
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-foreground block">Date Column *</label>
                  <select
                    value={dateCol}
                    onChange={(e) => setDateCol(e.target.value)}
                    className="w-full h-10 px-3 rounded-lg border border-border bg-panel-bg text-xs focus:ring-1 focus:ring-primary/30 outline-none text-foreground"
                  >
                    <option value="">-- Choose Column --</option>
                    {headers.map(h => (
                      <option key={h} value={h}>{h}</option>
                    ))}
                  </select>
                  <span className="text-[10px] text-muted-foreground">Contains target date for the parcels</span>
                </div>

                {/* Parcels Col */}
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-foreground block">Delivered Parcels Count *</label>
                  <select
                    value={parcelsCol}
                    onChange={(e) => setParcelsCol(e.target.value)}
                    className="w-full h-10 px-3 rounded-lg border border-border bg-panel-bg text-xs focus:ring-1 focus:ring-primary/30 outline-none text-foreground"
                  >
                    <option value="">-- Choose Column --</option>
                    {headers.map(h => (
                      <option key={h} value={h}>{h}</option>
                    ))}
                  </select>
                  <span className="text-[10px] text-muted-foreground">Number of successfully delivered parcels</span>
                </div>

                {/* Rate Col */}
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-foreground block">Rate Per Parcel Column (Optional)</label>
                  <select
                    value={rateCol}
                    onChange={(e) => setRateCol(e.target.value)}
                    className="w-full h-10 px-3 rounded-lg border border-border bg-panel-bg text-xs focus:ring-1 focus:ring-primary/30 outline-none text-foreground"
                  >
                    <option value="">-- Default Rate (₱{defaultRate}/parcel) --</option>
                    {headers.map(h => (
                      <option key={h} value={h}>{h}</option>
                    ))}
                  </select>
                  <span className="text-[10px] text-muted-foreground">Uses sheet value, or defaults to standard below</span>
                </div>
              </div>

              {/* Default Rate Config */}
              <div className="p-4 bg-panel-bg border border-border rounded-xl flex items-center justify-between">
                <div>
                  <h5 className="text-xs font-bold text-foreground">Fallback Rate Per Parcel</h5>
                  <p className="text-[10px] text-muted-foreground mt-0.5">Applied when rate is missing in spreadsheet</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-muted-foreground">₱</span>
                  <input
                    type="number"
                    value={defaultRate}
                    onChange={(e) => setDefaultRate(Math.max(0, Number(e.target.value) || 0))}
                    className="w-20 h-9 px-2 text-center rounded-lg border border-border text-xs font-semibold focus:ring-1 focus:ring-primary/30 outline-none text-foreground"
                  />
                </div>
              </div>
            </div>
          )}

          {/* STEP 3: PREVIEW */}
          {step === 3 && (
            <div className="space-y-5 flex flex-col h-full min-h-0">
              
              {/* Summary Stats Cards */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 shrink-0">
                <div className="p-3 bg-panel-bg border border-border rounded-xl text-center">
                  <div className="text-[10px] text-muted-foreground font-bold">Total Rows</div>
                  <div className="text-lg font-bold text-foreground mt-0.5">{totals.total}</div>
                </div>
                <div className="p-3 bg-emerald-50 border border-emerald-500/10 rounded-xl text-center">
                  <div className="text-[10px] text-emerald-700 font-bold">Ready to Save</div>
                  <div className="text-lg font-bold text-emerald-600 mt-0.5">{totals.valid}</div>
                </div>
                <div className="p-3 bg-red-50 border border-red-500/10 rounded-xl text-center">
                  <div className="text-[10px] text-red-700 font-bold">Errors found</div>
                  <div className="text-lg font-bold text-red-500 mt-0.5">{totals.invalid}</div>
                </div>
                <div className="p-3 bg-accent/50 border border-primary/10 rounded-xl text-center">
                  <div className="text-[10px] text-primary font-bold">Total Gross Pay</div>
                  <div className="text-lg font-bold text-primary mt-0.5">₱{totals.gross.toLocaleString('en-PH', { maximumFractionDigits: 0 })}</div>
                </div>
              </div>

              {/* Scrollable Preview Grid */}
              <div className="flex-1 overflow-auto border border-border rounded-xl min-h-0 max-h-[300px]">
                <table className="w-full text-[11px] text-left border-collapse">
                  <thead className="bg-panel-bg border-b border-border sticky top-0 z-[10]">
                    <tr>
                      <th className="px-4 py-2.5 font-bold text-muted-foreground">Status</th>
                      <th className="px-4 py-2.5 font-bold text-muted-foreground">Rider Name</th>
                      <th className="px-4 py-2.5 font-bold text-muted-foreground">MKB ID</th>
                      <th className="px-4 py-2.5 font-bold text-muted-foreground">Date</th>
                      <th className="px-4 py-2.5 font-bold text-muted-foreground text-right">Parcels</th>
                      <th className="px-4 py-2.5 font-bold text-muted-foreground text-right">Rate</th>
                      <th className="px-4 py-2.5 font-bold text-muted-foreground text-right">Gross Pay</th>
                    </tr>
                  </thead>
                  <tbody>
                    {parsedRecords.map((r, i) => (
                      <tr 
                        key={i} 
                        className={`border-b border-border transition ${
                          r.isValid ? 'hover:bg-panel-bg' : 'bg-red-50/40 hover:bg-red-50/60'
                        }`}
                      >
                        <td className="px-4 py-2">
                          {r.isValid ? (
                            <span className="inline-flex items-center gap-1 text-emerald-600 font-bold">
                              <CheckCircle className="w-3.5 h-3.5" />
                              Ready
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-red-500 font-bold" title={r.error}>
                              <AlertCircle className="w-3.5 h-3.5" />
                              Error
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-2 font-semibold text-foreground truncate max-w-[150px]">{r.riderName}</td>
                        <td className="px-4 py-2 font-mono text-muted-foreground">{r.mkbId}</td>
                        <td className="px-4 py-2 text-muted-foreground">{r.date || 'N/A'}</td>
                        <td className="px-4 py-2 text-right font-semibold text-foreground">{r.parcels}</td>
                        <td className="px-4 py-2 text-right text-muted-foreground">₱{r.rate.toFixed(1)}</td>
                        <td className="px-4 py-2 text-right font-bold text-primary">
                          ₱{(r.parcels * r.rate).toFixed(2)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Notice text */}
              {totals.invalid > 0 && (
                <div className="p-3 bg-red-50 border border-red-500/10 rounded-xl flex items-center gap-2 text-[10px] text-red-700">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>Some rows contain errors (e.g. rider name not found in database). **Only valid rows** will be imported when you save.</span>
                </div>
              )}
            </div>
          )}

        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-border bg-panel-bg flex items-center justify-between shrink-0">
          <div>
            {step > 1 && (
              <button
                onClick={() => setStep(step === 3 ? 2 : 1)}
                className="h-10 px-4 rounded-lg border border-border hover:bg-white text-xs font-semibold transition text-foreground"
              >
                Back
              </button>
            )}
          </div>
          
          <div className="flex items-center gap-2">
            <button
              onClick={handleClose}
              className="h-10 px-4 rounded-lg bg-white border border-border hover:bg-red-50/30 text-xs font-semibold text-muted-foreground transition"
            >
              Cancel
            </button>

            {step === 2 && (
              <button
                onClick={() => {
                  if (!riderCol || !dateCol || !parcelsCol) {
                    pushToast({
                      title: "Mapping Incomplete",
                      description: "Please specify Rider, Date, and Parcels column mappings.",
                      tone: "warning"
                    });
                    return;
                  }
                  setStep(3);
                }}
                className="h-10 px-4 rounded-lg bg-primary hover:bg-primary-hover text-white text-xs font-semibold transition inline-flex items-center gap-1.5"
              >
                Continue to Preview
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            )}

            {step === 3 && (
              <button
                onClick={handleImportSave}
                disabled={uploading || totals.valid === 0}
                className="h-10 px-5 rounded-lg bg-foreground hover:bg-black text-white text-xs font-semibold transition inline-flex items-center gap-2 disabled:opacity-50"
              >
                {uploading ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    Uploading logs...
                  </>
                ) : (
                  <>
                    <CheckCircle className="w-3.5 h-3.5 text-emerald-400" />
                    Confirm & Save {totals.valid} Logs
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body
  );
}
