import { createCommission } from "./actions/createCommission";

type Props = {
  negotiationId: string;
  defaultGrossValue?: number | null;
  defaultCommissionPercent?: number | null;
};

export function CommissionFormServer(props: Props) {
  const gross = Number(props.defaultGrossValue ?? 0);
  const percent = Number(props.defaultCommissionPercent ?? 5);

  return (
    <form action={createCommission} className="flex flex-col gap-3">
      <input type="hidden" name="negotiationId" value={props.negotiationId} />

      <label className="flex flex-col gap-1">
        <span className="text-sm text-muted-foreground">Valor bruto</span>
        <input
          name="grossValue"
          type="number"
          step="0.01"
          defaultValue={Number.isFinite(gross) ? gross : 0}
          className="h-10 rounded-md border px-3"
          required
        />
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-sm text-muted-foreground">Percentual comissão</span>
        <input
          name="commissionPercent"
          type="number"
          step="0.01"
          defaultValue={Number.isFinite(percent) ? percent : 5}
          className="h-10 rounded-md border px-3"
          required
        />
      </label>

      <button type="submit" className="h-10 rounded-md bg-black px-4 text-white">
        Salvar comissão
      </button>
    </form>
  );
}
