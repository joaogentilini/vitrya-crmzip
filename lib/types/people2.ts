export type PersonBase = {
  id: string
  person_id: string
  created_at: string
  updated_at?: string | null
}

export const PERSON_KIND_TAGS = ['proprietario', 'corretor', 'fornecedor', 'parceiro'] as const
export type PersonKindTag = (typeof PERSON_KIND_TAGS)[number]
export const LEGACY_KIND_TAG_MAP: Record<string, PersonKindTag> = {
  vendedor: 'proprietario'
}

const PERSON_KIND_TAG_SET = new Set(PERSON_KIND_TAGS)

export function normalizePersonKindTags(
  tags: Array<string | null | undefined> | null | undefined
): PersonKindTag[] {
  if (!tags || tags.length === 0) return []
  const normalized: PersonKindTag[] = []

  for (const raw of tags) {
    if (!raw) continue
    const trimmed = String(raw).trim()
    if (!trimmed) continue
    const mapped = LEGACY_KIND_TAG_MAP[trimmed] ?? trimmed
    if (PERSON_KIND_TAG_SET.has(mapped as PersonKindTag)) {
      normalized.push(mapped as PersonKindTag)
    }
  }

  return Array.from(new Set(normalized))
}

export type PersonProfile = PersonBase & Record<string, unknown>
export type PersonContact = PersonBase & Record<string, unknown>
export type PersonAddress = PersonBase & Record<string, unknown>
export type PersonFinancial = PersonBase & Record<string, unknown>
export type PersonSpouse = PersonBase & Record<string, unknown>
export type PersonDocument = PersonBase & Record<string, unknown>
export type PersonSearchProfile = PersonBase & Record<string, unknown>

export type PersonProfileInput = Omit<
  PersonProfile,
  'id' | 'person_id' | 'created_at' | 'updated_at'
>
export type PersonContactInput = Omit<
  PersonContact,
  'id' | 'person_id' | 'created_at' | 'updated_at'
>
export type PersonAddressInput = Omit<
  PersonAddress,
  'id' | 'person_id' | 'created_at' | 'updated_at'
>
export type PersonFinancialInput = Omit<
  PersonFinancial,
  'id' | 'person_id' | 'created_at' | 'updated_at'
>
export type PersonSpouseInput = Omit<
  PersonSpouse,
  'id' | 'person_id' | 'created_at' | 'updated_at'
>
export type PersonDocumentInput = Omit<
  PersonDocument,
  'id' | 'person_id' | 'created_at' | 'updated_at'
>
export type PersonSearchProfileInput = Omit<
  PersonSearchProfile,
  'id' | 'person_id' | 'created_at' | 'updated_at'
>

export type Person2Bundle = {
  profile: PersonProfile | null
  contacts: PersonContact[]
  addresses: PersonAddress[]
  financial: PersonFinancial | null
  spouse: PersonSpouse | null
  documents: PersonDocument[]
  search_profile: PersonSearchProfile | null
}
