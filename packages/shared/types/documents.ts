export type DocumentStatus =
  | 'pending'
  | 'validated'
  | 'rejected'
  | 'approved'
  | 'active'
  | string

export type DocumentEntityType =
  | 'person'
  | 'property'
  | 'group'
  | 'lead'
  | 'client'
  | string

export type Document = {
  id: string
  title: string | null
  doc_type: string
  status: DocumentStatus | null
  notes?: string | null
  issued_at?: string | null
  expires_at?: string | null
  created_at: string
  updated_at?: string | null
}

export type DocumentInput = Omit<Document, 'id' | 'created_at' | 'updated_at'>

export type DocumentLink = {
  id: string
  document_id: string
  entity_type: DocumentEntityType
  entity_id: string
  created_at: string
}

export type DocumentLinkInput = Omit<DocumentLink, 'id' | 'created_at'>

export type DocumentWithLinks = Document & { links?: DocumentLink[] }
