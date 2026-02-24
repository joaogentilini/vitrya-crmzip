'use client'

import { type Dispatch, type SetStateAction, useMemo, useState, useTransition } from 'react'

import { Button } from '@/components/ui/Button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useToast } from '@/components/ui/Toast'
import type {
  BusinessLineRow,
  CollectionMethodRow,
  FinancialAccountRow,
  FinancialCategoryRow,
  FinanceSettingsRow,
  PaymentMethodRow,
  ProposalPaymentMethodRow,
  PaymentTermRow,
} from '@/lib/finance/types'

import {
  updateFinanceAutomationSettingsAction,
  upsertBusinessLineAction,
  upsertFinancialAccountAction,
  upsertFinancialCategoryAction,
  upsertCollectionMethodAction,
  upsertPaymentMethodAction,
  upsertPaymentTermAction,
} from './actions'

type Props = {
  schemaMissing: boolean
  businessLines: BusinessLineRow[]
  accounts: FinancialAccountRow[]
  paymentMethods: PaymentMethodRow[]
  proposalPaymentMethods: ProposalPaymentMethodRow[]
  collectionMethods: CollectionMethodRow[]
  paymentTerms: PaymentTermRow[]
  financialCategories: FinancialCategoryRow[]
  financeSettings: FinanceSettingsRow | null
}

export function FinanceSettingsClient({
  schemaMissing,
  businessLines,
  accounts,
  paymentMethods,
  proposalPaymentMethods,
  collectionMethods,
  paymentTerms,
  financialCategories,
  financeSettings,
}: Props) {
  const { success, error } = useToast()
  const [isPending, startTransition] = useTransition()

  const lineOptions = useMemo(
    () => [{ value: '', label: 'Global' }, ...businessLines.map((row) => ({ value: row.id, label: `${row.name} (${row.code})` }))],
    [businessLines]
  )

  const [lineForm, setLineForm] = useState({
    id: '',
    code: '',
    name: '',
    position: '100',
    is_active: true,
  })

  const [accountForm, setAccountForm] = useState({
    id: '',
    name: '',
    business_line_id: '',
    asaas_wallet_id: '',
    is_active: true,
    is_cash_box: false,
  })

  const [methodForm, setMethodForm] = useState({
    id: '',
    code: '',
    name: '',
    is_active: true,
    accepts_installments: false,
  })

  const [collectionForm, setCollectionForm] = useState({
    id: '',
    code: '',
    name: '',
    position: '10',
    is_active: true,
  })

  const [termForm, setTermForm] = useState({
    id: '',
    code: '',
    name: '',
    installments_count: '1',
    interval_days: '30',
    is_active: true,
  })

  const [categoryForm, setCategoryForm] = useState({
    id: '',
    code: '',
    name: '',
    direction: 'in' as 'in' | 'out',
    business_line_id: '',
    is_active: true,
  })

  const [automation, setAutomation] = useState({
    finance_automation_enabled: Boolean(financeSettings?.finance_automation_enabled),
    auto_generate_sale_distributions: Boolean(financeSettings?.auto_generate_sale_distributions),
    auto_generate_rent_distributions: Boolean(financeSettings?.auto_generate_rent_distributions),
  })

  function handleSubmit<T>(fn: () => Promise<{ ok: boolean; error?: string }>, successMsg: string, clearFn: () => void) {
    startTransition(async () => {
      const result = await fn()
      if (!result.ok) {
        error(result.error || 'Erro ao salvar.')
        return
      }
      success(successMsg)
      clearFn()
    })
  }

  if (schemaMissing) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Financeiro ERP</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-[var(--muted-foreground)]">
            Schema financeiro pendente. Aplique as migrations <code>202602221530_finance_erp_asaas_mvp.sql</code>,
            <code>20260224_1100_split_proposal_vs_collection_methods.sql</code>,
            <code>20260224_1115_financial_traceability_lead_dimensions_v2.sql</code>,
            <code>20260224_1145_financial_methods_rls_and_grants_v2.sql</code> e
            <code>20260224_1215_financial_traceability_hotfix_missing_columns.sql</code>.
          </p>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Configurações Financeiras</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-[var(--muted-foreground)]">
            Configure linhas de negócio, contas Asaas/subconta, métodos da proposta, métodos de cobrança, prazos, categorias e automações.
          </p>
        </CardContent>
      </Card>

      <Tabs defaultValue="contas">
        <TabsList>
          <TabsTrigger value="contas">Contas</TabsTrigger>
          <TabsTrigger value="linhas">Linhas</TabsTrigger>
          <TabsTrigger value="metodos">Métodos</TabsTrigger>
          <TabsTrigger value="prazos">Prazos</TabsTrigger>
          <TabsTrigger value="categorias">Categorias</TabsTrigger>
          <TabsTrigger value="automacoes">Automações</TabsTrigger>
        </TabsList>

        <TabsContent value="contas" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Contas cadastradas</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              {accounts.map((row) => (
                <button
                  key={row.id}
                  type="button"
                  onClick={() =>
                    setAccountForm({
                      id: row.id,
                      name: row.name,
                      business_line_id: row.business_line_id || '',
                      asaas_wallet_id: row.asaas_wallet_id || '',
                      is_active: row.is_active,
                      is_cash_box: row.is_cash_box,
                    })
                  }
                  className="w-full rounded-lg border border-[var(--border)] p-3 text-left hover:bg-[var(--muted)]"
                >
                  <div className="font-medium text-[var(--foreground)]">{row.name}</div>
                  <div className="text-xs text-[var(--muted-foreground)]">
                    wallet: {row.asaas_wallet_id || '-'} | ativo: {row.is_active ? 'sim' : 'não'}
                  </div>
                </button>
              ))}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Conta (novo/editar)</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3 md:grid-cols-3">
              <Input label="ID (opcional edição)" value={accountForm.id} onChange={(e) => setAccountForm((p) => ({ ...p, id: e.target.value }))} />
              <Input label="Nome" value={accountForm.name} onChange={(e) => setAccountForm((p) => ({ ...p, name: e.target.value }))} />
              <Select label="Linha" options={lineOptions} value={accountForm.business_line_id} onChange={(e) => setAccountForm((p) => ({ ...p, business_line_id: e.target.value }))} />
              <Input label="Wallet Asaas" value={accountForm.asaas_wallet_id} onChange={(e) => setAccountForm((p) => ({ ...p, asaas_wallet_id: e.target.value }))} />
              <label className="inline-flex items-center gap-2 text-sm"><input type="checkbox" checked={accountForm.is_active} onChange={(e) => setAccountForm((p) => ({ ...p, is_active: e.target.checked }))} />Ativa</label>
              <label className="inline-flex items-center gap-2 text-sm"><input type="checkbox" checked={accountForm.is_cash_box} onChange={(e) => setAccountForm((p) => ({ ...p, is_cash_box: e.target.checked }))} />Caixa</label>
              <div className="md:col-span-3">
                <Button
                  loading={isPending}
                  onClick={() =>
                    handleSubmit(
                      () =>
                        upsertFinancialAccountAction({
                          id: accountForm.id || null,
                          name: accountForm.name,
                          business_line_id: accountForm.business_line_id || null,
                          asaas_wallet_id: accountForm.asaas_wallet_id || null,
                          is_active: accountForm.is_active,
                          is_cash_box: accountForm.is_cash_box,
                        }),
                      'Conta salva.',
                      () =>
                        setAccountForm({
                          id: '',
                          name: '',
                          business_line_id: '',
                          asaas_wallet_id: '',
                          is_active: true,
                          is_cash_box: false,
                        })
                    )
                  }
                >
                  Salvar conta
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="linhas" className="space-y-4">
          <SimpleList title="Linhas atuais" rows={businessLines.map((row) => `${row.code} - ${row.name} (${row.is_active ? 'ativo' : 'inativo'})`)} />
          <SimpleLineForm form={lineForm} setForm={setLineForm} pending={isPending} onSubmit={() =>
            handleSubmit(
              () =>
                upsertBusinessLineAction({
                  id: lineForm.id || null,
                  code: lineForm.code,
                  name: lineForm.name,
                  is_active: lineForm.is_active,
                  position: Number(lineForm.position || 0),
                }),
              'Linha salva.',
              () => setLineForm({ id: '', code: '', name: '', position: '100', is_active: true })
            )
          } />
        </TabsContent>

        <TabsContent value="metodos" className="space-y-4">
          <SimpleList
            title="Métodos da Proposta (negociação)"
            rows={proposalPaymentMethods.map((row) => `${row.code} - ${row.name} (${row.is_active ? 'ativo' : 'inativo'})`)}
          />

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Métodos de Cobrança (Asaas)</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              {collectionMethods.length === 0 ? (
                <p className="text-[var(--muted-foreground)]">Sem métodos de cobrança cadastrados.</p>
              ) : (
                collectionMethods.map((row) => (
                  <button
                    key={row.id}
                    type="button"
                    onClick={() =>
                      setCollectionForm({
                        id: row.id,
                        code: row.code,
                        name: row.name,
                        position: String(row.position ?? 0),
                        is_active: row.is_active,
                      })
                    }
                    className="w-full rounded-lg border border-[var(--border)] p-3 text-left hover:bg-[var(--muted)]"
                  >
                    <div className="font-medium text-[var(--foreground)]">
                      {row.code} - {row.name}
                    </div>
                    <div className="text-xs text-[var(--muted-foreground)]">
                      posição: {row.position ?? 0} | ativo: {row.is_active ? 'sim' : 'não'}
                    </div>
                  </button>
                ))
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Método de Cobrança (novo/editar)</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3 md:grid-cols-5">
              <Input label="ID (opcional)" value={collectionForm.id} onChange={(e) => setCollectionForm((p) => ({ ...p, id: e.target.value }))} />
              <Input label="Código" value={collectionForm.code} onChange={(e) => setCollectionForm((p) => ({ ...p, code: e.target.value }))} />
              <Input label="Nome" value={collectionForm.name} onChange={(e) => setCollectionForm((p) => ({ ...p, name: e.target.value }))} />
              <Input
                label="Posição"
                type="number"
                value={collectionForm.position}
                onChange={(e) => setCollectionForm((p) => ({ ...p, position: e.target.value }))}
              />
              <label className="inline-flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={collectionForm.is_active}
                  onChange={(e) => setCollectionForm((p) => ({ ...p, is_active: e.target.checked }))}
                />
                Ativo
              </label>
              <div className="md:col-span-5">
                <Button
                  loading={isPending}
                  onClick={() =>
                    handleSubmit(
                      () =>
                        upsertCollectionMethodAction({
                          id: collectionForm.id || null,
                          code: collectionForm.code,
                          name: collectionForm.name,
                          position: Number(collectionForm.position || 0),
                          is_active: collectionForm.is_active,
                        }),
                      'Método de cobrança salvo.',
                      () => setCollectionForm({ id: '', code: '', name: '', position: '10', is_active: true })
                    )
                  }
                >
                  Salvar método de cobrança
                </Button>
              </div>
            </CardContent>
          </Card>

          <SimpleList
            title="Métodos legados (compatibilidade)"
            rows={paymentMethods.map((row) => `${row.code} - ${row.name} (${row.is_active ? 'ativo' : 'inativo'})`)}
          />
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Método legado (novo/editar)</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3 md:grid-cols-4">
              <Input label="ID (opcional)" value={methodForm.id} onChange={(e) => setMethodForm((p) => ({ ...p, id: e.target.value }))} />
              <Input label="Código" value={methodForm.code} onChange={(e) => setMethodForm((p) => ({ ...p, code: e.target.value }))} />
              <Input label="Nome" value={methodForm.name} onChange={(e) => setMethodForm((p) => ({ ...p, name: e.target.value }))} />
              <label className="inline-flex items-center gap-2 text-sm"><input type="checkbox" checked={methodForm.is_active} onChange={(e) => setMethodForm((p) => ({ ...p, is_active: e.target.checked }))} />Ativo</label>
              <label className="inline-flex items-center gap-2 text-sm"><input type="checkbox" checked={methodForm.accepts_installments} onChange={(e) => setMethodForm((p) => ({ ...p, accepts_installments: e.target.checked }))} />Parcelável</label>
              <div className="md:col-span-4">
                <Button
                  loading={isPending}
                  onClick={() =>
                    handleSubmit(
                      () =>
                        upsertPaymentMethodAction({
                          id: methodForm.id || null,
                          code: methodForm.code,
                          name: methodForm.name,
                          is_active: methodForm.is_active,
                          accepts_installments: methodForm.accepts_installments,
                        }),
                      'Método salvo.',
                      () => setMethodForm({ id: '', code: '', name: '', is_active: true, accepts_installments: false })
                    )
                  }
                >
                  Salvar método
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="prazos" className="space-y-4">
          <SimpleList title="Prazos atuais" rows={paymentTerms.map((row) => `${row.code} - ${row.name} (${row.installments_count}x)`)} />
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Prazo (novo/editar)</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3 md:grid-cols-5">
              <Input label="ID (opcional)" value={termForm.id} onChange={(e) => setTermForm((p) => ({ ...p, id: e.target.value }))} />
              <Input label="Código" value={termForm.code} onChange={(e) => setTermForm((p) => ({ ...p, code: e.target.value }))} />
              <Input label="Nome" value={termForm.name} onChange={(e) => setTermForm((p) => ({ ...p, name: e.target.value }))} />
              <Input label="Parcelas" type="number" value={termForm.installments_count} onChange={(e) => setTermForm((p) => ({ ...p, installments_count: e.target.value }))} />
              <Input label="Intervalo (dias)" type="number" value={termForm.interval_days} onChange={(e) => setTermForm((p) => ({ ...p, interval_days: e.target.value }))} />
              <label className="inline-flex items-center gap-2 text-sm"><input type="checkbox" checked={termForm.is_active} onChange={(e) => setTermForm((p) => ({ ...p, is_active: e.target.checked }))} />Ativo</label>
              <div className="md:col-span-5">
                <Button
                  loading={isPending}
                  onClick={() =>
                    handleSubmit(
                      () =>
                        upsertPaymentTermAction({
                          id: termForm.id || null,
                          code: termForm.code,
                          name: termForm.name,
                          installments_count: Number(termForm.installments_count || 1),
                          interval_days: Number(termForm.interval_days || 30),
                          is_active: termForm.is_active,
                        }),
                      'Prazo salvo.',
                      () => setTermForm({ id: '', code: '', name: '', installments_count: '1', interval_days: '30', is_active: true })
                    )
                  }
                >
                  Salvar prazo
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="categorias" className="space-y-4">
          <SimpleList title="Categorias atuais" rows={financialCategories.map((row) => `${row.direction} | ${row.code} - ${row.name}`)} />
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Categoria (novo/editar)</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3 md:grid-cols-5">
              <Input label="ID (opcional)" value={categoryForm.id} onChange={(e) => setCategoryForm((p) => ({ ...p, id: e.target.value }))} />
              <Input label="Código" value={categoryForm.code} onChange={(e) => setCategoryForm((p) => ({ ...p, code: e.target.value }))} />
              <Input label="Nome" value={categoryForm.name} onChange={(e) => setCategoryForm((p) => ({ ...p, name: e.target.value }))} />
              <Select
                label="Direção"
                options={[
                  { value: 'in', label: 'Entrada' },
                  { value: 'out', label: 'Saída' },
                ]}
                value={categoryForm.direction}
                onChange={(e) => setCategoryForm((p) => ({ ...p, direction: e.target.value === 'out' ? 'out' : 'in' }))}
              />
              <Select label="Linha" options={lineOptions} value={categoryForm.business_line_id} onChange={(e) => setCategoryForm((p) => ({ ...p, business_line_id: e.target.value }))} />
              <label className="inline-flex items-center gap-2 text-sm"><input type="checkbox" checked={categoryForm.is_active} onChange={(e) => setCategoryForm((p) => ({ ...p, is_active: e.target.checked }))} />Ativa</label>
              <div className="md:col-span-5">
                <Button
                  loading={isPending}
                  onClick={() =>
                    handleSubmit(
                      () =>
                        upsertFinancialCategoryAction({
                          id: categoryForm.id || null,
                          code: categoryForm.code,
                          name: categoryForm.name,
                          direction: categoryForm.direction,
                          business_line_id: categoryForm.business_line_id || null,
                          is_active: categoryForm.is_active,
                        }),
                      'Categoria salva.',
                      () => setCategoryForm({ id: '', code: '', name: '', direction: 'in', business_line_id: '', is_active: true })
                    )
                  }
                >
                  Salvar categoria
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="automacoes">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Automações e kill switch</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <label className="inline-flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={automation.finance_automation_enabled}
                  onChange={(e) => setAutomation((p) => ({ ...p, finance_automation_enabled: e.target.checked }))}
                />
                Kill switch global
              </label>
              <label className="inline-flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={automation.auto_generate_sale_distributions}
                  onChange={(e) => setAutomation((p) => ({ ...p, auto_generate_sale_distributions: e.target.checked }))}
                />
                Auto gerar repasses: Venda
              </label>
              <label className="inline-flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={automation.auto_generate_rent_distributions}
                  onChange={(e) => setAutomation((p) => ({ ...p, auto_generate_rent_distributions: e.target.checked }))}
                />
                Auto gerar repasses: Aluguel
              </label>
              <Button
                loading={isPending}
                onClick={() =>
                  handleSubmit(
                    () => updateFinanceAutomationSettingsAction(automation),
                    'Automações salvas.',
                    () => undefined
                  )
                }
              >
                Salvar automações
              </Button>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}

function SimpleList({ title, rows }: { title: string; rows: string[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 text-sm text-[var(--muted-foreground)]">
        {rows.length === 0 ? <p>Sem registros.</p> : rows.map((row) => <p key={row}>{row}</p>)}
      </CardContent>
    </Card>
  )
}

function SimpleLineForm({
  form,
  setForm,
  pending,
  onSubmit,
}: {
  form: { id: string; code: string; name: string; position: string; is_active: boolean }
  setForm: Dispatch<SetStateAction<{ id: string; code: string; name: string; position: string; is_active: boolean }>>
  pending: boolean
  onSubmit: () => void
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Linha (novo/editar)</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-3 md:grid-cols-5">
        <Input label="ID (opcional)" value={form.id} onChange={(e) => setForm((p) => ({ ...p, id: e.target.value }))} />
        <Input label="Código" value={form.code} onChange={(e) => setForm((p) => ({ ...p, code: e.target.value }))} />
        <Input label="Nome" value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} />
        <Input label="Posição" type="number" value={form.position} onChange={(e) => setForm((p) => ({ ...p, position: e.target.value }))} />
        <label className="inline-flex items-center gap-2 text-sm"><input type="checkbox" checked={form.is_active} onChange={(e) => setForm((p) => ({ ...p, is_active: e.target.checked }))} />Ativa</label>
        <div className="md:col-span-5">
          <Button loading={pending} onClick={onSubmit}>
            Salvar linha
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
