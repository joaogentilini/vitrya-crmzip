// app/(crm)/properties/[id]/page.tsx
import PropertyTabs from "./PropertyTabs";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

type PropertyCategory = {
  id: string;
  name: string;
  is_active: boolean;
  position: number;
};

type CategoryRel = { id: string; name: string } | { id: string; name: string }[] | null;

function getCategoryName(rel: CategoryRel): string | null {
  if (!rel) return null;
  if (Array.isArray(rel)) return rel[0]?.name ?? null;
  return rel.name ?? null;
}

export default async function PropertyDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: propertyId } = await params;

  // ✅ Next 15/16: cookies() pode ser Promise -> use await
  const cookieStore = await cookies();

  const supabase = createServerClient(
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

  // ✅ 1) Carrega imóvel já com categoria
  const { data: property, error } = await supabase
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
      parking,
      description,
      owner_user_id,
      created_at,
      property_category_id,
      property_categories ( id, name )
    `
    )
    .eq("id", propertyId)
    .maybeSingle();

  if (error) {
    return (
      <div style={{ padding: 24 }}>
        <h1>Imóvel</h1>
        <p>Erro ao carregar imóvel: {error.message}</p>
      </div>
    );
  }

  if (!property) {
    return (
      <div style={{ padding: 24 }}>
        <h1>Imóvel não encontrado</h1>
        <p>ID: {propertyId}</p>
      </div>
    );
  }

  // ✅ 2) Carrega categorias para o select/edição (no tabs/editor)
  const { data: categoriesData, error: catErr } = await supabase
    .from("property_categories")
    .select("id, name, is_active, position")
    .eq("is_active", true)
    .order("position", { ascending: true });

  const propertyCategories: PropertyCategory[] = catErr
    ? []
    : ((categoriesData ?? []) as PropertyCategory[]);

  // ✅ relation pode vir como array
  const property_category_name = getCategoryName(
    (property as any)?.property_categories as CategoryRel
  );

  const propertyForTabs = {
    ...property,
    property_category_name,
  };

  return (
    <div style={{ padding: 24 }}>
      <div
        style={{
          display: "flex",
          gap: 12,
          alignItems: "baseline",
          justifyContent: "space-between",
        }}
      >
        <div style={{ display: "flex", gap: 12, alignItems: "baseline" }}>
          <h1 style={{ margin: 0 }}>Imóvel</h1>
          <span style={{ opacity: 0.7, fontSize: 12 }}>ID: {property.id}</span>
        </div>

        <a
          href={`/imoveis/${property.id}`}
          target="_blank"
          rel="noreferrer"
          style={{
            padding: "8px 16px",
            backgroundColor: "#17BEBB",
            color: "white",
            textDecoration: "none",
            borderRadius: 8,
            fontSize: 14,
            fontWeight: 500,
          }}
        >
          Ver no site
        </a>
      </div>

      <div style={{ marginTop: 16 }}>
        <PropertyTabs
          property={propertyForTabs as any}
          propertyCategories={propertyCategories}
        />
      </div>
    </div>
  );
}
