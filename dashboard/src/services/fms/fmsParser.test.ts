import { describe, it, expect } from 'vitest';
import * as XLSX from 'xlsx';
import {
  parseFmsFleetOverviewXlsx,
  computeArrayBufferSha256,
  normalizeExcelNumber,
  parseFmsTimestamp,
  parseCombinedDriverIdentity,
  normalizeHeaderString,
} from './fmsParser';

function createSyntheticWorkbook(data: Array<Record<string, unknown>>): ArrayBuffer {
  const ws = XLSX.utils.json_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Fleet Overview');
  const buffer = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
  return buffer;
}

describe('fmsParser', () => {
  it('computes SHA-256 fingerprint deterministically', async () => {
    const text = 'test content for sha256';
    const buffer = new TextEncoder().encode(text).buffer;
    const sha = await computeArrayBufferSha256(buffer);
    expect(sha).toHaveLength(64);
    expect(typeof sha).toBe('string');
  });

  it('normalizes numbers handling "-", percentages, and empty values', () => {
    expect(normalizeExcelNumber(null)).toBe(0);
    expect(normalizeExcelNumber(undefined)).toBe(0);
    expect(normalizeExcelNumber('')).toBe(0);
    expect(normalizeExcelNumber('-')).toBe(0);
    expect(normalizeExcelNumber('N/A')).toBe(0);
    expect(normalizeExcelNumber('42')).toBe(42);
    expect(normalizeExcelNumber(42)).toBe(42);
    expect(normalizeExcelNumber('1,250')).toBe(1250);
    expect(normalizeExcelNumber('85%')).toBe(85);
  });

  it('normalizes headers mapping full-width ASCII parentheses and characters', () => {
    expect(normalizeHeaderString('Delivered（#）')).toBe('delivered#');
    expect(normalizeHeaderString('Delivered (#)')).toBe('delivered#');
    expect(normalizeHeaderString('Failed Delivery（#）')).toBe('faileddelivery#');
    expect(normalizeHeaderString('Failed Delivery (#)')).toBe('faileddelivery#');
    expect(normalizeHeaderString('Delivered（%）')).toBe('delivered%');
    expect(normalizeHeaderString('Delivering（#）')).toBe('delivering#');
    expect(normalizeHeaderString('Driver Name')).toBe('drivername');
  });

  it('strictly parses combined driver identity in format [<id>] <name>', () => {
    expect(parseCombinedDriverIdentity('[410740] Shamera Habibun Asali')).toEqual({
      driverId: '410740',
      driverName: 'Shamera Habibun Asali',
    });
    expect(parseCombinedDriverIdentity('[461820] Faisal Mohhamad Leon')).toEqual({
      driverId: '461820',
      driverName: 'Faisal Mohhamad Leon',
    });
    expect(parseCombinedDriverIdentity('[355765] Mark Sheldon Alconaba Obon')).toEqual({
      driverId: '355765',
      driverName: 'Mark Sheldon Alconaba Obon',
    });
    expect(parseCombinedDriverIdentity('[ 371984 ]  Edemer Malong Jimlan ')).toEqual({
      driverId: '371984',
      driverName: 'Edemer Malong Jimlan',
    });

    // Malformed cases
    expect(parseCombinedDriverIdentity('Shamera Habibun Asali')).toBeNull();
    expect(parseCombinedDriverIdentity('[]')).toBeNull();
    expect(parseCombinedDriverIdentity('[410740]')).toBeNull();
    expect(parseCombinedDriverIdentity('[410740]   ')).toBeNull();
    expect(parseCombinedDriverIdentity('random text')).toBeNull();
    expect(parseCombinedDriverIdentity('')).toBeNull();
  });

  it('parses valid timestamp formats into Asia/Manila ISO string', () => {
    const res = parseFmsTimestamp('2026-09-01 08:30:15');
    expect(res.iso).toBe('2026-09-01T08:30:15+08:00');
    expect(res.datePart).toBe('2026-09-01');
    expect(res.raw).toBe('2026-09-01 08:30:15');
  });

  it('successfully parses actual Delivery V3.0 export with combined Driver Name and full-width headers', async () => {
    const realExportStructure = [
      {
        'Driver Name': '[355765] Mark Sheldon Alconaba Obon',
        'Contract Type': 'Part-Time',
        'Vehicle Type': 'Others',
        'Zone ID': 'C-05-AYALA',
        'Assigned': 79,
        'Assigned Target': 150,
        'Assigned Progress': '<Prob. Target',
        'Delivery Progress': '100.00%',
        'Handed Over': 1,
        'Delivered（#）': 0,
        'Delivered（%）': '0%',
        'Delivering（#）': 0,
        'Delivering（%）': '0%',
        'Failed Delivery（#）': 1,
        'Failed Delivery（%）': '100%',
        'Stuck at Delivering': 0,
        'Onhold': 1,
        'First Delivering Time': '2026-08-30 17:15:08',
        'Time Since Last Delivery': '-',
      },
      {
        'Driver Name': '[410740] Shamera Habibun Asali',
        'Contract Type': 'Regular',
        'Vehicle Type': 'Motorcycle',
        'Zone ID': 'Z-01',
        'Assigned': 100,
        'Assigned Target': 120,
        'Handed Over': 100,
        'Delivered（#）': 86,
        'Delivered（%）': '86%',
        'Delivering（#）': 10,
        'Delivering（%）': '10%',
        'Failed Delivery（#）': 4,
        'Failed Delivery（%）': '4%',
        'Stuck at Delivering': 0,
        'Onhold': 0,
        'First Delivering Time': '2026-08-30 08:30:00',
        'Time Since Last Delivery': '12 mins',
      },
    ];

    const buffer = createSyntheticWorkbook(realExportStructure);
    const result = await parseFmsFleetOverviewXlsx(buffer, { expectedBusinessDate: '2026-08-30' });

    expect(result.rowCount).toBe(2);
    expect(result.rows[0].external_driver_id).toBe('355765');
    expect(result.rows[0].external_driver_name).toBe('Mark Sheldon Alconaba Obon');
    expect(result.rows[0].delivered).toBe(0);
    expect(result.rows[0].failed_delivery).toBe(1);
    expect(result.rows[0].first_delivering_time).toBe('2026-08-30T17:15:08+08:00');

    expect(result.rows[1].external_driver_id).toBe('410740');
    expect(result.rows[1].external_driver_name).toBe('Shamera Habibun Asali');
    expect(result.rows[1].delivered).toBe(86);
    expect(result.rows[1].failed_delivery).toBe(4);
  });

  it('supports backward-compatible separate Driver ID and Driver columns', async () => {
    const separateData = [
      {
        'Driver ID': '410740',
        'Driver Name': 'Shamera Habibun Asali',
        'Contract Type': 'Regular',
        'Vehicle Type': 'Motorcycle',
        'Zone ID': 'Z-01',
        'Assigned': 100,
        'Handed Over': 100,
        'Delivered (#)': 86,
        'Failed Delivery (#)': 4,
      },
    ];

    const buffer = createSyntheticWorkbook(separateData);
    const result = await parseFmsFleetOverviewXlsx(buffer);

    expect(result.rowCount).toBe(1);
    expect(result.rows[0].external_driver_id).toBe('410740');
    expect(result.rows[0].external_driver_name).toBe('Shamera Habibun Asali');
    expect(result.rows[0].delivered).toBe(86);
  });

  it('rejects row with malformed combined Driver Name format', async () => {
    const malformedData = [
      {
        'Driver Name': 'Shamera Habibun Asali without brackets',
        'Handed Over': 100,
        'Delivered (#)': 86,
        'Assigned': 100,
        'Failed Delivery (#)': 4,
      },
    ];

    const buffer = createSyntheticWorkbook(malformedData);
    await expect(parseFmsFleetOverviewXlsx(buffer)).rejects.toThrow(
      /Row 2: Malformed Driver Name 'Shamera Habibun Asali without brackets'/
    );
  });

  it('rejects workbook when required headers are missing', async () => {
    const invalidData = [
      {
        'Random Column': '123',
        'Other Column': '456',
      },
    ];

    const buffer = createSyntheticWorkbook(invalidData);
    await expect(parseFmsFleetOverviewXlsx(buffer)).rejects.toThrow(
      /Unsupported FMS export format. Missing required columns:/
    );
  });

  it('safely ignores extra unknown columns', async () => {
    const dataWithExtraColumns = [
      {
        'Driver Name': '[410740] Shamera Habibun Asali',
        'Handed Over': 100,
        'Delivered (#)': 86,
        'Assigned': 100,
        'Failed Delivery (#)': 4,
        'Extra Unused Column A': 'Ignored Value',
        'Superfluous Metric B': 9999,
      },
    ];

    const buffer = createSyntheticWorkbook(dataWithExtraColumns);
    const result = await parseFmsFleetOverviewXlsx(buffer);
    expect(result.rowCount).toBe(1);
    expect(result.rows[0].delivered).toBe(86);
  });

  it('deduplicates duplicate driver ID rows and reports warning', async () => {
    const duplicateData = [
      {
        'Driver Name': '[410740] Shamera Habibun Asali',
        'Handed Over': 100,
        'Delivered (#)': 86,
        'Assigned': 100,
        'Failed Delivery (#)': 4,
      },
      {
        'Driver Name': '[410740] Shamera Habibun Asali Duplicate',
        'Handed Over': 50,
        'Delivered (#)': 40,
        'Assigned': 50,
        'Failed Delivery (#)': 1,
      },
    ];

    const buffer = createSyntheticWorkbook(duplicateData);
    const result = await parseFmsFleetOverviewXlsx(buffer);
    expect(result.rowCount).toBe(1);
    expect(result.rows[0].delivered).toBe(86);
    expect(result.warnings.some((w) => w.includes("Duplicate Driver ID '410740'"))).toBe(true);
  });

  it('generates a warning if First Delivering Time date does not match expected business date', async () => {
    const dateMismatchData = [
      {
        'Driver Name': '[410740] Shamera Habibun Asali',
        'Handed Over': 100,
        'Delivered (#)': 86,
        'Assigned': 100,
        'Failed Delivery (#)': 4,
        'First Delivering Time': '2026-08-30 08:30:00', // Mismatch from 2026-09-01
      },
    ];

    const buffer = createSyntheticWorkbook(dateMismatchData);
    const result = await parseFmsFleetOverviewXlsx(buffer, { expectedBusinessDate: '2026-09-01' });
    expect(result.rowCount).toBe(1);
    expect(result.warnings.some((w) => w.includes('differing from selected business date'))).toBe(true);
  });
});
