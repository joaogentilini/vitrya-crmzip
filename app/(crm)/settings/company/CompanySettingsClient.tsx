'use client'

import { useMemo, useState, useTransition } from 'react'

import { Button } from '@/components/ui/Button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { Input } from '@/components/ui/Input'
import { useToast } from '@/components/ui/Toast'
import { type CompanySettingsRow } from '@/lib/companySettings'

import { upsertCompanySettingsAction, type CompanySettingsInput } from './actions'

type CompanySettingsClientProps = {
  initialSettings: CompanySettingsRow | null
}

function toFieldValue(value: unknown): string {
  return String(value ?? '')
}

function digitsOnly(value: string): string {
  return value.replace(/\D/g, '')
}

function maskCnpj(value: string): string {
  const digits = digitsOnly(value).slice(0, 14)
  if (digits.length <= 2) return digits
  if (digits.length <= 5) return `${digits.slice(0, 2)}.${digits.slice(2)}`
  if (digits.length <= 8) return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5)}`
  if (digits.length <= 12) return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8)}`
  return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8, 12)}-${digits.slice(12)}`
}

function maskZip(value: string): string {
  const digits = digitsOnly(value).slice(0, 8)
  if (digits.length <= 5) return digits
  return `${digits.slice(0, 5)}-${digits.slice(5)}`
}

function maskPhone(value: string): string {
  const digits = digitsOnly(value).slice(0, 11)
  if (digits.length <= 2) return digits
  if (digits.length <= 6) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`
  if (digits.length <= 10) return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`
}

function initialFormFromSettings(settings: CompanySettingsRow | null): CompanySettingsInput {
  return {
    legal_name: toFieldValue(settings?.legal_name),
    trade_name: toFieldValue(settings?.trade_name),
    cnpj: toFieldValue(settings?.cnpj),
    state_registration: toFieldValue(settings?.state_registration),
    municipal_registration: toFieldValue(settings?.municipal_registration),
    creci_company: toFieldValue(settings?.creci_company),
    email: toFieldValue(settings?.email),
    phone: toFieldValue(settings?.phone),
    address_street: toFieldValue(settings?.address_street),
    address_number: toFieldValue(settings?.address_number),
    address_complement: toFieldValue(settings?.address_complement),
    address_neighborhood: toFieldValue(settings?.address_neighborhood),
    address_city: toFieldValue(settings?.address_city),
    address_state: toFieldValue(settings?.address_state),
    address_zip: toFieldValue(settings?.address_zip),
    website: toFieldValue(settings?.website),
    default_forum_city: toFieldValue(settings?.default_forum_city || 'Lucas do Rio Verde'),
    default_forum_state: toFieldValue(settings?.default_forum_state || 'MT'),
  }
}

export function CompanySettingsClient({ initialSettings }: CompanySettingsClientProps) {
  const { success, error } = useToast()
  const [isPending, startTransition] = useTransition()
  const [form, setForm] = useState<CompanySettingsInput>(() => initialFormFromSettings(initialSettings))

  const cnpjDigitsCount = useMemo(() => digitsOnly(form.cnpj).length, [form.cnpj])

  function handleSave() {
    startTransition(async () => {
      const result = await upsertCompanySettingsAction(form)
      if (!result.ok) {
        error(result.error || 'Erro ao salvar cadastro da empresa.')
        return
      }
      success('Cadastro da empresa salvo com sucesso.')
    })
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Cadastro da Empresa</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <p className="text-sm text-[var(--muted-foreground)]">
            Fonte de verdade para cabeçalho, rodapé e dados institucionais dos documentos.
          </p>
          <p className="text-xs text-[var(--muted-foreground)]">
            Apenas admin/gestor pode editar. CNPJ atual: {cnpjDigitsCount}/14 dígitos.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Dados Jurídicos</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <Input
            label="Razão social"
            value={form.legal_name}
            onChange={(event) => setForm((prev) => ({ ...prev, legal_name: event.target.value }))}
            required
          />
          <Input
            label="Nome fantasia"
            value={form.trade_name}
            onChange={(event) => setForm((prev) => ({ ...prev, trade_name: event.target.value }))}
          />
          <Input
            label="CNPJ"
            value={form.cnpj}
            onChange={(event) => setForm((prev) => ({ ...prev, cnpj: maskCnpj(event.target.value) }))}
            placeholder="00.000.000/0000-00"
            required
          />
          <Input
            label="CRECI da empresa"
            value={form.creci_company}
            onChange={(event) => setForm((prev) => ({ ...prev, creci_company: event.target.value }))}
          />
          <Input
            label="Inscrição estadual"
            value={form.state_registration}
            onChange={(event) => setForm((prev) => ({ ...prev, state_registration: event.target.value }))}
          />
          <Input
            label="Inscrição municipal"
            value={form.municipal_registration}
            onChange={(event) => setForm((prev) => ({ ...prev, municipal_registration: event.target.value }))}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Contato</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-3">
          <Input
            label="E-mail"
            type="email"
            value={form.email}
            onChange={(event) => setForm((prev) => ({ ...prev, email: event.target.value }))}
            placeholder="contato@empresa.com"
          />
          <Input
            label="Telefone"
            value={form.phone}
            onChange={(event) => setForm((prev) => ({ ...prev, phone: maskPhone(event.target.value) }))}
            placeholder="(00) 00000-0000"
          />
          <Input
            label="Website"
            value={form.website}
            onChange={(event) => setForm((prev) => ({ ...prev, website: event.target.value }))}
            placeholder="https://vitryaimoveis.com.br"
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Endereço</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-4">
          <div className="md:col-span-2">
            <Input
              label="Logradouro"
              value={form.address_street}
              onChange={(event) => setForm((prev) => ({ ...prev, address_street: event.target.value }))}
            />
          </div>
          <Input
            label="Número"
            value={form.address_number}
            onChange={(event) => setForm((prev) => ({ ...prev, address_number: event.target.value }))}
          />
          <Input
            label="Complemento"
            value={form.address_complement}
            onChange={(event) => setForm((prev) => ({ ...prev, address_complement: event.target.value }))}
          />
          <Input
            label="Bairro"
            value={form.address_neighborhood}
            onChange={(event) => setForm((prev) => ({ ...prev, address_neighborhood: event.target.value }))}
          />
          <Input
            label="Cidade"
            value={form.address_city}
            onChange={(event) => setForm((prev) => ({ ...prev, address_city: event.target.value }))}
          />
          <Input
            label="UF"
            value={form.address_state}
            maxLength={2}
            onChange={(event) =>
              setForm((prev) => ({ ...prev, address_state: event.target.value.toUpperCase() }))
            }
          />
          <Input
            label="CEP"
            value={form.address_zip}
            onChange={(event) => setForm((prev) => ({ ...prev, address_zip: maskZip(event.target.value) }))}
            placeholder="00000-000"
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Padrões</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <Input
            label="Cidade padrão do foro"
            value={form.default_forum_city}
            onChange={(event) => setForm((prev) => ({ ...prev, default_forum_city: event.target.value }))}
            required
          />
          <Input
            label="UF padrão do foro"
            value={form.default_forum_state}
            maxLength={2}
            onChange={(event) =>
              setForm((prev) => ({ ...prev, default_forum_state: event.target.value.toUpperCase() }))
            }
            required
          />
        </CardContent>
      </Card>

      <div className="flex items-center justify-end">
        <Button onClick={handleSave} loading={isPending}>
          Salvar cadastro da empresa
        </Button>
      </div>
    </div>
  )
}
