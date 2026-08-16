import JSZip from 'jszip';
import { createOfficialPayslipXLSXBlob } from './officialPayslipTemplateAdapter';
import { createParcelPayslipPdf, validatePayslipDocumentForExport, type PayslipDocumentData } from './payrollExport';
import { buildExportFilename, downloadBlob } from './exportUtils';

export type PayslipPackageFormat = 'pdf' | 'xlsx';

export interface PayslipPackageOptions {
  format: PayslipPackageFormat;
  from: string;
  to: string;
  onProgress?: (message: string) => void;
  forceArchive?: boolean;
}

export interface PayslipPackageResult {
  blob: Blob;
  filename: string;
  archive: boolean;
  generatedCount: number;
  failures: Array<{ riderName: string; message: string }>;
}

function payslipFilename(document: PayslipDocumentData, format: PayslipPackageFormat): string {
  return buildExportFilename({
    prefix: 'payslip',
    identifier: document.rider.mkbId,
    from: document.cutoff.from,
    to: document.cutoff.to,
    extension: format,
  });
}

async function createPayslipBlob(document: PayslipDocumentData, format: PayslipPackageFormat): Promise<Blob> {
  validatePayslipDocumentForExport(document);
  if (format === 'xlsx') return createOfficialPayslipXLSXBlob(document);
  return createParcelPayslipPdf(document).output('blob');
}

export async function createPayslipPackage(
  documents: PayslipDocumentData[],
  options: PayslipPackageOptions,
): Promise<PayslipPackageResult> {
  if (documents.length === 0) throw new Error('No payslips are available to export.');

  const generated: Array<{ filename: string; blob: Blob }> = [];
  const failures: PayslipPackageResult['failures'] = [];
  for (let index = 0; index < documents.length; index += 1) {
    const document = documents[index];
    options.onProgress?.(`Generating ${index + 1} of ${documents.length} payslips…`);
    try {
      generated.push({
        filename: payslipFilename(document, options.format),
        blob: await createPayslipBlob(document, options.format),
      });
    } catch (error) {
      failures.push({
        riderName: document.rider.name,
        message: error instanceof Error ? error.message : 'Payslip generation failed.',
      });
    }
  }

  if (generated.length === 0) {
    const details = failures.map(failure => `${failure.riderName}: ${failure.message}`).join('; ');
    throw new Error(`No payslips could be generated.${details ? ` ${details}` : ''}`);
  }

  if (documents.length === 1 && !options.forceArchive) {
    return {
      blob: generated[0].blob,
      filename: generated[0].filename,
      archive: false,
      generatedCount: 1,
      failures,
    };
  }

  options.onProgress?.('Creating ZIP package…');
  const zip = new JSZip();
  for (const file of generated) {
    zip.file(file.filename, new Uint8Array(await file.blob.arrayBuffer()));
  }
  const blob = await zip.generateAsync({ type: 'blob', mimeType: 'application/zip' });
  return {
    blob,
    filename: buildExportFilename({ prefix: 'payslips', from: options.from, to: options.to, extension: 'zip' }),
    archive: true,
    generatedCount: generated.length,
    failures,
  };
}

export async function downloadPayslipPackage(
  documents: PayslipDocumentData[],
  options: PayslipPackageOptions,
): Promise<PayslipPackageResult> {
  const result = await createPayslipPackage(documents, options);
  downloadBlob(result.blob, result.filename);
  return result;
}
