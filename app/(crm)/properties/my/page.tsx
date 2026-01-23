import Link from "next/link";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import MyPropertyCard from "./MyPropertyCard";
import { getMyPropertiesWithCover } from "@/lib/properties";

type MediaRow = {
  property_id: string;
  url: string;
  position: number | null;
  kind: string | null;
};

export default async function MyPropertiesPage() {
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
              (cookieStore as any).set(name, value, options);
            });
          } catch {
            // Server Component - ignore
          }
        },
      },
    }
  );

  const { data: auth, error: authErr } = await supabase.auth.getUser();
  const user = auth?.user;

  if (authErr || !user) {
    return (
      <div style={{ padding: 24 }}>
        <h1>Meus Imóveis</h1>
        <p>Você precisa estar logado para ver seus imóveis.</p>
      </div>
    );
  }

  const properties = await getMyPropertiesWithCover(user.id);
  const ids = properties.map((p) => p.id);

  // Buscar mídias para carrossel
  let mediaByProperty: Record<string, string[]> = {};
  if (ids.length) {
    const { data: mediaRows } = await supabase
      .from("property_media")
      .select("property_id,url,kind,position")
      .in("property_id", ids)
      .eq("kind", "image")
      .order("position", { ascending: true });

    for (const row of (mediaRows ?? []) as MediaRow[]) {
      if (!row.property_id || !row.url) continue;
      if (!mediaByProperty[row.property_id]) mediaByProperty[row.property_id] = [];
      mediaByProperty[row.property_id].push(row.url);
    }
  }

  // Assina URLs (limite por imóvel)
  const propertiesWithImages = await Promise.all(
    properties.map(async (p) => {
      const mediaPaths = mediaByProperty[p.id] ?? [];

      const uniquePaths: string[] = [];
      if (p.cover_url) uniquePaths.push(p.cover_url); // atenção: aqui cover_url é signed url no seu lib
      // Como o cover_url do lib é signedUrl, e o carrossel precisa de URLs reais,
      // nós vamos priorizar os mediaPaths assinados; e se não tiver, cai no cover_url.

      // Assinar até 6 paths do storage
      const limited = mediaPaths.slice(0, 6);

      const signed = await Promise.all(
        limited.map(async (path) => {
          const { data } = await supabase.storage
            .from("property-media")
            .createSignedUrl(path, 3600);
          return data?.signedUrl ?? null;
        })
      );

      const imageUrls = signed.filter(Boolean) as string[];

      return {
        ...p,
        imageUrls: imageUrls.length ? imageUrls : (p.cover_url ? [p.cover_url] : []),
      };
    })
  );

  return (
    <div style={{ padding: 24 }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 24,
        }}
      >
        <h1>Meus Imóveis</h1>
        <Link
          href="/properties/new"
          style={{
            padding: "8px 16px",
            backgroundColor: "#294487",
            color: "white",
            borderRadius: 8,
            textDecoration: "none",
            fontWeight: 700,
          }}
        >
          Novo Imóvel
        </Link>
      </div>

      {propertiesWithImages.length > 0 ? (
        <div
          style={{
            display: "grid",
            gap: 14,
            // ✅ ~30% menor (cards mais compactos)
            gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
          }}
        >
          {propertiesWithImages.map((property) => (
            <MyPropertyCard key={property.id} property={property as any} />
          ))}
        </div>
      ) : (
        <div style={{ textAlign: "center", padding: 48, color: "#6b7280" }}>
          <p>Você ainda não tem imóveis cadastrados.</p>
          <Link href="/properties/new" style={{ color: "#294487", textDecoration: "underline" }}>
            Criar primeiro imóvel
          </Link>
        </div>
      )}
    </div>
  );
}
