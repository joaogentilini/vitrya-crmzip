export type PropertyLocationSource = 'manual_pin' | 'autocomplete' | 'device_gps'

export type AmenitySnapshotTopItem = {
  name: string
  distance_m: number | null
  vicinity: string | null
  place_id: string | null
}

export type AmenitySnapshotCategory = {
  key: string
  label: string
  count: number
  top: AmenitySnapshotTopItem[]
}

export type AmenitiesSnapshotData = {
  radius_m: number
  categories: AmenitySnapshotCategory[]
}

