/**
 * Storage keys and display names are two different things, and conflating them
 * broke uploads for exactly the material this archive exists to hold.
 *
 * Supabase Storage rejects an object key containing anything outside a narrow
 * ASCII set, so `הורדה.jpg` fails with `Invalid key`. The fix is not to allow
 * less information through — it is to keep the key ASCII and keep the real
 * filename where it belongs, in `item_files.file_name`, in its original script.
 */

/**
 * An object key Supabase will accept.
 *
 * Latin text with accents is folded (café -> cafe). Scripts with no ASCII
 * decomposition — Hebrew, Devanagari, Malayalam — collapse to a placeholder,
 * which loses nothing: the key is never shown to anyone, the uuid in front of
 * it guarantees uniqueness, and the original name is stored separately.
 */
export function storageSafeName(name: string): string {
  const trimmed = name.trim().slice(-120);

  const match = /\.([A-Za-z0-9]{1,10})$/.exec(trimmed);
  const extension = match ? match[1].toLowerCase() : '';
  const stem = match ? trimmed.slice(0, -(extension.length + 1)) : trimmed;

  const ascii = stem
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Za-z0-9._-]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^[-.]+|[-.]+$/g, '');

  const safeStem = ascii || 'file';
  return extension ? `${safeStem}.${extension}` : safeStem;
}

/** True when a key is one Supabase Storage will accept. */
export function isValidStorageKey(key: string): boolean {
  return /^[A-Za-z0-9!\-_.*'()/ ]+$/.test(key);
}

/** uploads/2026/08/<uuid>-<name> — date-partitioned so the bucket stays browsable. */
export function buildStoragePath(fileName: string, now = new Date()): string {
  const year = now.getUTCFullYear();
  const month = String(now.getUTCMonth() + 1).padStart(2, '0');
  return `uploads/${year}/${month}/${crypto.randomUUID()}-${storageSafeName(fileName)}`;
}
