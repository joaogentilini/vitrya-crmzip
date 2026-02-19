export type IncorporationUnitStatus = 'available' | 'reserved' | 'sold' | 'blocked' | string

export type IncorporationUnitVm = {
  id: string
  incorporationId: string
  planId: string | null
  unitCode: string
  tower: string | null
  floor: number
  stack: string
  bedrooms: number | null
  suites: number | null
  bathrooms: number | null
  parking: number | null
  areaM2: number | null
  listPrice: number | null
  status: IncorporationUnitStatus
  reservedByUserId: string | null
  reservationExpiresAt: string | null
}

export type UnitReservationVm = {
  id: string
  unitId: string
  brokerUserId: string
  brokerLabel: string | null
  leadId: string | null
  leadLabel: string | null
  planLabel: string | null
  notes: string | null
  status: string
  expiresAt: string
  createdAt: string
  updatedAt: string
  unitCode: string | null
  floor: number | null
  stack: string | null
  listPrice: number | null
}

export type ReservationLeadOptionVm = {
  id: string
  clientName: string
  phone: string | null
  email: string | null
}
