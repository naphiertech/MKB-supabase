import * as XLSX from 'xlsx';

export interface FmsParsedRow {
  external_driver_id: string;
  external_driver_name: string;
  contract_type?: string;
  vehicle_type?: string;
  zone_id?: string;
  assigned: number;
  assigned_target: number;
  handed_over: number;
  delivered: number;
  delivering: number;
  failed_delivery: number;
  stuck_at_delivering: number;
  on_hold: number;
  first_delivering_time?: string | null; // ISO string in Asia/Manila or null
  first_delivering_time_raw?: string | null;
  time_since_last_delivery?: string | null;
}

export interface FmsParseResult {
  sha256: string;
  rows: FmsParsedRow[];
  rowCount: number;
  warnings: string[];
  parserVersion: 'fms_delivery_v3.0';
}

/**
 * Computes SHA-256 hash of an ArrayBuffer in browser or Node test environment.
 */
export async function computeArrayBufferSha256(buffer: ArrayBuffer): Promise<string> {
  if (typeof crypto !== 'undefined' && crypto.subtle && typeof crypto.subtle.digest === 'function') {
    const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
  }
  // Node.js fallback if running in test environment without WebCrypto global
  try {
    const nodeCrypto = await import('crypto');
    const hash = nodeCrypto.createHash('sha256');
    hash.update(Buffer.from(buffer));
    return hash.digest('hex');
  } catch {
    throw new Error('Unable to compute SHA-256 fingerprint: Crypto API unavailable.');
  }
}

/**
 * Normalizes numbers from excel values, handling "-", percentages, and empty strings.
 */
export function normalizeExcelNumber(val: unknown): number {
  if (val === null || val === undefined) return 0;
  if (typeof val === 'number') {
    return isNaN(val) ? 0 : Math.max(0, Math.round(val));
  }
  const str = String(val).trim();
  if (str === '' || str === '-' || str === 'N/A' || str === 'n/a') return 0;
  if (str.endsWith('%')) {
    const num = parseFloat(str.replace('%', '').trim());
    return isNaN(num) ? 0 : Math.max(0, Math.round(num));
  }
  const cleaned = str.replace(/,/g, '');
  const parsed = parseFloat(cleaned);
  return isNaN(parsed) ? 0 : Math.max(0, Math.round(parsed));
}

/**
 * Normalizes text cells by trimming whitespace.
 */
export function normalizeExcelText(val: unknown): string {
  if (val === null || val === undefined) return '';
  return String(val).trim();
}

/**
 * Normalizes header string, mapping full-width ASCII characters (e.g. '（', '）', '＃') to half-width,
 * lowercasing, and stripping non-alphanumeric/non-symbol characters for reliable comparison.
 */
export function normalizeHeaderString(h: string): string {
  return h
    .replace(/[\uFF01-\uFF5E]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xfee0)) // full-width ASCII/punctuation to half-width
    .replace(/[\u3000]/g, ' ') // full-width space to half-width space
    .toLowerCase()
    .replace(/[^a-z0-9#%]/g, '');
}

/**
 * Resolves header aliases for FMS Delivery V3.0 Fleet Overview.
 */
export function findColumnKey(headers: string[], aliases: string[]): string | null {
  const normalizedHeaders = headers.map(normalizeHeaderString);
  for (const alias of aliases) {
    const target = normalizeHeaderString(alias);
    const idx = normalizedHeaders.indexOf(target);
    if (idx !== -1) {
      return headers[idx];
    }
  }
  return null;
}

/**
 * Strictly parses combined FMS Driver Name format: "[<driver-id>] <display-name>"
 * Example: "[410740] Shamera Habibun Asali" -> { driverId: "410740", driverName: "Shamera Habibun Asali" }
 */
export function parseCombinedDriverIdentity(raw: string): { driverId: string; driverName: string } | null {
  if (!raw) return null;
  const trimmed = String(raw).trim();
  const match = trimmed.match(/^\[\s*([^\]]+?)\s*\]\s+(.+)$/);
  if (!match) return null;
  const driverId = match[1].trim();
  const driverName = match[2].trim();
  if (!driverId || !driverName) return null;
  return { driverId, driverName };
}

/**
 * Parses timestamp string from FMS, extracting ISO timestamp in Asia/Manila.
 */
export function parseFmsTimestamp(val: unknown): { iso: string | null; raw: string | null; datePart: string | null } {
  if (!val) return { iso: null, raw: null, datePart: null };
  const raw = String(val).trim();
  if (raw === '' || raw === '-' || raw === 'N/A') return { iso: null, raw: null, datePart: null };

  // Common FMS patterns: YYYY-MM-DD HH:mm:ss, YYYY/MM/DD HH:mm:ss, DD/MM/YYYY HH:mm:ss
  const isoMatch = raw.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})(?:[ T](\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?/);
  if (isoMatch) {
    const year = isoMatch[1];
    const month = isoMatch[2].padStart(2, '0');
    const day = isoMatch[3].padStart(2, '0');
    const datePart = `${year}-${month}-${day}`;
    const hours = (isoMatch[4] || '00').padStart(2, '0');
    const mins = (isoMatch[5] || '00').padStart(2, '0');
    const secs = (isoMatch[6] || '00').padStart(2, '0');
    // Asia/Manila is UTC+8:00
    const iso = `${datePart}T${hours}:${mins}:${secs}+08:00`;
    return { iso, raw, datePart };
  }

  // Handle excel numeric dates if passed
  if (typeof val === 'number') {
    try {
      const parsedDate = XLSX.SSF.parse_date_code(val);
      if (parsedDate) {
        const y = String(parsedDate.y);
        const m = String(parsedDate.m).padStart(2, '0');
        const d = String(parsedDate.d).padStart(2, '0');
        const datePart = `${y}-${m}-${d}`;
        const H = String(parsedDate.H || 0).padStart(2, '0');
        const M = String(parsedDate.M || 0).padStart(2, '0');
        const S = String(parsedDate.S || 0).padStart(2, '0');
        const iso = `${datePart}T${H}:${M}:${S}+08:00`;
        return { iso, raw: `${datePart} ${H}:${M}:${S}`, datePart };
      }
    } catch {
      // ignore
    }
  }

  return { iso: null, raw, datePart: null };
}

/**
 * Main parser function for SPX / MKB FMS Delivery V3.0 Fleet Overview XLSX.
 */
export async function parseFmsFleetOverviewXlsx(
  buffer: ArrayBuffer,
  options?: { expectedBusinessDate?: string }
): Promise<FmsParseResult> {
  const sha256 = await computeArrayBufferSha256(buffer);

  const workbook = XLSX.read(buffer, { type: 'array', cellDates: false });
  if (!workbook.SheetNames || workbook.SheetNames.length === 0) {
    throw new Error('Unsupported FMS export format: Workbook contains no sheets.');
  }

  const firstSheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[firstSheetName];
  if (!worksheet) {
    throw new Error('Unsupported FMS export format: First sheet is empty.');
  }

  const rawJson = XLSX.utils.sheet_to_json<Record<string, unknown>>(worksheet, { defval: '' });
  if (rawJson.length === 0) {
    throw new Error('Unsupported FMS export format: Sheet contains no data rows.');
  }

  const headers = Object.keys(rawJson[0]);

  // Identify driver identity columns (Supports combined Form A: 'Driver Name' = '[410740] Name', or separate Form B)
  const driverNameKey = findColumnKey(headers, ['Driver Name', 'Driver', 'DriverName', 'Name']);
  const driverIdKey = findColumnKey(headers, ['Driver / Driver ID', 'Driver ID', 'DriverID', 'Driver Code']);

  const isSeparateIdentity = Boolean(driverIdKey && driverNameKey && driverIdKey !== driverNameKey);
  const isCombinedIdentity = Boolean(!isSeparateIdentity && (driverNameKey || driverIdKey));

  // Identify metrics columns
  const deliveredKey = findColumnKey(headers, ['Delivered (#)', 'Delivered', 'Total Delivered']);
  const assignedKey = findColumnKey(headers, ['Assigned', 'Assigned (#)', 'Total Assigned']);
  const handedOverKey = findColumnKey(headers, ['Handed Over', 'Handed Over (#)', 'HandedOver']);
  const failedKey = findColumnKey(headers, ['Failed Delivery (#)', 'Failed Delivery', 'Failed (#)', 'Failed']);

  const missingHeaders: string[] = [];
  if (!isSeparateIdentity && !isCombinedIdentity) {
    missingHeaders.push('Driver Name');
  }
  if (!deliveredKey) missingHeaders.push('Delivered (#)');
  if (!assignedKey) missingHeaders.push('Assigned');
  if (!handedOverKey) missingHeaders.push('Handed Over');
  if (!failedKey) missingHeaders.push('Failed Delivery (#)');

  if (missingHeaders.length > 0) {
    throw new Error(`Unsupported FMS export format. Missing required columns: ${missingHeaders.join(', ')}`);
  }

  // Optional columns
  const contractTypeKey = findColumnKey(headers, ['Contract Type', 'ContractType']);
  const vehicleTypeKey = findColumnKey(headers, ['Vehicle Type', 'VehicleType']);
  const zoneIdKey = findColumnKey(headers, ['Zone ID', 'ZoneID', 'Zone']);
  const assignedTargetKey = findColumnKey(headers, ['Assigned Target', 'AssignedTarget']);
  const deliveringKey = findColumnKey(headers, ['Delivering (#)', 'Delivering']);
  const stuckKey = findColumnKey(headers, ['Stuck at Delivering', 'Stuck at delivering']);
  const onHoldKey = findColumnKey(headers, ['Onhold', 'On Hold', 'On hold', 'Onhold (#)']);
  const firstDeliveringTimeKey = findColumnKey(headers, ['First Delivering Time', 'First delivering time', 'First Delivery Time']);
  const timeSinceLastDeliveryKey = findColumnKey(headers, ['Time Since Last Delivery', 'Time since last delivery']);

  const rows: FmsParsedRow[] = [];
  const seenDriverIds = new Set<string>();
  const warnings: string[] = [];

  for (let i = 0; i < rawJson.length; i++) {
    const raw = rawJson[i];
    let rawDriverId = '';
    let rawDriverName = '';

    if (isSeparateIdentity) {
      rawDriverId = normalizeExcelText(raw[driverIdKey!]);
      rawDriverName = normalizeExcelText(raw[driverNameKey!]);
      if (!rawDriverId && !rawDriverName) {
        continue; // Skip blank separator/footer rows
      }
      if (!rawDriverId || !rawDriverName) {
        throw new Error(
          `Row ${i + 2}: Malformed driver identity. Driver ID and Driver Name must both be non-empty.`
        );
      }
    } else {
      const combinedKey = (driverNameKey || driverIdKey)!;
      const rawVal = normalizeExcelText(raw[combinedKey]);
      if (!rawVal) {
        continue; // Skip blank separator/footer rows
      }
      const parsed = parseCombinedDriverIdentity(rawVal);
      if (!parsed) {
        throw new Error(
          `Row ${i + 2}: Malformed Driver Name '${rawVal}'. Expected format: '[<driver-id>] <display-name>' (e.g. '[410740] Shamera Habibun Asali').`
        );
      }
      rawDriverId = parsed.driverId;
      rawDriverName = parsed.driverName;
    }

    if (seenDriverIds.has(rawDriverId)) {
      warnings.push(`Duplicate Driver ID '${rawDriverId}' found on row ${i + 2}. Only the first occurrence was retained.`);
      continue;
    }
    seenDriverIds.add(rawDriverId);

    const timeResult = firstDeliveringTimeKey
      ? parseFmsTimestamp(raw[firstDeliveringTimeKey])
      : { iso: null, raw: null, datePart: null };

    if (options?.expectedBusinessDate && timeResult.datePart && timeResult.datePart !== options.expectedBusinessDate) {
      warnings.push(
        `Driver ${rawDriverId} (${rawDriverName}) has First Delivering Time date (${timeResult.datePart}) differing from selected business date (${options.expectedBusinessDate}).`
      );
    }

    const row: FmsParsedRow = {
      external_driver_id: rawDriverId,
      external_driver_name: rawDriverName,
      contract_type: contractTypeKey ? normalizeExcelText(raw[contractTypeKey]) || undefined : undefined,
      vehicle_type: vehicleTypeKey ? normalizeExcelText(raw[vehicleTypeKey]) || undefined : undefined,
      zone_id: zoneIdKey ? normalizeExcelText(raw[zoneIdKey]) || undefined : undefined,
      assigned: normalizeExcelNumber(raw[assignedKey!]),
      assigned_target: assignedTargetKey ? normalizeExcelNumber(raw[assignedTargetKey]) : 0,
      handed_over: normalizeExcelNumber(raw[handedOverKey!]),
      delivered: normalizeExcelNumber(raw[deliveredKey!]),
      delivering: deliveringKey ? normalizeExcelNumber(raw[deliveringKey]) : 0,
      failed_delivery: normalizeExcelNumber(raw[failedKey!]),
      stuck_at_delivering: stuckKey ? normalizeExcelNumber(raw[stuckKey]) : 0,
      on_hold: onHoldKey ? normalizeExcelNumber(raw[onHoldKey]) : 0,
      first_delivering_time: timeResult.iso,
      first_delivering_time_raw: timeResult.raw,
      time_since_last_delivery: timeSinceLastDeliveryKey ? normalizeExcelText(raw[timeSinceLastDeliveryKey]) || null : null,
    };

    rows.push(row);
  }

  if (rows.length === 0) {
    throw new Error('Unsupported FMS export format: No valid driver rows found in sheet.');
  }

  return {
    sha256,
    rows,
    rowCount: rows.length,
    warnings,
    parserVersion: 'fms_delivery_v3.0',
  };
}
