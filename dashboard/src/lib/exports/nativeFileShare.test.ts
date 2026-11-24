// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  isNativePlatform: vi.fn(),
  writeFile: vi.fn(),
  share: vi.fn(),
}));

vi.mock('@capacitor/core', () => ({
  Capacitor: {
    isNativePlatform: mocks.isNativePlatform,
  },
}));

vi.mock('@capacitor/filesystem', () => ({
  Directory: { Cache: 'CACHE' },
  Filesystem: { writeFile: mocks.writeFile },
}));

vi.mock('@capacitor/share', () => ({
  Share: { share: mocks.share },
}));

import { saveAndShareNativeBlob } from './nativeFileShare';

describe('nativeFileShare', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns false without touching Filesystem on web', async () => {
    mocks.isNativePlatform.mockReturnValue(false);
    const res = await saveAndShareNativeBlob(new Blob(['pdf'], { type: 'application/pdf' }), 'payslip.pdf');
    expect(res).toBe(false);
    expect(mocks.writeFile).not.toHaveBeenCalled();
  });

  it('writes base64 file to Cache directory and opens native share sheet on Android/iOS', async () => {
    mocks.isNativePlatform.mockReturnValue(true);
    mocks.writeFile.mockResolvedValue({ uri: 'file:///cache/exports/payslip_MKB-1.pdf' });
    mocks.share.mockResolvedValue({});

    const res = await saveAndShareNativeBlob(
      new Blob(['%PDF-1.4'], { type: 'application/pdf' }),
      'payslip MKB-1.pdf',
    );

    expect(res).toBe(true);
    expect(mocks.writeFile).toHaveBeenCalledWith(
      expect.objectContaining({
        path: 'exports/payslip_MKB-1.pdf',
        directory: 'CACHE',
        recursive: true,
      }),
    );
    expect(mocks.share).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'payslip_MKB-1.pdf',
        url: 'file:///cache/exports/payslip_MKB-1.pdf',
      }),
    );
  });
});
