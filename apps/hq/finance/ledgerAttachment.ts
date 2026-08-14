// Ledger receipt attachments.
//
// Attachments used to be stored as a signed URL with a 90-day life, so a
// receipt filed today became an unopenable link about three months later —
// silently, long after anyone was looking. BIR record-keeping needs these
// readable for years.
//
// What is stored now is the object's path inside the receipts bucket. A fresh
// signed URL is minted at the moment someone clicks, and only has to live long
// enough to open a tab.
//
// Rows written before this change still hold a full signed URL. Rather than
// migrate them, `storagePathFromAttachment` reads the path back out of the old
// URL — which repairs the already-expired ones too, since the file itself was
// never lost, only the way we reached it.
import { sb } from '@shared/core/supabase.ts';

export const RECEIPTS_BUCKET = 'receipts';

// Long enough to open a tab, short enough that a copied link is not a leak.
export const SIGNED_URL_TTL_SECONDS = 300;

// Markers that precede "<bucket>/<path>" in a Supabase storage URL.
const URL_MARKERS = ['/object/sign/', '/object/public/', '/object/authenticated/'];

// Pure: the object's path inside the bucket, given whatever the row holds —
// either a bare path (written since this change) or a full signed URL (written
// before it). Returns null when the value is empty or unrecognisable.
export function storagePathFromAttachment(stored: string | null | undefined): string | null {
  const value = (stored ?? '').trim();
  if (!value) return null;

  if (!/^https?:\/\//i.test(value)) {
    // Already a path. Tolerate a stray leading slash or bucket prefix.
    const path = value.replace(/^\/+/, '');
    return stripBucket(path) || null;
  }

  const marker = URL_MARKERS.find(m => value.includes(m));
  if (!marker) return null;

  const afterMarker = value.slice(value.indexOf(marker) + marker.length);
  const withoutQuery = afterMarker.split('?')[0];
  if (!withoutQuery) return null;

  let decoded: string;
  try {
    decoded = decodeURIComponent(withoutQuery);
  } catch {
    decoded = withoutQuery;
  }
  return stripBucket(decoded) || null;
}

// Drop a leading "receipts/" — the bucket is addressed separately by
// `.from(RECEIPTS_BUCKET)`, so it must not appear in the path as well. Only the
// first segment is removed, in case a folder shares the bucket's name.
function stripBucket(path: string): string {
  const prefix = `${RECEIPTS_BUCKET}/`;
  return path.startsWith(prefix) ? path.slice(prefix.length) : path;
}

// Mint a short-lived URL for an attachment. Returns null when the value cannot
// be resolved to a path or the file is no longer in the bucket.
export async function signAttachment(stored: string | null | undefined): Promise<string | null> {
  const path = storagePathFromAttachment(stored);
  if (!path) return null;
  try {
    const { data, error } = await sb.storage
      .from(RECEIPTS_BUCKET)
      .createSignedUrl(path, SIGNED_URL_TTL_SECONDS);
    if (error) {
      console.error('signAttachment failed:', error);
      return null;
    }
    return data?.signedUrl ?? null;
  } catch (error) {
    console.error('signAttachment threw:', error);
    return null;
  }
}
