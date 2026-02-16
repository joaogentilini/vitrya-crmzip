export default async function ErpNegociacoesPage() {
  return (
    <div className="flex flex-col gap-2">
      <h1 className="text-xl font-semibold text-slate-900">
        <span>Negociações</span>
      </h1>
      <p className="text-sm text-slate-600">
        <span>Lista e status machine (draft → active → … → won/lost/canceled).</span>
      </p>
    </div>
  );
}
