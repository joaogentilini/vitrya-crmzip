import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

const BUCKET = "property-media";
const DEFAULT_TTL_SECONDS = 60 * 30;

function isHttpUrl(value: string) {
  return /^https?:\/\//i.test(value);
}

function normalizePath(value: string | null | undefined) {
  return String(value || "").trim();
}

function sanitizeStoragePath(value: string): string {
  let path = decodeURIComponent(normalizePath(value));
  path = path.replace(/^\/+/, "");
  if (path.startsWith(`${BUCKET}/`)) {
    path = path.slice(BUCKET.length + 1);
  }
  return path;
}

function extractStoragePathFromHttpUrl(value: string): string | null {
  try {
    const url = new URL(value);
    const pathname = decodeURIComponent(url.pathname).replace(/^\/+/, "");

    const prefixes = [
      `storage/v1/object/public/${BUCKET}/`,
      `storage/v1/object/sign/${BUCKET}/`,
      `storage/v1/object/authenticated/${BUCKET}/`,
      `object/public/${BUCKET}/`,
      `object/sign/${BUCKET}/`,
      `object/authenticated/${BUCKET}/`,
      `${BUCKET}/`,
    ];

    for (const prefix of prefixes) {
      const index = pathname.indexOf(prefix);
      if (index === -1) continue;
      const sliced = pathname.slice(index + prefix.length);
      const cleaned = sanitizeStoragePath(sliced);
      if (cleaned) return cleaned;
    }

    return null;
  } catch {
    return null;
  }
}

export async function getSignedImageUrl(pathOrUrl: string | null) {
  const raw = normalizePath(pathOrUrl);
  if (!raw) return null;

  const storagePath = isHttpUrl(raw) ? extractStoragePathFromHttpUrl(raw) : sanitizeStoragePath(raw);

  if (isHttpUrl(raw) && !storagePath) {
    // External URL (not from our storage)
    return raw;
  }

  if (!storagePath) return null;

  const supabase = createAdminClient();
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(storagePath, DEFAULT_TTL_SECONDS);

  if (error) return null;
  return data?.signedUrl ?? null;
}

export async function getSignedImageUrlMap(
  pathsOrUrls: Array<string | null | undefined>,
  ttlSeconds = DEFAULT_TTL_SECONDS
) {
  const output = new Map<string, string>();
  if (!Array.isArray(pathsOrUrls) || pathsOrUrls.length === 0) {
    return output;
  }

  const storagePaths: string[] = [];
  const seenStoragePaths = new Set<string>();
  const originalKeysByStoragePath = new Map<string, string[]>();

  for (const item of pathsOrUrls) {
    const raw = normalizePath(item);
    if (!raw) continue;

    if (isHttpUrl(raw)) {
      const extractedStoragePath = extractStoragePathFromHttpUrl(raw);
      if (!extractedStoragePath) {
        output.set(raw, raw);
        continue;
      }

      const keys = originalKeysByStoragePath.get(extractedStoragePath) || [];
      keys.push(raw);
      originalKeysByStoragePath.set(extractedStoragePath, keys);

      if (!seenStoragePaths.has(extractedStoragePath)) {
        seenStoragePaths.add(extractedStoragePath);
        storagePaths.push(extractedStoragePath);
      }
      continue;
    }

    const storagePath = sanitizeStoragePath(raw);
    if (!storagePath) continue;

    const keys = originalKeysByStoragePath.get(storagePath) || [];
    keys.push(raw);
    originalKeysByStoragePath.set(storagePath, keys);

    if (!seenStoragePaths.has(storagePath)) {
      seenStoragePaths.add(storagePath);
      storagePaths.push(storagePath);
    }
  }

  if (storagePaths.length === 0) return output;

  const supabase = createAdminClient();
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrls(storagePaths, ttlSeconds);

  if (error) {
    return output;
  }

  for (const row of data || []) {
    const storagePath = sanitizeStoragePath((row as any)?.path);
    const signedUrl = normalizePath((row as any)?.signedUrl);
    if (!storagePath || !signedUrl) continue;

    output.set(storagePath, signedUrl);

    const originalKeys = originalKeysByStoragePath.get(storagePath) || [];
    for (const originalKey of originalKeys) {
      output.set(originalKey, signedUrl);
    }
  }

  return output;
}
