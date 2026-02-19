'use client'

import { Fragment, useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'

import { Button } from '@/components/ui/Button'

import {
  addIncorporationPlanMediaAction,
  assignPlanToExistingUnitsAction,
  createIncorporationPlanAction,
  reconfigureIncorporationFloorsAction,
} from './actions'

type Feedback =
  | { kind: 'success'; message: string }
  | { kind: 'error'; message: string }
  | null

type UnitMapItem = {
  id: string
  unitCode: string
  tower: string | null
  floor: number
  stack: string
  status: string
  planId: string | null
}

type PlanOption = {
  id: string
  name: string
  isActive: boolean
}

function compareStacks(a: string, b: string): number {
  const aNum = Number(a)
  const bNum = Number(b)
  if (Number.isFinite(aNum) && Number.isFinite(bNum)) return aNum - bNum
  return a.localeCompare(b, 'pt-BR', { sensitivity: 'base' })
}

function statusClass(status: string): string {
  if (status === 'available') return 'border-emerald-200 bg-emerald-50 text-emerald-700'
  if (status === 'reserved') return 'border-amber-200 bg-amber-50 text-amber-700'
  if (status === 'sold') return 'border-sky-200 bg-sky-50 text-sky-700'
  return 'border-rose-200 bg-rose-50 text-rose-700'
}

function normalizeTower(value: string | null): string {
  return String(value || 'SEM BLOCO').trim().toUpperCase() || 'SEM BLOCO'
}

function resolveReplicatedUnitIds(
  units: UnitMapItem[],
  selectedUnitIds: string[],
  replicateToOtherBlocks: boolean
): { unitIds: string[]; replicatedCount: number } {
  const selectedIdSet = new Set(selectedUnitIds)
  if (!replicateToOtherBlocks) {
    return { unitIds: Array.from(selectedIdSet), replicatedCount: 0 }
  }

  const selectedUnits = units.filter((unit) => selectedIdSet.has(unit.id))
  if (selectedUnits.length === 0) {
    return { unitIds: [], replicatedCount: 0 }
  }

  const sourceTowerSet = new Set(selectedUnits.map((unit) => normalizeTower(unit.tower)))
  const positionSet = new Set(selectedUnits.map((unit) => `${unit.floor}:${unit.stack}`))

  const replicatedIds = units
    .filter((unit) => {
      if (selectedIdSet.has(unit.id)) return false
      if (unit.status === 'sold') return false
      if (sourceTowerSet.has(normalizeTower(unit.tower))) return false
      return positionSet.has(`${unit.floor}:${unit.stack}`)
    })
    .map((unit) => unit.id)

  return {
    unitIds: Array.from(new Set([...selectedUnitIds, ...replicatedIds])),
    replicatedCount: replicatedIds.length,
  }
}

function inferPlanGenerationShape(selectedUnits: UnitMapItem[]): {
  blocksCount: number
  floorsPerBlock: number
  unitsPerFloor: number
} {
  const byTowerAndFloor = new Map<string, Map<number, number>>()
  for (const unit of selectedUnits) {
    const tower = normalizeTower(unit.tower)
    const floorMap = byTowerAndFloor.get(tower) || new Map<number, number>()
    floorMap.set(unit.floor, (floorMap.get(unit.floor) || 0) + 1)
    byTowerAndFloor.set(tower, floorMap)
  }

  const blocksCount = Math.min(Math.max(byTowerAndFloor.size, 1), 50)

  let floorsPerBlock = 1
  let unitsPerFloor = 1
  for (const floorMap of byTowerAndFloor.values()) {
    floorsPerBlock = Math.max(floorsPerBlock, floorMap.size)
    for (const count of floorMap.values()) {
      unitsPerFloor = Math.max(unitsPerFloor, count)
    }
  }

  return {
    blocksCount,
    floorsPerBlock: Math.min(Math.max(floorsPerBlock, 1), 300),
    unitsPerFloor: Math.min(Math.max(unitsPerFloor, 1), 50),
  }
}

export default function PlanUnitAssignmentClient({
  incorporationId,
  planId,
  planName,
  availablePlans,
  units,
}: {
  incorporationId: string
  planId: string
  planName: string
  availablePlans: PlanOption[]
  units: UnitMapItem[]
}) {
  const router = useRouter()
  const [feedback, setFeedback] = useState<Feedback>(null)
  const [isPending, startTransition] = useTransition()
  const [selectedUnitIds, setSelectedUnitIds] = useState<string[]>([])
  const [publishPlan, setPublishPlan] = useState(true)
  const [showCreatePlan, setShowCreatePlan] = useState(false)
  const [showFloorEditor, setShowFloorEditor] = useState(false)

  const towers = useMemo(() => {
    return Array.from(new Set(units.map((unit) => normalizeTower(unit.tower)))).sort((a, b) =>
      a.localeCompare(b, 'pt-BR', { sensitivity: 'base' })
    )
  }, [units])

  const [selectedTower, setSelectedTower] = useState<string>(towers[0] || 'SEM BLOCO')

  const towerUnits = useMemo(
    () => units.filter((unit) => normalizeTower(unit.tower) === selectedTower),
    [selectedTower, units]
  )

  const floors = useMemo(() => {
    return Array.from(new Set(towerUnits.map((unit) => unit.floor))).sort((a, b) => b - a)
  }, [towerUnits])

  const stacks = useMemo(() => {
    return Array.from(new Set(towerUnits.map((unit) => unit.stack))).sort(compareStacks)
  }, [towerUnits])

  const selectableIds = useMemo(() => {
    return new Set(
      towerUnits.filter((unit) => unit.status !== 'sold').map((unit) => unit.id)
    )
  }, [towerUnits])

  const unitByKey = useMemo(() => {
    const map = new Map<string, UnitMapItem>()
    for (const unit of towerUnits) {
      map.set(`${unit.floor}:${unit.stack}`, unit)
    }
    return map
  }, [towerUnits])

  const selectedSet = useMemo(() => new Set(selectedUnitIds), [selectedUnitIds])
  const unitById = useMemo(() => new Map(units.map((unit) => [unit.id, unit])), [units])
  const selectedFloorNumbers = useMemo(() => {
    return Array.from(
      new Set(
        towerUnits
          .filter((unit) => selectedSet.has(unit.id))
          .map((unit) => unit.floor)
      )
    ).sort((a, b) => b - a)
  }, [towerUnits, selectedSet])

  function toggleUnit(unitId: string) {
    if (!selectableIds.has(unitId)) return
    setSelectedUnitIds((current) =>
      current.includes(unitId)
        ? current.filter((item) => item !== unitId)
        : [...current, unitId]
    )
  }

  function toggleFloor(floor: number) {
    const floorIds = towerUnits
      .filter((unit) => unit.floor === floor && selectableIds.has(unit.id))
      .map((unit) => unit.id)
    if (floorIds.length === 0) return

    const allSelected = floorIds.every((id) => selectedSet.has(id))
    setSelectedUnitIds((current) => {
      if (allSelected) return current.filter((id) => !floorIds.includes(id))
      return Array.from(new Set([...current, ...floorIds]))
    })
  }

  function toggleStack(stack: string) {
    const stackIds = towerUnits
      .filter((unit) => unit.stack === stack && selectableIds.has(unit.id))
      .map((unit) => unit.id)
    if (stackIds.length === 0) return

    const allSelected = stackIds.every((id) => selectedSet.has(id))
    setSelectedUnitIds((current) => {
      if (allSelected) return current.filter((id) => !stackIds.includes(id))
      return Array.from(new Set([...current, ...stackIds]))
    })
  }

  function clearSelection() {
    setSelectedUnitIds([])
  }

  function selectAvailableAndReserved() {
    setSelectedUnitIds((current) => {
      const ids = towerUnits
        .filter((unit) => unit.status === 'available' || unit.status === 'reserved')
        .map((unit) => unit.id)
      return Array.from(new Set([...current, ...ids]))
    })
  }

  function applyBatch() {
    if (selectedUnitIds.length === 0) {
      setFeedback({ kind: 'error', message: 'Selecione ao menos uma unidade no mapa.' })
      return
    }

    const formData = new FormData()
    formData.set('incorporationId', incorporationId)
    formData.set('planId', planId)
    formData.set('unitIds', JSON.stringify(selectedUnitIds))
    if (publishPlan) formData.set('publishPlan', 'on')
    else formData.set('publishPlan', 'off')

    startTransition(async () => {
      setFeedback(null)
      const result = await assignPlanToExistingUnitsAction(formData)
      if (!result.success) {
        setFeedback({ kind: 'error', message: result.error })
        return
      }

      const publishedSuffix =
        result.data.publishedPlan
          ? result.data.publishedPriceFrom
            ? ` Tipologia publicada com preço a partir de R$ ${Number(result.data.publishedPriceFrom).toLocaleString('pt-BR')}.`
            : ' Tipologia marcada como ativa para publicação.'
          : ''

      setFeedback({
        kind: 'success',
        message: `${result.data.updatedUnits} unidade(s) atualizadas para ${planName}.${publishedSuffix}`,
      })
      setSelectedUnitIds([])
      router.refresh()
    })
  }

  function createPlanFromSelection(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (selectedUnitIds.length === 0) {
      setFeedback({ kind: 'error', message: 'Selecione ao menos uma unidade para criar a nova tipologia.' })
      return
    }

    const formElement = event.currentTarget
    const formData = new FormData(formElement)

    const planNameInput = String(formData.get('newPlanName') || '').trim()
    if (!planNameInput) {
      setFeedback({ kind: 'error', message: 'Informe o nome da nova tipologia.' })
      return
    }

    const replicateToOtherBlocks = String(formData.get('replicateToOtherBlocks') || '').toLowerCase() === 'on'
    const publishCreatedPlan = String(formData.get('publishCreatedPlan') || '').toLowerCase() !== 'off'
    const isActive = String(formData.get('isActive') || '').toLowerCase() !== 'off'

    const selectedRows = selectedUnitIds
      .map((unitId) => unitById.get(unitId) || null)
      .filter((unit): unit is UnitMapItem => Boolean(unit && unit.status !== 'sold'))

    if (selectedRows.length === 0) {
      setFeedback({
        kind: 'error',
        message: 'As unidades selecionadas não estão mais disponíveis para alteração de tipologia.',
      })
      return
    }

    const selectionResolution = resolveReplicatedUnitIds(
      units,
      selectedRows.map((item) => item.id),
      replicateToOtherBlocks
    )
    if (selectionResolution.unitIds.length === 0) {
      setFeedback({
        kind: 'error',
        message: 'Não foi possível identificar unidades para aplicar a nova tipologia.',
      })
      return
    }

    const targetRows = selectionResolution.unitIds
      .map((unitId) => unitById.get(unitId) || null)
      .filter((unit): unit is UnitMapItem => Boolean(unit))
    const shape = inferPlanGenerationShape(targetRows)

    const description = String(formData.get('newPlanDescription') || '').trim()
    const roomsCount = String(formData.get('newPlanRoomsCount') || '').trim()
    const bedrooms = String(formData.get('newPlanBedrooms') || '').trim()
    const suites = String(formData.get('newPlanSuites') || '').trim()
    const bathrooms = String(formData.get('newPlanBathrooms') || '').trim()
    const parking = String(formData.get('newPlanParking') || '').trim()
    const areaM2 = String(formData.get('newPlanAreaM2') || '').trim()
    const priceFrom = String(formData.get('newPlanPriceFrom') || '').trim()

    startTransition(async () => {
      setFeedback(null)

      const createPlanFormData = new FormData()
      createPlanFormData.set('incorporationId', incorporationId)
      createPlanFormData.set('name', planNameInput)
      if (description) createPlanFormData.set('description', description)
      if (roomsCount) createPlanFormData.set('roomsCount', roomsCount)
      if (bedrooms) createPlanFormData.set('bedrooms', bedrooms)
      if (suites) createPlanFormData.set('suites', suites)
      if (bathrooms) createPlanFormData.set('bathrooms', bathrooms)
      if (parking) createPlanFormData.set('parking', parking)
      if (areaM2) createPlanFormData.set('areaM2', areaM2)
      if (priceFrom) createPlanFormData.set('priceFrom', priceFrom)
      createPlanFormData.set('blocksCount', String(shape.blocksCount))
      createPlanFormData.set('floorsPerBlock', String(shape.floorsPerBlock))
      createPlanFormData.set('unitsPerFloor', String(shape.unitsPerFloor))
      createPlanFormData.set('isActive', isActive ? 'on' : 'off')
      createPlanFormData.set('generateUnitsNow', 'off')

      const createResult = await createIncorporationPlanAction(createPlanFormData)
      if (!createResult.success) {
        setFeedback({ kind: 'error', message: createResult.error })
        return
      }

      const assignFormData = new FormData()
      assignFormData.set('incorporationId', incorporationId)
      assignFormData.set('planId', createResult.data.planId)
      assignFormData.set('unitIds', JSON.stringify(selectionResolution.unitIds))
      assignFormData.set('publishPlan', publishCreatedPlan ? 'on' : 'off')

      const assignResult = await assignPlanToExistingUnitsAction(assignFormData)
      if (!assignResult.success) {
        setFeedback({
          kind: 'error',
          message: `Tipologia criada, mas não foi possível aplicar nas unidades: ${assignResult.error}`,
        })
        return
      }

      const replicatedSuffix =
        selectionResolution.replicatedCount > 0
          ? ` Replicacao adicionou ${selectionResolution.replicatedCount} unidade(s) em outros blocos.`
          : ''
      const publishedSuffix =
        assignResult.data.publishedPlan
          ? assignResult.data.publishedPriceFrom
            ? ` Publicada com preço a partir de R$ ${Number(assignResult.data.publishedPriceFrom).toLocaleString('pt-BR')}.`
            : ' Publicada na vitrine.'
          : ''

      setFeedback({
        kind: 'success',
        message: `Nova tipologia "${planNameInput}" criada e aplicada em ${assignResult.data.updatedUnits} unidade(s).${replicatedSuffix}${publishedSuffix}`,
      })
      setSelectedUnitIds([])
      setShowCreatePlan(false)
      formElement.reset()
      router.push(`/properties/incorporations/${incorporationId}?tab=plans&plan=${createResult.data.planId}`)
      router.refresh()
    })
  }

  async function uploadPlanMediaFiles(params: {
    planId: string
    files: File[]
    titlePrefix: string
  }): Promise<{ uploaded: number; failed: number; firstError: string | null }> {
    let uploaded = 0
    let failed = 0
    let firstError: string | null = null

    for (let index = 0; index < params.files.length; index += 1) {
      const file = params.files[index]
      if (!file || file.size <= 0) continue

      const mediaFormData = new FormData()
      mediaFormData.set('incorporationId', incorporationId)
      mediaFormData.set('planId', params.planId)
      mediaFormData.set('mediaScope', 'plan')
      mediaFormData.set('title', `${params.titlePrefix} #${index + 1}`)
      mediaFormData.set('isPublic', 'on')
      mediaFormData.set('mediaFile', file)

      const mediaResult = await addIncorporationPlanMediaAction(mediaFormData)
      if (mediaResult.success) {
        uploaded += 1
      } else {
        failed += 1
        if (!firstError) firstError = mediaResult.error
      }
    }

    return { uploaded, failed, firstError }
  }

  function editSelectedFloors(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (selectedFloorNumbers.length === 0) {
      setFeedback({
        kind: 'error',
        message: 'Selecione ao menos um andar no mapa (clique no numero do andar ou nas unidades).',
      })
      return
    }

    const formElement = event.currentTarget
    const formData = new FormData(formElement)

    const floorPlanMode = String(formData.get('floorPlanMode') || 'existing').trim().toLowerCase()
    const replicateToOtherBlocks = String(formData.get('floorReplicateToOtherBlocks') || '').toLowerCase() === 'on'
    const publishFloorPlan = String(formData.get('floorPublishPlan') || '').toLowerCase() !== 'off'
    const targetUnitsPerFloorRaw = String(formData.get('floorTargetUnitsPerFloor') || '').trim()
    const targetUnitsPerFloor = Number.parseInt(targetUnitsPerFloorRaw, 10)

    if (!Number.isFinite(targetUnitsPerFloor) || targetUnitsPerFloor < 1 || targetUnitsPerFloor > 50) {
      setFeedback({ kind: 'error', message: 'Informe uma quantidade de apartamentos por andar entre 1 e 50.' })
      return
    }

    startTransition(async () => {
      setFeedback(null)

      let resolvedPlanId = ''
      let resolvedPlanName = ''
      let mediaSummary = ''

      if (floorPlanMode === 'new') {
        const newPlanName = String(formData.get('floorNewPlanName') || '').trim()
        if (!newPlanName) {
          setFeedback({ kind: 'error', message: 'Informe o nome da nova tipologia para os andares selecionados.' })
          return
        }

        const isActive = String(formData.get('floorNewPlanIsActive') || '').toLowerCase() !== 'off'
        const newPlanDescription = String(formData.get('floorNewPlanDescription') || '').trim()
        const newPlanRoomsCount = String(formData.get('floorNewPlanRoomsCount') || '').trim()
        const newPlanBedrooms = String(formData.get('floorNewPlanBedrooms') || '').trim()
        const newPlanSuites = String(formData.get('floorNewPlanSuites') || '').trim()
        const newPlanBathrooms = String(formData.get('floorNewPlanBathrooms') || '').trim()
        const newPlanParking = String(formData.get('floorNewPlanParking') || '').trim()
        const newPlanAreaM2 = String(formData.get('floorNewPlanAreaM2') || '').trim()
        const newPlanPriceFrom = String(formData.get('floorNewPlanPriceFrom') || '').trim()
        const shapeBlocks = replicateToOtherBlocks ? Math.max(towers.length, 1) : 1

        const createPlanFormData = new FormData()
        createPlanFormData.set('incorporationId', incorporationId)
        createPlanFormData.set('name', newPlanName)
        createPlanFormData.set('generateUnitsNow', 'off')
        createPlanFormData.set('isActive', isActive ? 'on' : 'off')
        createPlanFormData.set('blocksCount', String(shapeBlocks))
        createPlanFormData.set('floorsPerBlock', String(selectedFloorNumbers.length))
        createPlanFormData.set('unitsPerFloor', String(targetUnitsPerFloor))
        if (newPlanDescription) createPlanFormData.set('description', newPlanDescription)
        if (newPlanRoomsCount) createPlanFormData.set('roomsCount', newPlanRoomsCount)
        if (newPlanBedrooms) createPlanFormData.set('bedrooms', newPlanBedrooms)
        if (newPlanSuites) createPlanFormData.set('suites', newPlanSuites)
        if (newPlanBathrooms) createPlanFormData.set('bathrooms', newPlanBathrooms)
        if (newPlanParking) createPlanFormData.set('parking', newPlanParking)
        if (newPlanAreaM2) createPlanFormData.set('areaM2', newPlanAreaM2)
        if (newPlanPriceFrom) createPlanFormData.set('priceFrom', newPlanPriceFrom)

        const createPlanResult = await createIncorporationPlanAction(createPlanFormData)
        if (!createPlanResult.success) {
          setFeedback({ kind: 'error', message: createPlanResult.error })
          return
        }

        resolvedPlanId = createPlanResult.data.planId
        resolvedPlanName = newPlanName

        const mediaFiles = formData
          .getAll('floorNewPlanMediaFiles')
          .filter((item): item is File => item instanceof File && item.size > 0)
        if (mediaFiles.length > 0) {
          const mediaResult = await uploadPlanMediaFiles({
            planId: resolvedPlanId,
            files: mediaFiles,
            titlePrefix: newPlanName,
          })
          if (mediaResult.failed > 0) {
            mediaSummary = ` Mídias: ${mediaResult.uploaded} enviada(s), ${mediaResult.failed} com falha.`
            if (mediaResult.firstError) {
              mediaSummary += ` Detalhe: ${mediaResult.firstError}.`
            }
          } else {
            mediaSummary = ` Mídias: ${mediaResult.uploaded} enviada(s).`
          }
        }
      } else {
        const existingPlanId = String(formData.get('floorExistingPlanId') || '').trim()
        if (!existingPlanId) {
          setFeedback({ kind: 'error', message: 'Selecione uma tipologia existente para aplicar nos andares.' })
          return
        }
        const existingPlan = availablePlans.find((item) => item.id === existingPlanId) || null
        resolvedPlanId = existingPlanId
        resolvedPlanName = existingPlan?.name || 'tipologia selecionada'
      }

      const reconfigureFormData = new FormData()
      reconfigureFormData.set('incorporationId', incorporationId)
      reconfigureFormData.set('planId', resolvedPlanId)
      reconfigureFormData.set('sourceTower', selectedTower)
      reconfigureFormData.set('floorNumbers', JSON.stringify(selectedFloorNumbers))
      reconfigureFormData.set('targetUnitsPerFloor', String(targetUnitsPerFloor))
      reconfigureFormData.set('replicateToOtherBlocks', replicateToOtherBlocks ? 'on' : 'off')
      reconfigureFormData.set('publishPlan', publishFloorPlan ? 'on' : 'off')

      const reconfigureResult = await reconfigureIncorporationFloorsAction(reconfigureFormData)
      if (!reconfigureResult.success) {
        setFeedback({ kind: 'error', message: reconfigureResult.error })
        return
      }

      const publishedSuffix =
        reconfigureResult.data.publishedPlan
          ? reconfigureResult.data.publishedPriceFrom
            ? ` Publicada com preço a partir de R$ ${Number(reconfigureResult.data.publishedPriceFrom).toLocaleString('pt-BR')}.`
            : ' Tipologia publicada na vitrine.'
          : ''

      setFeedback({
        kind: 'success',
        message: `Andares ${selectedFloorNumbers.join(', ')} atualizados em ${reconfigureResult.data.towersAffected} bloco(s) com "${resolvedPlanName}". ${reconfigureResult.data.updatedUnits} unidade(s) ajustadas, ${reconfigureResult.data.createdUnits} criadas e ${reconfigureResult.data.blockedUnits} bloqueadas.${publishedSuffix}${mediaSummary}`,
      })
      setSelectedUnitIds([])
      setShowFloorEditor(false)
      formElement.reset()
      router.push(`/properties/incorporations/${incorporationId}?tab=plans&plan=${resolvedPlanId}`)
      router.refresh()
    })
  }

  return (
    <div className="space-y-3 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--muted)]/20 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-xs font-semibold text-[var(--foreground)]">
            Mapa de seleção por bloco/andar/coluna
          </p>
          <p className="text-[11px] text-[var(--muted-foreground)]">
            Selecione unidades no espelho para aplicar a tipologia em lote.
          </p>
        </div>
        <select
          value={selectedTower}
          onChange={(event) => {
            setSelectedTower(event.target.value)
            setSelectedUnitIds([])
          }}
          className="h-8 rounded-[var(--radius)] border border-[var(--border)] bg-white px-2 text-xs text-[var(--foreground)]"
        >
          {towers.map((tower) => (
            <option key={tower} value={tower}>
              Bloco {tower}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" disabled={isPending} className="h-8 px-2 text-xs" onClick={selectAvailableAndReserved}>
          Selecionar disponíveis/reservadas
        </Button>
        <Button type="button" disabled={isPending} className="h-8 px-2 text-xs bg-slate-600 hover:bg-slate-700" onClick={clearSelection}>
          Limpar seleção
        </Button>
        <span className="text-xs text-[var(--muted-foreground)]">
          Selecionadas: <span className="font-semibold text-[var(--foreground)]">{selectedUnitIds.length}</span>
        </span>
        <span className="text-xs text-[var(--muted-foreground)]">
          Andares selecionados: <span className="font-semibold text-[var(--foreground)]">{selectedFloorNumbers.length}</span>
        </span>
        <Button
          type="button"
          disabled={isPending || selectedUnitIds.length === 0}
          className="h-8 px-2 text-xs bg-[var(--foreground)] text-white hover:opacity-90"
          onClick={() => setShowCreatePlan((current) => !current)}
        >
          {showCreatePlan ? 'Fechar criação de tipologia' : 'Criar tipologia para selecionadas'}
        </Button>
        <Button
          type="button"
          disabled={isPending || selectedFloorNumbers.length === 0}
          className="h-8 px-2 text-xs bg-indigo-600 text-white hover:bg-indigo-700"
          onClick={() => setShowFloorEditor((current) => !current)}
        >
          {showFloorEditor ? 'Fechar editor de andares' : 'Editar andares selecionados'}
        </Button>
      </div>

      {towerUnits.length === 0 ? (
        <p className="text-sm text-[var(--muted-foreground)]">
          Nenhuma unidade no bloco selecionado.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-[var(--radius)] border border-[var(--border)] bg-white">
          <div
            className="grid min-w-[760px] gap-2 p-3"
            style={{
              gridTemplateColumns: `120px repeat(${Math.max(stacks.length, 1)}, minmax(120px, 1fr))`,
            }}
          >
            <div className="rounded border border-[var(--border)] bg-white px-2 py-2 text-xs font-semibold text-[var(--muted-foreground)]">
              Andar / Coluna
            </div>
            {stacks.map((stack) => (
              <button
                key={`stack-header-${stack}`}
                type="button"
                onClick={() => toggleStack(stack)}
                className="rounded border border-[var(--border)] bg-[var(--muted)]/30 px-2 py-2 text-center text-xs font-semibold text-[var(--foreground)] hover:bg-[var(--muted)]/50"
              >
                Coluna {stack}
              </button>
            ))}

            {floors.map((floor) => (
              <Fragment key={`floor-row-${floor}`}>
                <button
                  type="button"
                  onClick={() => toggleFloor(floor)}
                  className="rounded border border-[var(--border)] bg-white px-2 py-2 text-xs font-semibold text-[var(--foreground)] hover:bg-[var(--accent)]"
                >
                  Andar {floor}
                </button>
                {stacks.map((stack) => {
                  const unit = unitByKey.get(`${floor}:${stack}`) ?? null
                  if (!unit) {
                    return (
                      <div
                        key={`empty-${floor}-${stack}`}
                        className="rounded border border-dashed border-[var(--border)] bg-[var(--muted)]/15 px-2 py-3 text-center text-xs text-[var(--muted-foreground)]"
                      >
                        -
                      </div>
                    )
                  }

                  const isSelected = selectedSet.has(unit.id)
                  const isLockedSold = unit.status === 'sold'
                  const samePlan = unit.planId === planId

                  return (
                    <button
                      key={unit.id}
                      type="button"
                      disabled={isLockedSold}
                      onClick={() => toggleUnit(unit.id)}
                      className={`rounded border px-2 py-2 text-left text-xs transition ${statusClass(unit.status)} ${
                        isSelected ? 'ring-2 ring-[var(--primary)]' : ''
                      } ${samePlan ? 'shadow-[inset_0_0_0_1px_rgba(45,104,255,.25)]' : ''} ${
                        isLockedSold ? 'cursor-not-allowed opacity-70' : 'hover:brightness-95'
                      }`}
                      title={isLockedSold ? 'Unidade vendida: não pode trocar tipologia.' : 'Selecionar unidade'}
                    >
                      <p className="truncate font-bold">{unit.unitCode}</p>
                      <p className="truncate text-[11px]">{unit.status}</p>
                    </button>
                  )
                })}
              </Fragment>
            ))}
          </div>
        </div>
      )}

      <label className="inline-flex items-center gap-2 text-xs text-[var(--foreground)]">
        <input
          type="checkbox"
          checked={publishPlan}
          onChange={(event) => setPublishPlan(event.target.checked)}
          className="h-4 w-4 rounded border-[var(--border)]"
        />
        <span>Publicar tipologia automaticamente na vitrine</span>
      </label>

      {showCreatePlan ? (
        <form
          onSubmit={createPlanFromSelection}
          className="space-y-3 rounded-[var(--radius)] border border-[var(--border)] bg-white p-3"
        >
          <div>
            <p className="text-xs font-semibold text-[var(--foreground)]">
              Nova tipologia a partir da seleção
            </p>
            <p className="text-[11px] text-[var(--muted-foreground)]">
              Defina os dados da nova planta e aplique imediatamente nas unidades selecionadas.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <label className="grid gap-1 text-xs text-[var(--muted-foreground)] sm:col-span-2">
              <span>Nome da tipologia *</span>
              <input
                name="newPlanName"
                required
                className="h-9 rounded-[var(--radius)] border border-[var(--border)] bg-white px-3 text-sm text-[var(--foreground)]"
                placeholder="Ex: Tipo 3Q Garden"
              />
            </label>

            <label className="grid gap-1 text-xs text-[var(--muted-foreground)]">
              <span>Preço inicial</span>
              <input
                name="newPlanPriceFrom"
                type="number"
                min="0"
                step="0.01"
                className="h-9 rounded-[var(--radius)] border border-[var(--border)] bg-white px-3 text-sm text-[var(--foreground)]"
                placeholder="Ex: 550000"
              />
            </label>

            <label className="grid gap-1 text-xs text-[var(--muted-foreground)]">
              <span>Area (m2)</span>
              <input
                name="newPlanAreaM2"
                type="number"
                min="0"
                step="0.01"
                className="h-9 rounded-[var(--radius)] border border-[var(--border)] bg-white px-3 text-sm text-[var(--foreground)]"
              />
            </label>
            <label className="grid gap-1 text-xs text-[var(--muted-foreground)]">
              <span>Quartos</span>
              <input
                name="newPlanBedrooms"
                type="number"
                min="0"
                step="1"
                className="h-9 rounded-[var(--radius)] border border-[var(--border)] bg-white px-3 text-sm text-[var(--foreground)]"
              />
            </label>
            <label className="grid gap-1 text-xs text-[var(--muted-foreground)]">
              <span>Comodos</span>
              <input
                name="newPlanRoomsCount"
                type="number"
                min="0"
                step="1"
                className="h-9 rounded-[var(--radius)] border border-[var(--border)] bg-white px-3 text-sm text-[var(--foreground)]"
              />
            </label>
            <label className="grid gap-1 text-xs text-[var(--muted-foreground)]">
              <span>Suites</span>
              <input
                name="newPlanSuites"
                type="number"
                min="0"
                step="1"
                className="h-9 rounded-[var(--radius)] border border-[var(--border)] bg-white px-3 text-sm text-[var(--foreground)]"
              />
            </label>
            <label className="grid gap-1 text-xs text-[var(--muted-foreground)]">
              <span>Banheiros</span>
              <input
                name="newPlanBathrooms"
                type="number"
                min="0"
                step="1"
                className="h-9 rounded-[var(--radius)] border border-[var(--border)] bg-white px-3 text-sm text-[var(--foreground)]"
              />
            </label>
            <label className="grid gap-1 text-xs text-[var(--muted-foreground)]">
              <span>Vagas</span>
              <input
                name="newPlanParking"
                type="number"
                min="0"
                step="1"
                className="h-9 rounded-[var(--radius)] border border-[var(--border)] bg-white px-3 text-sm text-[var(--foreground)]"
              />
            </label>
          </div>

          <label className="grid gap-1 text-xs text-[var(--muted-foreground)]">
            <span>Descrição da tipologia</span>
            <textarea
              name="newPlanDescription"
              rows={2}
              className="rounded-[var(--radius)] border border-[var(--border)] bg-white px-3 py-2 text-sm text-[var(--foreground)]"
              placeholder="Diferenciais da nova planta"
            />
          </label>

          <div className="flex flex-wrap gap-4">
            <label className="inline-flex items-center gap-2 text-xs text-[var(--foreground)]">
              <input
                type="checkbox"
                name="replicateToOtherBlocks"
                className="h-4 w-4 rounded border-[var(--border)]"
              />
              <span>Replicar nos demais blocos (mesmos andares/colunas)</span>
            </label>
            <label className="inline-flex items-center gap-2 text-xs text-[var(--foreground)]">
              <input
                type="checkbox"
                name="publishCreatedPlan"
                defaultChecked
                className="h-4 w-4 rounded border-[var(--border)]"
              />
              <span>Publicar nova tipologia na vitrine</span>
            </label>
            <label className="inline-flex items-center gap-2 text-xs text-[var(--foreground)]">
              <input
                type="checkbox"
                name="isActive"
                defaultChecked
                className="h-4 w-4 rounded border-[var(--border)]"
              />
              <span>Marcar tipologia como ativa</span>
            </label>
          </div>

          <div className="flex justify-end">
            <Button type="submit" disabled={isPending || selectedUnitIds.length === 0} className="h-8 px-3 text-xs">
              {isPending ? 'Criando...' : 'Criar tipologia e aplicar'}
            </Button>
          </div>
        </form>
      ) : null}

      {showFloorEditor ? (
        <form
          onSubmit={editSelectedFloors}
          className="space-y-3 rounded-[var(--radius)] border border-[var(--border)] bg-white p-3"
        >
          <div>
            <p className="text-xs font-semibold text-[var(--foreground)]">
              Editor de andares selecionados
            </p>
            <p className="text-[11px] text-[var(--muted-foreground)]">
              Ajuste o numero de apt/andar e aplique uma tipologia existente ou crie uma nova com mídias.
            </p>
            <p className="text-[11px] text-[var(--muted-foreground)]">
              Andares alvo no bloco {selectedTower}: {selectedFloorNumbers.length > 0 ? selectedFloorNumbers.join(', ') : '-'}
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <label className="grid gap-1 text-xs text-[var(--muted-foreground)]">
              <span>Apt por andar *</span>
              <input
                name="floorTargetUnitsPerFloor"
                type="number"
                min="1"
                max="50"
                step="1"
                defaultValue={Math.max(stacks.length, 1)}
                required
                className="h-9 rounded-[var(--radius)] border border-[var(--border)] bg-white px-3 text-sm text-[var(--foreground)]"
              />
            </label>

            <label className="grid gap-1 text-xs text-[var(--muted-foreground)] sm:col-span-2">
              <span>Aplicar tipologia</span>
              <select
                name="floorExistingPlanId"
                defaultValue={planId}
                className="h-9 rounded-[var(--radius)] border border-[var(--border)] bg-white px-3 text-sm text-[var(--foreground)]"
              >
                {availablePlans.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name} {item.isActive ? '(Ativa)' : '(Inativa)'}
                  </option>
                ))}
              </select>
            </label>

            <label className="inline-flex items-end gap-2 pb-2 text-xs text-[var(--foreground)]">
              <input
                type="radio"
                name="floorPlanMode"
                value="existing"
                defaultChecked
                className="h-4 w-4 rounded border-[var(--border)]"
              />
              <span>Usar tipologia existente</span>
            </label>
          </div>

          <div className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--muted)]/20 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs font-semibold text-[var(--foreground)]">Ou criar nova tipologia para estes andares</p>
              <label className="inline-flex items-center gap-2 text-xs text-[var(--foreground)]">
                <input
                  type="radio"
                  name="floorPlanMode"
                  value="new"
                  className="h-4 w-4 rounded border-[var(--border)]"
                />
                <span>Criar nova tipologia</span>
              </label>
            </div>

            <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <label className="grid gap-1 text-xs text-[var(--muted-foreground)] sm:col-span-2">
                <span>Nome da nova tipologia</span>
                <input
                  name="floorNewPlanName"
                  className="h-9 rounded-[var(--radius)] border border-[var(--border)] bg-white px-3 text-sm text-[var(--foreground)]"
                  placeholder="Ex: Tipo Garden Andares Altos"
                />
              </label>
              <label className="grid gap-1 text-xs text-[var(--muted-foreground)]">
                <span>Preço inicial</span>
                <input
                  name="floorNewPlanPriceFrom"
                  type="number"
                  min="0"
                  step="0.01"
                  className="h-9 rounded-[var(--radius)] border border-[var(--border)] bg-white px-3 text-sm text-[var(--foreground)]"
                />
              </label>
              <label className="grid gap-1 text-xs text-[var(--muted-foreground)]">
                <span>Area (m2)</span>
                <input
                  name="floorNewPlanAreaM2"
                  type="number"
                  min="0"
                  step="0.01"
                  className="h-9 rounded-[var(--radius)] border border-[var(--border)] bg-white px-3 text-sm text-[var(--foreground)]"
                />
              </label>
              <label className="grid gap-1 text-xs text-[var(--muted-foreground)]">
                <span>Quartos</span>
                <input
                  name="floorNewPlanBedrooms"
                  type="number"
                  min="0"
                  step="1"
                  className="h-9 rounded-[var(--radius)] border border-[var(--border)] bg-white px-3 text-sm text-[var(--foreground)]"
                />
              </label>
              <label className="grid gap-1 text-xs text-[var(--muted-foreground)]">
                <span>Comodos</span>
                <input
                  name="floorNewPlanRoomsCount"
                  type="number"
                  min="0"
                  step="1"
                  className="h-9 rounded-[var(--radius)] border border-[var(--border)] bg-white px-3 text-sm text-[var(--foreground)]"
                />
              </label>
              <label className="grid gap-1 text-xs text-[var(--muted-foreground)]">
                <span>Suites</span>
                <input
                  name="floorNewPlanSuites"
                  type="number"
                  min="0"
                  step="1"
                  className="h-9 rounded-[var(--radius)] border border-[var(--border)] bg-white px-3 text-sm text-[var(--foreground)]"
                />
              </label>
              <label className="grid gap-1 text-xs text-[var(--muted-foreground)]">
                <span>Banheiros</span>
                <input
                  name="floorNewPlanBathrooms"
                  type="number"
                  min="0"
                  step="1"
                  className="h-9 rounded-[var(--radius)] border border-[var(--border)] bg-white px-3 text-sm text-[var(--foreground)]"
                />
              </label>
              <label className="grid gap-1 text-xs text-[var(--muted-foreground)]">
                <span>Vagas</span>
                <input
                  name="floorNewPlanParking"
                  type="number"
                  min="0"
                  step="1"
                  className="h-9 rounded-[var(--radius)] border border-[var(--border)] bg-white px-3 text-sm text-[var(--foreground)]"
                />
              </label>
              <label className="grid gap-1 text-xs text-[var(--muted-foreground)] sm:col-span-2">
                <span>Mídias da nova tipologia (opcional)</span>
                <input
                  name="floorNewPlanMediaFiles"
                  type="file"
                  accept="image/*,video/*"
                  multiple
                  className="block w-full text-xs text-[var(--muted-foreground)] file:mr-2 file:rounded-[var(--radius)] file:border file:border-[var(--border)] file:bg-white file:px-2 file:py-1 file:text-xs file:font-medium file:text-[var(--foreground)]"
                />
              </label>
            </div>

            <label className="mt-3 grid gap-1 text-xs text-[var(--muted-foreground)]">
              <span>Descrição da nova tipologia</span>
              <textarea
                name="floorNewPlanDescription"
                rows={2}
                className="rounded-[var(--radius)] border border-[var(--border)] bg-white px-3 py-2 text-sm text-[var(--foreground)]"
                placeholder="Diferenciais e acabamento"
              />
            </label>
          </div>

          <div className="flex flex-wrap gap-4">
            <label className="inline-flex items-center gap-2 text-xs text-[var(--foreground)]">
              <input
                type="checkbox"
                name="floorReplicateToOtherBlocks"
                defaultChecked
                className="h-4 w-4 rounded border-[var(--border)]"
              />
              <span>Replicar configuração para os demais blocos</span>
            </label>
            <label className="inline-flex items-center gap-2 text-xs text-[var(--foreground)]">
              <input
                type="checkbox"
                name="floorPublishPlan"
                defaultChecked
                className="h-4 w-4 rounded border-[var(--border)]"
              />
              <span>Publicar tipologia apos editar andares</span>
            </label>
            <label className="inline-flex items-center gap-2 text-xs text-[var(--foreground)]">
              <input
                type="checkbox"
                name="floorNewPlanIsActive"
                defaultChecked
                className="h-4 w-4 rounded border-[var(--border)]"
              />
              <span>Nova tipologia ativa</span>
            </label>
          </div>

          <div className="flex justify-end">
            <Button type="submit" disabled={isPending || selectedFloorNumbers.length === 0} className="h-8 px-3 text-xs">
              {isPending ? 'Salvando andares...' : 'Salvar configuração dos andares'}
            </Button>
          </div>
        </form>
      ) : null}

      {feedback ? (
        <p
          className={`rounded-[var(--radius)] border px-2 py-1 text-xs ${
            feedback.kind === 'success'
              ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
              : 'border-rose-200 bg-rose-50 text-rose-700'
          }`}
        >
          {feedback.message}
        </p>
      ) : null}

      <Button type="button" disabled={isPending || selectedUnitIds.length === 0} className="h-8 px-3 text-xs" onClick={applyBatch}>
        {isPending ? 'Aplicando...' : 'Aplicar tipologia nas unidades selecionadas'}
      </Button>
    </div>
  )
}
