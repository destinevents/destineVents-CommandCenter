import { describe, it, expect } from 'vitest';
import { storagePathFromAttachment } from './receiptAttachment.ts';

describe('storagePathFromAttachment', () => {
  it('returns null for empty values', () => {
    expect(storagePathFromAttachment(null)).toBe(null);
    expect(storagePathFromAttachment(undefined)).toBe(null);
    expect(storagePathFromAttachment('')).toBe(null);
    expect(storagePathFromAttachment('   ')).toBe(null);
  });

  it('passes a bare path straight through', () => {
    expect(storagePathFromAttachment('ledger/abc-123.jpg')).toBe('ledger/abc-123.jpg');
  });

  it('tolerates a leading slash', () => {
    expect(storagePathFromAttachment('/ledger/abc-123.jpg')).toBe('ledger/abc-123.jpg');
  });

  // Payables writes its files to a folder that is itself called "receipts",
  // inside the receipts bucket. A stored path is already bucket-relative, so
  // stripping that prefix here would point at a different object entirely.
  it('leaves a bare path alone, including Payables own receipts/ folder', () => {
    expect(storagePathFromAttachment('receipts/abc.pdf')).toBe('receipts/abc.pdf');
  });

  // The whole point of the fix: receipts filed before this change still open.
  it('recovers the path from a legacy signed URL', () => {
    const url = 'https://xyz.supabase.co/storage/v1/object/sign/receipts/ledger/9f8e-77.jpg?token=eyJhbGciOi.J9';
    expect(storagePathFromAttachment(url)).toBe('ledger/9f8e-77.jpg');
  });

  it('recovers the path from an expired signed URL just the same', () => {
    const url = 'https://xyz.supabase.co/storage/v1/object/sign/receipts/ledger/old.png?token=expired&exp=1';
    expect(storagePathFromAttachment(url)).toBe('ledger/old.png');
  });

  it('handles public and authenticated URL shapes', () => {
    expect(storagePathFromAttachment('https://x.supabase.co/storage/v1/object/public/receipts/ledger/p.pdf'))
      .toBe('ledger/p.pdf');
    expect(storagePathFromAttachment('https://x.supabase.co/storage/v1/object/authenticated/receipts/ledger/a.pdf'))
      .toBe('ledger/a.pdf');
  });

  it('decodes percent-encoded filenames', () => {
    const url = 'https://x.supabase.co/storage/v1/object/sign/receipts/ledger/OR%20receipt%201.pdf?token=t';
    expect(storagePathFromAttachment(url)).toBe('ledger/OR receipt 1.pdf');
  });

  // A Payables receipt as it was stored before this change: the bucket appears
  // once because the URL carries it, and once because the folder is named that.
  it('recovers a Payables path from its legacy URL, keeping the folder', () => {
    const url = 'https://x.supabase.co/storage/v1/object/sign/receipts/receipts/9a-1.pdf?token=t';
    expect(storagePathFromAttachment(url)).toBe('receipts/9a-1.pdf');
  });

  it('returns null for a URL that is not a storage object', () => {
    expect(storagePathFromAttachment('https://example.com/some/other/file.pdf')).toBe(null);
  });

  it('returns null when the marker is present but the path is empty', () => {
    expect(storagePathFromAttachment('https://x.supabase.co/storage/v1/object/sign/?token=t')).toBe(null);
  });

  describe('traversal segments are refused', () => {
    it('rejects a bare path that climbs out', () => {
      expect(storagePathFromAttachment('ledger/../../secret.pdf')).toBe(null);
    });

    it('rejects a URL that climbs out', () => {
      expect(storagePathFromAttachment('https://x.supabase.co/storage/v1/object/sign/receipts/../private/x.pdf?token=t'))
        .toBe(null);
    });

    it('rejects a percent-encoded climb, which decoding would otherwise reveal', () => {
      expect(storagePathFromAttachment('https://x.supabase.co/storage/v1/object/sign/receipts/%2e%2e%2fx.pdf?token=t'))
        .toBe(null);
    });

    it('still allows dots inside a filename', () => {
      expect(storagePathFromAttachment('ledger/receipt..final.pdf')).toBe('ledger/receipt..final.pdf');
    });
  });
});
