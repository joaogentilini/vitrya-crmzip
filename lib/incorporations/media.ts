import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

const BUCKET = "incorporation-media";

function isHttpUrl(value: string): boolean {
  return /^https?:\/\//i.test(value);
}

function normalizePath(value: string | null | undefined): string {
  return String(value || "").trim();
}

export async function getSignedIncorporationMediaUrl(
  pathOrUrl: string | null | undefined,
  ttlSeconds = 60 * 30
): Promise<string | null> {
  const raw = normalizePath(pathOrUrl);
  if (!raw) return null;
  if (isHttpUrl(raw)) return raw;

  const admin = createAdminClient();
  const { data, error } = await admin.storage.from(BUCKET).createSignedUrl(raw, ttlSeconds);
  if (error) return null;
  return data?.signedUrl ?? null;
}

export async function getSignedIncorporationMediaUrlMap(
  pathsOrUrls: Array<string | null | undefined>,
  ttlSeconds = 60 * 30
) {
  const output = new Map<string, string>();
  if (!Array.isArray(pathsOrUrls) || pathsOrUrls.length === 0) return output;

  const storagePaths: string[] = [];
  const seen = new Set<string>();

  for (const value of pathsOrUrls) {
    const raw = normalizePath(value);
    if (!raw) continue;

    if (isHttpUrl(raw)) {
      output.set(raw, raw);
      continue;
    }

    if (!seen.has(raw)) {
      seen.add(raw);
      storagePaths.push(raw);
    }
  }

  if (storagePaths.length === 0) return output;

  const admin = createAdminClient();
  const { data, error } = await admin.storage
    .from(BUCKET)
    .createSignedUrls(storagePaths, ttlSeconds);

  if (error) return output;

  for (const row of data || []) {
    const path = normalizePath((row as any)?.path);
    const signedUrl = normalizePath((row as any)?.signedUrl);
    if (!path || !signedUrl) continue;
    output.set(path, signedUrl);
  }

  return output;
}

export async function getSignedIncorporationMediaUrlList(
  paths: Array<string | null | undefined>,
  ttlSeconds = 60 * 30
): Promise<string[]> {
  if (!Array.isArray(paths) || paths.length === 0) return [];
  const signed = await Promise.all(paths.map((path) => getSignedIncorporationMediaUrl(path, ttlSeconds)));
  return signed.filter((item): item is string => !!item);
}
