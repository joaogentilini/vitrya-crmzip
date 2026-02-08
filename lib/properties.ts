import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

export interface PropertyWithCover {
  id: string;
  status: string;
  purpose: string;
  title: string;
  city?: string | null;
  neighborhood?: string | null;
  address?: string | null;
  price?: number | null;
  rent_price?: number | null;
  area_m2?: number | null;
  bedrooms?: number | null;
  bathrooms?: number | null;
  created_at: string;

  // ✅ capa (signed URL)
  cover_url?: string;

  // ✅ categoria/classificação
  property_category_id?: string | null;
  property_category_name?: string | null;
}

type CategoryRow = { id: string; name: string };

type PropertyRow = {
  id: string;
  status: string;
  purpose: string;
  title: string;
  city: string | null;
  neighborhood: string | null;
  address: string | null;
  price: number | null;
  rent_price: number | null;
  area_m2: number | null;
  bedrooms: number | null;
  bathrooms: number | null;
  created_at: string;
  property_category_id: string | null;

  // ⚠️ Pode vir como objeto OU array dependendo do relacionamento inferido
  property_categories: CategoryRow | CategoryRow[] | null;
};

type CoverRow = {
  property_id: string;
  url: string; // storage path
};

function getCategoryName(rel: PropertyRow["property_categories"]): string | null {
  if (!rel) return null;
  if (Array.isArray(rel)) return rel[0]?.name ?? null;
  return rel.name ?? null;
}

export async function makeServerSupabaseClient() {
  // ✅ Next 15/16: cookies() pode ser Promise
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => {
              // ✅ TS: ReadonlyRequestCookies não expõe .set
              (cookieStore as any).set(name, value, options);
            });
          } catch {
            // Server Component - ignore
          }
        },
      },
    }
  );
}

async function attachCovers(
  supabase: Awaited<ReturnType<typeof makeServerSupabaseClient>>,
  rows: PropertyRow[]
): Promise<PropertyWithCover[]> {
  if (!rows.length) return [];

  const ids = rows.map((r) => r.id);

  // ✅ 1 query para todas as capas
  const { data: covers, error: coversErr } = await supabase
    .from("property_media")
    .select("property_id, url")
    .in("property_id", ids)
    .eq("kind", "image")
    .eq("position", 1);

  // Se falhar, não quebra a página inteira — só retorna sem capa
  if (coversErr) {
    return rows.map((r) => ({
      id: r.id,
      status: r.status,
      purpose: r.purpose,
      title: r.title,
      city: r.city,
      neighborhood: r.neighborhood,
      address: r.address,
      price: r.price,
      rent_price: r.rent_price,
      area_m2: r.area_m2,
      bedrooms: r.bedrooms,
      bathrooms: r.bathrooms,
      created_at: r.created_at,
      cover_url: undefined,
      property_category_id: r.property_category_id,
      property_category_name: getCategoryName(r.property_categories),
    }));
  }

  const coverByProperty = new Map<string, string>();
  for (const c of (covers ?? []) as CoverRow[]) {
    if (c?.property_id && c?.url && !coverByProperty.has(c.property_id)) {
      coverByProperty.set(c.property_id, c.url);
    }
  }

  // ✅ assina as URLs
  const out: PropertyWithCover[] = [];
  for (const r of rows) {
    const coverPath = coverByProperty.get(r.id);
    let coverUrl: string | undefined;

    if (coverPath) {
      const { data: signed, error: signErr } = await supabase.storage
        .from("property-media")
        .createSignedUrl(coverPath, 3600); // 1h

      if (!signErr && signed?.signedUrl) coverUrl = signed.signedUrl;
    }

    out.push({
      id: r.id,
      status: r.status,
      purpose: r.purpose,
      title: r.title,
      city: r.city,
      neighborhood: r.neighborhood,
      address: r.address,
      price: r.price,
      rent_price: r.rent_price,
      area_m2: r.area_m2,
      bedrooms: r.bedrooms,
      bathrooms: r.bathrooms,
      created_at: r.created_at,
      cover_url: coverUrl,
      property_category_id: r.property_category_id,
      property_category_name: getCategoryName(r.property_categories),
    });
  }

  return out;
}

/**
 * Busca propriedades com capa + categoria
 */
export async function getPropertiesWithCover(): Promise<PropertyWithCover[]> {
  const supabase = await makeServerSupabaseClient();

  const { data: properties, error: propertiesError } = await supabase
    .from("properties")
    .select(
      `
      id,
      status,
      purpose,
      title,
      city,
      neighborhood,
      address,
      price,
      rent_price,
      area_m2,
      bedrooms,
      bathrooms,
      created_at,
      property_category_id,
      property_categories ( id, name )
    `
    )
    .order("created_at", { ascending: false });

  if (propertiesError || !properties) {
    throw new Error(`Erro ao buscar propriedades: ${propertiesError?.message}`);
  }

  return attachCovers(supabase, properties as unknown as PropertyRow[]);
}

/**
 * Busca propriedades do usuário logado com capa + categoria
 */
export async function getMyPropertiesWithCover(
  userId: string
): Promise<PropertyWithCover[]> {
  const supabase = await makeServerSupabaseClient();

  const { data: properties, error: propertiesError } = await supabase
    .from("properties")
    .select(
      `
      id,
      status,
      purpose,
      title,
      city,
      neighborhood,
      address,
      price,
      rent_price,
      area_m2,
      bedrooms,
      bathrooms,
      created_at,
      property_category_id,
      property_categories ( id, name )
    `
    )
    .eq("owner_user_id", userId)
    .order("created_at", { ascending: false });

  if (propertiesError || !properties) {
    throw new Error(`Erro ao buscar propriedades: ${propertiesError?.message}`);
  }

  return attachCovers(supabase, properties as unknown as PropertyRow[]);
}
