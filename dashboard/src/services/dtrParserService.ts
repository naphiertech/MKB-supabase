import { supabase } from '../lib/supabaseClient';
import { logActivity } from '../lib/apiService';
import {
  isAttendanceLate,
  listAttendancePolicyConfigurations,
  type AttendancePolicyConfiguration,
} from './attendancePolicyService';

export interface ParsedDTRLog {
  riderId: string;
  riderName: string;
  date: string; // YYYY-MM-DD
  timeIn: string | null; // HH:MM
  timeOut: string | null; // HH:MM
  hours: number;
  status: 'present' | 'late' | 'absent' | 'on_leave';
}

interface TextItem {
  str: string;
  transform: number[];
}

interface PdfJsWorkerOptions {
  workerSrc: string;
}

interface PdfJsPageViewport {
  width: number;
  height: number;
}

interface PdfJsPageRenderParameters {
  canvasContext: CanvasRenderingContext2D;
  viewport: PdfJsPageViewport;
}

interface PdfJsPage {
  getViewport: (options: { scale: number }) => PdfJsPageViewport;
  getTextContent: () => Promise<{ items: TextItem[] }>;
  render: (options: PdfJsPageRenderParameters) => { promise: Promise<void> };
}

interface PdfJsDocument {
  numPages: number;
  getPage: (pageNum: number) => Promise<PdfJsPage>;
}

interface PdfJsLibrary {
  GlobalWorkerOptions: PdfJsWorkerOptions;
  getDocument: (options: { data: ArrayBuffer }) => { promise: Promise<PdfJsDocument> };
}

interface TesseractWorker {
  recognize: (image: HTMLCanvasElement, lang: string) => Promise<{ data: { text: string } }>;
  terminate: () => Promise<void>;
}

interface TesseractLibrary {
  recognize: (image: HTMLCanvasElement, lang: string) => Promise<{ data: { text: string } }>;
  createWorker: (lang: string) => Promise<TesseractWorker>;
}

// Dynamically load PDF.js from CDN
async function loadPdfJs(): Promise<PdfJsLibrary> {
  const gWin = window as unknown as Record<string, unknown>;
  if (gWin.pdfjsLib) return gWin.pdfjsLib as PdfJsLibrary;
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.4.120/pdf.min.js';
    script.onload = () => {
      const pdfjsLib = (window as unknown as { pdfjsLib?: PdfJsLibrary }).pdfjsLib;
      if (pdfjsLib) {
        pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.4.120/pdf.worker.min.js';
        resolve(pdfjsLib);
      } else {
        reject(new Error('pdfjsLib not found on window object'));
      }
    };
    script.onerror = () => reject(new Error('Failed to load PDF.js from CDN'));
    document.head.appendChild(script);
  });
}

// Dynamically load Tesseract.js from CDN
async function loadTesseract(): Promise<TesseractLibrary> {
  const gWin = window as unknown as Record<string, unknown>;
  if (gWin.Tesseract) return gWin.Tesseract as TesseractLibrary;
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/tesseract.js/4.1.1/tesseract.min.js';
    script.onload = () => {
      const tesseract = (window as unknown as { Tesseract?: TesseractLibrary }).Tesseract;
      if (tesseract) {
        resolve(tesseract);
      } else {
        reject(new Error('Tesseract not found on window object'));
      }
    };
    script.onerror = () => reject(new Error('Failed to load Tesseract.js from CDN'));
    document.head.appendChild(script);
  });
}

/**
 * Parses a DTR PDF file (extracting text or performing OCR fallback if scanned)
 */
export async function parseDTRPdf(
  file: File,
  allRiders: { id: string; name: string }[],
  onStatusChange?: (status: string) => void,
  policies?: AttendancePolicyConfiguration[]
): Promise<ParsedDTRLog[]> {
  onStatusChange?.('Initializing PDF engine...');
  const [pdfjsLib, loadedPolicies] = await Promise.all([
    loadPdfJs(),
    policies ? Promise.resolve(policies) : listAttendancePolicyConfigurations().catch(() => []),
  ]);
  const activePolicies = policies || loadedPolicies;
  const fileReader = new FileReader();

  const arrayBuffer = await new Promise<ArrayBuffer>((resolve, reject) => {
    fileReader.onload = () => resolve(fileReader.result as ArrayBuffer);
    fileReader.onerror = () => reject(new Error('Failed to read PDF file'));
    fileReader.readAsArrayBuffer(file);
  });

  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const numPages = pdf.numPages;
  const parsedLogs: ParsedDTRLog[] = [];

  for (let pageNum = 1; pageNum <= numPages; pageNum++) {
    onStatusChange?.(`Processing page ${pageNum} of ${numPages}...`);
    const page = await pdf.getPage(pageNum);
    
    // Check viewport size
    const viewport = page.getViewport({ scale: 1.0 });
    const midX = viewport.width / 2;

    // Attempt text extraction
    const textContent = await page.getTextContent();
    const hasText = textContent.items.length > 0;
    
    let leftText = '';
    let rightText = '';

    if (hasText) {
      onStatusChange?.(`Extracting digital text from page ${pageNum}...`);
      const leftItems: TextItem[] = [];
      const rightItems: TextItem[] = [];

      for (const item of textContent.items) {
        const x = item.transform[4];
        if (x < midX) {
          leftItems.push(item);
        } else {
          rightItems.push(item);
        }
      }

      const sortAndJoin = (items: TextItem[]) => {
        const rows: { [key: number]: TextItem[] } = {};
        for (const item of items) {
          // Group by Y coordinate bucketed to 4px
          const y = Math.round(item.transform[5] / 4) * 4;
          if (!rows[y]) rows[y] = [];
          rows[y].push(item);
        }
        // Y coordinate increases upwards in PDF.js, sort descending for top-to-bottom
        const sortedYs = Object.keys(rows)
          .map(Number)
          .sort((a, b) => b - a);

        return sortedYs
          .map(y => {
            const rowItems = rows[y].sort((a, b) => a.transform[4] - b.transform[4]);
            return rowItems.map(item => item.str).join(' ');
          })
          .join('\n');
      };

      leftText = sortAndJoin(leftItems);
      rightText = sortAndJoin(rightItems);
    }

    // OCR Fallback if page has no extractable text
    if (!hasText || (!leftText.trim() && !rightText.trim())) {
      onStatusChange?.(`Page ${pageNum} is scanned. Running OCR engine (this may take a moment)...`);
      const tesseract = await loadTesseract();

      // Render PDF page to a canvas
      const scale = 2.0; // scale up for higher OCR accuracy
      const ocrViewport = page.getViewport({ scale });
      const canvas = document.createElement('canvas');
      const context = canvas.getContext('2d');
      canvas.width = ocrViewport.width;
      canvas.height = ocrViewport.height;

      if (context) {
        await page.render({ canvasContext: context, viewport: ocrViewport }).promise;
        
        // Split canvas in half horizontally to separate left and right DTRs
        const canvasWidth = canvas.width;
        const canvasHeight = canvas.height;

        // Left canvas
        const leftCanvas = document.createElement('canvas');
        leftCanvas.width = canvasWidth / 2;
        leftCanvas.height = canvasHeight;
        const leftCtx = leftCanvas.getContext('2d');
        leftCtx?.drawImage(canvas, 0, 0, canvasWidth / 2, canvasHeight, 0, 0, canvasWidth / 2, canvasHeight);

        // Right canvas
        const rightCanvas = document.createElement('canvas');
        rightCanvas.width = canvasWidth / 2;
        rightCanvas.height = canvasHeight;
        const rightCtx = rightCanvas.getContext('2d');
        rightCtx?.drawImage(canvas, canvasWidth / 2, 0, canvasWidth / 2, canvasHeight, 0, 0, canvasWidth / 2, canvasHeight);

        // Run OCR on both sides in parallel
        const [leftOcrRes, rightOcrRes] = await Promise.all([
          tesseract.recognize(leftCanvas, 'eng'),
          tesseract.recognize(rightCanvas, 'eng')
        ]);

        leftText = leftOcrRes.data.text;
        rightText = rightOcrRes.data.text;
      }
    }

    // Parse left and right columns independently
    const parseColumn = (text: string) => {
      if (!text || !text.trim()) return;

      // 1. Identify matched Rider Name
      const matchedRider = allRiders.find(r => 
        text.toLowerCase().includes(r.name.toLowerCase())
      );

      if (!matchedRider) {
        console.warn('Could not match rider name in text block');
        return;
      }

      // 2. Identify Month & Year (e.g. "July 2026")
      const monthRegex = /(January|February|March|April|May|June|July|August|September|October|November|December)\s*(\d{4})/i;
      const monthMatch = text.match(monthRegex);
      if (!monthMatch) {
        console.warn(`Could not parse month/year for rider: ${matchedRider.name}`);
        return;
      }

      const monthName = monthMatch[1];
      const year = parseInt(monthMatch[2], 10);
      const monthsMap: { [key: string]: number } = {
        january: 0, february: 1, march: 2, april: 3, may: 4, june: 5,
        july: 6, august: 7, september: 8, october: 9, november: 10, december: 11
      };
      const monthIndex = monthsMap[monthName.toLowerCase()];
      
      // 3. Scan lines for daily time logs
      const lines = text.split('\n');
      for (const line of lines) {
        const trimmed = line.trim();
        const dayPrefixMatch = trimmed.match(/^(\d{1,2})\b/);
        if (!dayPrefixMatch) continue;

        const dayNum = parseInt(dayPrefixMatch[1], 10);
        if (dayNum < 1 || dayNum > 31) continue;

        const timeMatches = trimmed.match(/\b([0-2]?\d:[0-5]\d)\b/g);
        if (!timeMatches || timeMatches.length === 0) continue;

        const rawTimeIn = timeMatches[0];
        const rawTimeOut = timeMatches.length > 1 ? timeMatches[timeMatches.length - 1] : null;

        const dateStr = `${year}-${String(monthIndex + 1).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`;
        
        let hoursWorked = 0;

        if (rawTimeIn && rawTimeOut) {
          const [inH, inM] = rawTimeIn.split(':').map(Number);
          const [outH, outM] = rawTimeOut.split(':').map(Number);
          const inTotal = inH * 60 + inM;
          const outTotal = outH * 60 + outM;
          if (outTotal > inTotal) {
            hoursWorked = Number(((outTotal - inTotal) / 60).toFixed(2));
          }
        }

        let status: ParsedDTRLog['status'] = 'present';
        if (rawTimeIn) {
          if (isAttendanceLate(rawTimeIn, dateStr, activePolicies)) {
            status = 'late';
          }
        }

        parsedLogs.push({
          riderId: matchedRider.id,
          riderName: matchedRider.name,
          date: dateStr,
          timeIn: rawTimeIn,
          timeOut: rawTimeOut,
          hours: hoursWorked,
          status
        });
      }
    };

    parseColumn(leftText);
    parseColumn(rightText);
  }

  return parsedLogs;
}

/**
 * Saves/upserts parsed DTR logs into Supabase
 */
export async function saveImportedLogs(logs: ParsedDTRLog[]): Promise<{ count: number; error: unknown }> {
  if (logs.length === 0) return { count: 0, error: null };

  const dbPayloads = logs.map(log => {
    const timeInIso = log.timeIn ? `${log.date}T${log.timeIn.padStart(5, '0')}:00+08:00` : null;
    const timeOutIso = log.timeOut ? `${log.date}T${log.timeOut.padStart(5, '0')}:00+08:00` : null;

    return {
      rider_id: log.riderId,
      date: log.date,
      time_in: timeInIso,
      time_out: timeOutIso,
      status: log.status,
      source: 'manual',
      events: []
    };
  });

  const { error } = await supabase
    .from('attendance_logs')
    .upsert(dbPayloads, { onConflict: 'rider_id,date' });

  if (!error) {
    logActivity({
      eventType: 'dtr_import',
      description: `Manually imported and upserted ${dbPayloads.length} rider attendance records via DTR PDF parser.`,
      metadata: { count: dbPayloads.length }
    }).catch(err => console.warn('Failed to log DTR import:', err));
  }

  return {
    count: dbPayloads.length,
    error
  };
}
