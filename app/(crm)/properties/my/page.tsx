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
  const propertyIds = properties.map((p) => p.id);
  const safeIds = propertyIds.length ? propertyIds : ['00000000-0000-0000-0000-000000000000'];

  // Buscar tarefas de campanha
  const { data: taskRows } = await supabase
    .from('property_campaign_tasks')
    .select('property_id, due_date, done_at')
    .in('property_id', safeIds);

  // Agregar métricas
  let tasks_total = 0;
  let pending_total = 0;
  let done_total = 0;
  let overdue = 0;
  let due_today = 0;
  let due_week = 0;

  const today = new Date();
  const todayYMD = today.toISOString().slice(0, 10);
  const weekEnd = new Date(today);
  weekEnd.setDate(today.getDate() + 7);
  const weekEndYMD = weekEnd.toISOString().slice(0, 10);

  for (const row of taskRows ?? []) {
    tasks_total++;
    if (row.done_at) {
      done_total++;
    } else {
      pending_total++;
      const dueYMD = row.due_date.slice(0, 10);
      if (dueYMD < todayYMD) overdue++;
      else if (dueYMD === todayYMD) due_today++;
      else if (dueYMD <= weekEndYMD) due_week++;
    }
  }

  // Criar aggMap para badges por imóvel (opcional)
  const aggMap = new Map();
  for (const id of propertyIds) {
    const propertyTasks = (taskRows ?? []).filter(t => t.property_id === id);
    let p_tasks_total = 0;
    let p_pending_total = 0;
    let p_overdue = 0;
    let p_due_today = 0;
    let p_due_week = 0;
    for (const t of propertyTasks) {
      p_tasks_total++;
      if (!t.done_at) {
        p_pending_total++;
        const dueYMD = t.due_date.slice(0, 10);
        if (dueYMD < todayYMD) p_overdue++;
        else if (dueYMD === todayYMD) p_due_today++;
        else if (dueYMD <= weekEndYMD) p_due_week++;
      }
    }
    aggMap.set(id, { pending_total: p_pending_total, overdue: p_overdue, due_today: p_due_today, due_week: p_due_week });
  }

  // Buscar mídias para carrossel
  let mediaByProperty: Record<string, string[]> = {};
  if (propertyIds.length) {
    const { data: mediaRows } = await supabase
      .from("property_media")
      .select("property_id,url,kind,position")
      .in("property_id", propertyIds)
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

      {/* Resumo de Campanhas */}
      <div className="rounded-3xl border border-black/10 bg-white p-4 shadow-sm mb-6">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="text-sm font-extrabold text-black/90">Resumo de Campanhas</div>
            <div className="mt-2 flex flex-wrap gap-2">
              <span className="rounded-full border border-black/10 bg-black/5 px-3 py-1 text-xs text-black/70">
                Pendentes: {pending_total}
              </span>
              <span className="rounded-full border border-black/10 bg-black/5 px-3 py-1 text-xs text-black/70">
                Atrasadas: {overdue}
              </span>
              <span className="rounded-full border border-black/10 bg-black/5 px-3 py-1 text-xs text-black/70">
                Hoje: {due_today}
              </span>
              <span className="rounded-full border border-black/10 bg-black/5 px-3 py-1 text-xs text-black/70">
                Semana: {due_week}
              </span>
            </div>
          </div>

          <a
            href="/campaigns"
            className="rounded-xl border border-black/10 bg-white px-3 py-2 text-sm text-black/80 hover:bg-black/5"
          >
            Abrir Kanban
          </a>
        </div>
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
            <MyPropertyCard key={property.id} property={property as any} agg={aggMap.get(property.id)} />
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
