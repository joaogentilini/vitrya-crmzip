'use client'

import { useMemo, useRef, useState, useTransition, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createLeadAction, checkLeadByPhoneAction, DuplicateCheckResult } from './actions'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { useToast } from '@/components/ui/Toast'

type PipelineRow = {
  id: string
  name: string
  created_at?: string
}

type StageRow = {
  id: string
  pipeline_id: string
  name: string
  position: number
}

type CatalogItem = {
  id: string
  name: string
}

type Props = {
  pipelines: PipelineRow[]
  stages: StageRow[]
  leadTypes?: CatalogItem[]
  leadInterests?: CatalogItem[]
  leadSources?: CatalogItem[]
}

export function CreateLeadForm({ pipelines, stages, leadTypes = [], leadInterests = [], leadSources = [] }: Props) {
  const router = useRouter()
  const formRef = useRef<HTMLFormElement>(null)
  const [isPending, startTransition] = useTransition()
  const { success, error: showError } = useToast()

  const [pipelineId, setPipelineId] = useState<string>(pipelines?.[0]?.id ?? '')
  const [clientName, setClientName] = useState('')
  const [clientNameError, setClientNameError] = useState<string | undefined>()
  const [phone, setPhone] = useState('')
  const [phoneError, setPhoneError] = useState<string | undefined>()
  const [leadTypeId, setLeadTypeId] = useState<string>('')
  const [leadInterestId, setLeadInterestId] = useState<string>('')
  const [leadSourceId, setLeadSourceId] = useState<string>('')
  const [email, setEmail] = useState('')
  const [emailError, setEmailError] = useState<string | undefined>()
  const [notes, setNotes] = useState('')

  const [duplicateLead, setDuplicateLead] = useState<DuplicateCheckResult['lead'] | null>(null)
  const [isCheckingPhone, setIsCheckingPhone] = useState(false)

  const stageOptions = useMemo(() => {
    return stages
      .filter((s) => s.pipeline_id === pipelineId)
      .sort((a, b) => a.position - b.position)
  }, [stages, pipelineId])

  const [stageId, setStageId] = useState<string>(stageOptions?.[0]?.id ?? '')

  function onChangePipeline(nextPipelineId: string) {
    setPipelineId(nextPipelineId)
    const first = stages
      .filter((s) => s.pipeline_id === nextPipelineId)
      .sort((a, b) => a.position - b.position)[0]
    setStageId(first?.id ?? '')
  }

  const checkPhoneDuplicate = useCallback(async (phoneValue: string) => {
    if (!phoneValue || phoneValue.length < 10) {
      setDuplicateLead(null)
      return
    }

    setIsCheckingPhone(true)
    try {
      const result = await checkLeadByPhoneAction(phoneValue)
      if (result.exists && result.lead) {
        setDuplicateLead(result.lead)
        setPhoneError('Já existe um lead com esse telefone')
      } else {
        setDuplicateLead(null)
        setPhoneError(undefined)
      }
    } catch (err) {
      console.error('Error checking phone:', err)
    } finally {
      setIsCheckingPhone(false)
    }
  }, [])

  function validateForm(): boolean {
    let isValid = true
    setClientNameError(undefined)
    setPhoneError(undefined)
    setEmailError(undefined)

    if (!clientName.trim()) {
      setClientNameError('O nome do cliente é obrigatório')
      isValid = false
    } else if (clientName.trim().length < 2) {
      setClientNameError('O nome deve ter pelo menos 2 caracteres')
      isValid = false
    }

    if (!phone.trim()) {
      setPhoneError('O telefone é obrigatório')
      isValid = false
    }

    if (duplicateLead) {
      setPhoneError('Já existe um lead com esse telefone')
      isValid = false
    }

    if (!pipelineId) {
      showError('Selecione um pipeline.')
      isValid = false
    }

    if (!stageId) {
      showError('Selecione um estágio.')
      isValid = false
    }

    if (!leadTypeId) {
      showError('Selecione o tipo do lead.')
      isValid = false
    }

    if (!leadInterestId) {
      showError('Selecione o interesse do lead.')
      isValid = false
    }

    if (!leadSourceId) {
      showError('Selecione a origem do lead.')
      isValid = false
    }

    return isValid
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    
    if (!validateForm()) {
      return
    }

    startTransition(async () => {
      const result = await createLeadAction({ 
        title: clientName.trim(),
        clientName: clientName.trim(),
        phoneRaw: phone.trim(),
        email: email.trim() || undefined,
        pipelineId: pipelineId || undefined, 
        stageId: stageId || undefined,
        leadTypeId: leadTypeId || undefined,
        leadInterestId: leadInterestId || undefined,
        leadSourceId: leadSourceId || undefined,
        notes: notes.trim() || undefined,
      })

      if (!result.ok) {
        if (result.code === 'PHONE_DUPLICATE') {
          setPhoneError(result.message)
        } else if (result.code === 'PHONE_INVALID') {
          setPhoneError(result.message)
        } else if (result.code === 'EMAIL_INVALID') {
          setEmailError(result.message)
        } else if (result.code === 'VALIDATION_ERROR') {
          setClientNameError(result.message)
        } else {
          showError(result.message)
        }
        console.error('[CreateLeadForm] Error:', result.code, result.message, result.details)
        return
      }

      // Success - reset form
      setClientName('')
      setPhone('')
      setEmail('')
      setLeadTypeId('')
      setLeadInterestId('')
      setLeadSourceId('')
      setNotes('')
      setDuplicateLead(null)
      setClientNameError(undefined)
      setPhoneError(undefined)
      setEmailError(undefined)
      success('Lead criado com sucesso!')
      router.refresh()
    })
  }

  const selectClass = "flex h-10 w-full rounded-[var(--radius)] border border-[var(--input)] bg-[var(--background)] px-3 py-2 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--background)] disabled:cursor-not-allowed disabled:opacity-50"

  return (
    <form
      ref={formRef}
      onSubmit={onSubmit}
      data-lead-form
      className="p-4 bg-[var(--card)] rounded-[var(--radius-lg)] border border-[var(--border)] shadow-sm space-y-4"
    >
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <div>
          <Input
            name="clientName"
            label="Nome do Cliente *"
            placeholder="Ex: João Silva"
            value={clientName}
            onChange={(e) => {
              setClientName(e.target.value)
              if (clientNameError) setClientNameError(undefined)
            }}
            error={clientNameError}
            disabled={isPending}
            autoComplete="off"
          />
        </div>

        <div>
          <Input
            name="phone"
            label="Telefone *"
            placeholder="(11) 99999-9999"
            value={phone}
            onChange={(e) => {
              setPhone(e.target.value)
              if (phoneError) setPhoneError(undefined)
              setDuplicateLead(null)
            }}
            onBlur={() => checkPhoneDuplicate(phone)}
            error={phoneError}
            disabled={isPending}
            autoComplete="tel"
          />
          {isCheckingPhone && (
            <p className="text-xs text-[var(--muted-foreground)] mt-1">Verificando...</p>
          )}
          {duplicateLead && (
            <div className="mt-2 p-2 bg-[var(--warning)]/10 border border-[var(--warning)] rounded-[var(--radius)] text-sm">
              <p className="text-[var(--warning)] font-medium">Já existe um lead com esse telefone:</p>
              <p className="text-[var(--foreground)]">{duplicateLead.client_name || duplicateLead.title}</p>
              <Link 
                href={`/leads/${duplicateLead.id}`}
                className="inline-flex items-center gap-1 text-[var(--primary)] hover:underline mt-1"
              >
                Abrir lead existente →
              </Link>
            </div>
          )}
        </div>

        <div>
          <Input
            name="email"
            label="Email"
            type="email"
            placeholder="email@exemplo.com"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value)
              if (emailError) setEmailError(undefined)
            }}
            error={emailError}
            disabled={isPending}
            autoComplete="email"
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1.5 text-[var(--foreground)]">
            Tipo *
          </label>
          <select
            value={leadTypeId}
            onChange={(e) => setLeadTypeId(e.target.value)}
            disabled={isPending || leadTypes.length === 0}
            className={selectClass}
          >
            <option value="">Selecione...</option>
            {leadTypes.map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1.5 text-[var(--foreground)]">
            Interesse *
          </label>
          <select
            value={leadInterestId}
            onChange={(e) => setLeadInterestId(e.target.value)}
            disabled={isPending || leadInterests.length === 0}
            className={selectClass}
          >
            <option value="">Selecione...</option>
            {leadInterests.map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1.5 text-[var(--foreground)]">
            Origem *
          </label>
          <select
            value={leadSourceId}
            onChange={(e) => setLeadSourceId(e.target.value)}
            disabled={isPending || leadSources.length === 0}
            className={selectClass}
          >
            <option value="">Selecione...</option>
            {leadSources.map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1.5 text-[var(--foreground)]">
            Pipeline
          </label>
          <select
            id="pipeline-select"
            value={pipelineId}
            onChange={(e) => onChangePipeline(e.target.value)}
            disabled={isPending || pipelines.length === 0}
            className={selectClass}
          >
            {pipelines.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1.5 text-[var(--foreground)]">
            Estágio
          </label>
          <select
            id="stage-select"
            value={stageId}
            onChange={(e) => setStageId(e.target.value)}
            disabled={isPending || !pipelineId || stageOptions.length === 0}
            className={selectClass}
          >
            {stageOptions.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>

        <div className="md:col-span-2 lg:col-span-2">
          <Input
            name="notes"
            label="Observações"
            placeholder="Informações adicionais sobre o lead..."
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            disabled={isPending}
          />
        </div>
      </div>

      <div className="flex justify-end pt-2">
        <Button type="submit" loading={isPending} disabled={isPending || !!duplicateLead}>
          {isPending ? 'Criando...' : 'Criar Lead'}
        </Button>
      </div>
    </form>
  )
}
