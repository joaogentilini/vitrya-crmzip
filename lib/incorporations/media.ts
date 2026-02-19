import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

const BUCKET = "incorporation-media";

function isHttpUrl(value: string): boolean {
  return /^https?:\/\//i.test(value);
}

export async function getSignedIncorporationMediaUrl(
  pathOrUrl: string | null | undefined,
  ttlSeconds = 60 * 30
): Promise<string | null> {
  const raw = String(pathOrUrl || "").trim();
  if (!raw) return null;
  if (isHttpUrl(raw)) return raw;

  const admin = createAdminClient();
  const { data, error } = await admin.storage.from(BUCKET).createSignedUrl(raw, ttlSeconds);
  if (error) return null;
  return data?.signedUrl ?? null;
}

export async function getSignedIncorporationMediaUrlList(
  paths: Array<string | null | undefined>,
  ttlSeconds = 60 * 30
): Promise<string[]> {
  if (!Array.isArray(paths) || paths.length === 0) return [];
  const signed = await Promise.all(paths.map((path) => getSignedIncorporationMediaUrl(path, ttlSeconds)));
  return signed.filter((item): item is string => !!item);
}
