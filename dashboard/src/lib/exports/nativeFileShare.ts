import { Capacitor } from '@capacitor/core';
import { Directory, Filesystem } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Failed to read file blob for native export.'));
    reader.onloadend = () => {
      const result = typeof reader.result === 'string' ? reader.result : '';
      const commaIdx = result.indexOf(',');
      resolve(commaIdx >= 0 ? result.slice(commaIdx + 1) : result);
    };
    reader.readAsDataURL(blob);
  });
}

/**
 * Writes an exported document Blob into Capacitor Cache storage and opens
 * the native Android/iOS Share/Save sheet so riders can save or share Payslip PDFs.
 */
export async function saveAndShareNativeBlob(blob: Blob, filename: string): Promise<boolean> {
  if (typeof Capacitor === 'undefined' || !Capacitor.isNativePlatform()) {
    return false;
  }

  try {
    const base64Data = await blobToBase64(blob);
    const safeName = filename.replace(/[^a-zA-Z0-9._-]/g, '_');
    const writeResult = await Filesystem.writeFile({
      path: `exports/${safeName}`,
      data: base64Data,
      directory: Directory.Cache,
      recursive: true,
    });

    await Share.share({
      title: safeName,
      text: `MKB RiderTrack Document: ${safeName}`,
      url: writeResult.uri,
      dialogTitle: 'Save or Share Document',
    });
    return true;
  } catch (err) {
    console.warn('[NativeFileShare] Failed to save/share native document:', err);
    return false;
  }
}
