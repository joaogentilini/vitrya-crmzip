// lib/media/getPublicImageUrl.ts
import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

const BUCKET = "property-media"; // <- confirme o nome do bucket
const DEFAULT_TTL_SECONDS = 60 * 30;

function isHttpUrl(value: string) {
  return /^https?:\/\//i.test(value);
}

function normalizePath(value: string | null | undefined) {
  return String(value || "").trim();
}

export async function getSignedImageUrl(pathOrUrl: string | null) {
  const raw = normalizePath(pathOrUrl);
  if (!raw) return null;

  // Já é URL completa
  if (isHttpUrl(raw)) {
    return raw;
  }

  // É path do storage (ex: properties/<propertyId>/arquivo.jpg)
  const supabase = createAdminClient();
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(raw, DEFAULT_TTL_SECONDS);

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
  const seen = new Set<string>();

  for (const item of pathsOrUrls) {
    const raw = normalizePath(item);
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

  const supabase = createAdminClient();
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrls(storagePaths, ttlSeconds);

  if (error) {
    return output;
  }

  for (const row of data || []) {
    const path = normalizePath((row as any)?.path);
    const signedUrl = normalizePath((row as any)?.signedUrl);
    if (!path || !signedUrl) continue;
    output.set(path, signedUrl);
  }

  return output;
}
