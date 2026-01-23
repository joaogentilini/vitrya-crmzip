// lib/media/getPublicImageUrl.ts
import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

const BUCKET = "property-media"; // <- confirme o nome do bucket

export async function getSignedImageUrl(pathOrUrl: string | null) {
  if (!pathOrUrl) return null;

  // Já é URL completa
  if (pathOrUrl.startsWith("http://") || pathOrUrl.startsWith("https://")) {
    return pathOrUrl;
  }

  // É path do storage (ex: properties/<propertyId>/arquivo.jpg)
  const supabase = createAdminClient();
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(pathOrUrl, 60 * 30); // 30 minutos

  if (error) return null;
  return data?.signedUrl ?? null;
}
