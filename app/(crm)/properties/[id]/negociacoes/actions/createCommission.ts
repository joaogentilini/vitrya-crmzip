"use server";

import { createClient } from "@/lib/supabase/server";

export async function createCommission(formData: FormData) {
  const supabase = await createClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError) throw userError;
  if (!user) throw new Error("Unauthorized");

  const negotiationId = String(formData.get("negotiationId") || "").trim();
  const gross = Number(formData.get("grossValue"));
  const percent = Number(formData.get("commissionPercent"));

  if (!negotiationId) throw new Error("negotiationId is required");
  if (!Number.isFinite(gross) || gross <= 0) throw new Error("grossValue must be > 0");
  if (!Number.isFinite(percent) || percent <= 0) throw new Error("commissionPercent must be > 0");

  const commissionValue = (gross * percent) / 100;

  const { error: negotiationError } = await supabase
    .from("property_negotiations")
    .select("id")
    .eq("id", negotiationId)
    .single();

  if (negotiationError) throw negotiationError;

  const { data: commission, error: commissionError } = await supabase
    .from("negotiation_commissions")
    .upsert(
      {
        negotiation_id: negotiationId,
        owner_user_id: user.id,
        gross_value: gross,
        commission_percent: percent,
        commission_value: commissionValue,
        status: "pending",
      },
      { onConflict: "negotiation_id" }
    )
    .select("*")
    .single();

  if (commissionError) throw commissionError;

  // timeline é opcional por enquanto
  await supabase.from("negotiation_timeline").insert({
    negotiation_id: negotiationId,
    owner_user_id: user.id,
    event_type: "commission_upserted",
    description: `Comissão definida: R$ ${commissionValue.toFixed(2)} (${percent.toFixed(2)}%)`,
  });

  return commission;
}
