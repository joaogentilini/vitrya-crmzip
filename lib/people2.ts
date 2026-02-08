import { createClient } from './supabaseServer'
import {
  Person2Bundle,
  PersonProfile,
  PersonProfileInput,
  PersonFinancial,
  PersonFinancialInput,
  PersonSpouse,
  PersonSpouseInput,
  PersonContact,
  PersonContactInput,
  PersonAddress,
  PersonAddressInput,
  PersonDocument,
  PersonDocumentInput,
  PersonSearchProfile,
  PersonSearchProfileInput
} from '@/lib/types/people2'

const TABLES = {
  profile: 'person_profile',
  contacts: 'person_contacts',
  addresses: 'person_addresses',
  financial: 'person_financial',
  spouse: 'person_spouse',
  documents: 'person_documents',
  searchProfile: 'person_search_profile',
}

export { normalizePersonKindTags, PERSON_KIND_TAGS } from '@/lib/types/people2'
export type { PersonKindTag } from '@/lib/types/people2'

export async function getPerson2Bundle(personId: string): Promise<Person2Bundle> {
  const supabase = await createClient()

  const profileQuery = supabase
    .from(TABLES.profile)
    .select('*')
    .eq('person_id', personId)
    .maybeSingle()

  const contactsQuery = supabase
    .from(TABLES.contacts)
    .select('*')
    .eq('person_id', personId)
    .order('created_at', { ascending: true })

  const addressesQuery = supabase
    .from(TABLES.addresses)
    .select('*')
    .eq('person_id', personId)
    .order('created_at', { ascending: true })

  const financialQuery = supabase
    .from(TABLES.financial)
    .select('*')
    .eq('person_id', personId)
    .maybeSingle()

  const spouseQuery = supabase
    .from(TABLES.spouse)
    .select('*')
    .eq('person_id', personId)
    .maybeSingle()

  const documentsQuery = supabase
    .from(TABLES.documents)
    .select('*')
    .eq('person_id', personId)
    .order('created_at', { ascending: true })

  const searchProfileQuery = supabase
    .from(TABLES.searchProfile)
    .select('*')
    .eq('person_id', personId)
    .maybeSingle()

  const [profileRes, contactsRes, addressesRes, financialRes, spouseRes, documentsRes, searchProfileRes] =
    await Promise.all([
      profileQuery,
      contactsQuery,
      addressesQuery,
      financialQuery,
      spouseQuery,
      documentsQuery,
      searchProfileQuery,
    ])

  if (profileRes.error) throw new Error('Erro ao buscar perfil')
  if (contactsRes.error) throw new Error('Erro ao buscar contatos')
  if (addressesRes.error) throw new Error('Erro ao buscar endereços')
  if (financialRes.error) throw new Error('Erro ao buscar financeiro')
  if (spouseRes.error) throw new Error('Erro ao buscar cônjuge')
  if (documentsRes.error) throw new Error('Erro ao buscar documentos')
  if (searchProfileRes.error) throw new Error('Erro ao buscar perfil de busca')

  return {
    profile: (profileRes.data as PersonProfile | null) ?? null,
    contacts: (contactsRes.data as PersonContact[]) ?? [],
    addresses: (addressesRes.data as PersonAddress[]) ?? [],
    financial: (financialRes.data as PersonFinancial | null) ?? null,
    spouse: (spouseRes.data as PersonSpouse | null) ?? null,
    documents: (documentsRes.data as PersonDocument[]) ?? [],
    search_profile: (searchProfileRes.data as PersonSearchProfile | null) ?? null,
  }
}

export async function upsertPersonProfile(
  personId: string,
  payload: PersonProfileInput
): Promise<PersonProfile> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from(TABLES.profile)
    .upsert({ ...payload, person_id: personId }, { onConflict: 'person_id' })
    .select('*')
    .single()

  if (error || !data) throw new Error('Erro ao salvar perfil')

  return data as PersonProfile
}

export async function setPersonFinancial(
  personId: string,
  payload: PersonFinancialInput
): Promise<PersonFinancial> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from(TABLES.financial)
    .upsert({ ...payload, person_id: personId }, { onConflict: 'person_id' })
    .select('*')
    .single()

  if (error || !data) throw new Error('Erro ao salvar financeiro')

  return data as PersonFinancial
}

export async function setPersonSpouse(
  personId: string,
  payload: PersonSpouseInput
): Promise<PersonSpouse> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from(TABLES.spouse)
    .upsert({ ...payload, person_id: personId }, { onConflict: 'person_id' })
    .select('*')
    .single()

  if (error || !data) throw new Error('Erro ao salvar cônjuge')

  return data as PersonSpouse
}

export async function listPersonContacts(personId: string): Promise<PersonContact[]> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from(TABLES.contacts)
    .select('*')
    .eq('person_id', personId)
    .order('created_at', { ascending: true })

  if (error) throw new Error('Erro ao buscar contatos')

  return (data as PersonContact[]) ?? []
}

export async function addPersonContact(
  personId: string,
  payload: PersonContactInput
): Promise<PersonContact> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from(TABLES.contacts)
    .insert({ ...payload, person_id: personId })
    .select('*')
    .single()

  if (error || !data) throw new Error('Erro ao adicionar contato')

  return data as PersonContact
}

export async function updatePersonContact(
  id: string,
  payload: Partial<PersonContactInput>
): Promise<PersonContact> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from(TABLES.contacts)
    .update(payload)
    .eq('id', id)
    .select('*')
    .single()

  if (error || !data) throw new Error('Erro ao atualizar contato')

  return data as PersonContact
}

export async function deletePersonContact(id: string): Promise<void> {
  const supabase = await createClient()

  const { error } = await supabase.from(TABLES.contacts).delete().eq('id', id)

  if (error) throw new Error('Erro ao remover contato')
}

export async function listPersonAddresses(personId: string): Promise<PersonAddress[]> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from(TABLES.addresses)
    .select('*')
    .eq('person_id', personId)
    .order('created_at', { ascending: true })

  if (error) throw new Error('Erro ao buscar endereços')

  return (data as PersonAddress[]) ?? []
}

export async function addPersonAddress(
  personId: string,
  payload: PersonAddressInput
): Promise<PersonAddress> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from(TABLES.addresses)
    .insert({ ...payload, person_id: personId })
    .select('*')
    .single()

  if (error || !data) throw new Error('Erro ao adicionar endereço')

  return data as PersonAddress
}

export async function updatePersonAddress(
  id: string,
  payload: Partial<PersonAddressInput>
): Promise<PersonAddress> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from(TABLES.addresses)
    .update(payload)
    .eq('id', id)
    .select('*')
    .single()

  if (error || !data) throw new Error('Erro ao atualizar endereço')

  return data as PersonAddress
}

export async function deletePersonAddress(id: string): Promise<void> {
  const supabase = await createClient()

  const { error } = await supabase.from(TABLES.addresses).delete().eq('id', id)

  if (error) throw new Error('Erro ao remover endereço')
}

export async function listPersonDocuments(personId: string): Promise<PersonDocument[]> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from(TABLES.documents)
    .select('*')
    .eq('person_id', personId)
    .order('created_at', { ascending: true })

  if (error) throw new Error('Erro ao buscar documentos')

  return (data as PersonDocument[]) ?? []
}

export async function addPersonDocument(
  personId: string,
  payload: PersonDocumentInput
): Promise<PersonDocument> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from(TABLES.documents)
    .insert({ ...payload, person_id: personId })
    .select('*')
    .single()

  if (error || !data) throw new Error('Erro ao adicionar documento')

  return data as PersonDocument
}

export async function updatePersonDocument(
  id: string,
  payload: Partial<PersonDocumentInput>
): Promise<PersonDocument> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from(TABLES.documents)
    .update(payload)
    .eq('id', id)
    .select('*')
    .single()

  if (error || !data) throw new Error('Erro ao atualizar documento')

  return data as PersonDocument
}

export async function deletePersonDocument(id: string): Promise<void> {
  const supabase = await createClient()

  const { error } = await supabase.from(TABLES.documents).delete().eq('id', id)

  if (error) throw new Error('Erro ao remover documento')
}

export async function upsertPersonSearchProfile(
  personId: string,
  payload: PersonSearchProfileInput
): Promise<PersonSearchProfile> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from(TABLES.searchProfile)
    .upsert({ ...payload, person_id: personId }, { onConflict: 'person_id' })
    .select('*')
    .single()

  if (error || !data) throw new Error('Erro ao salvar perfil de busca')

  return data as PersonSearchProfile
}
