export type CampaignProperty = {
  id: string
  title: string | null
  status: string | null
  city: string | null
  neighborhood: string | null
  property_category_id: string | null

  // path no DB (storage)
  cover_media_url: string | null

  // signed url (derivado)
  cover_url: string | null

  created_at: string
  property_categories?: { id: string; name: string } | null
}

export type CampaignTask = {
  id: string
  property_id: string
  day_offset: number
  title: string
  channel: string
  is_required: boolean
  due_date: string
  done_at: string | null
  whatsapp_text: string | null
  reel_script: string | null
  ads_checklist: string | null
  position: number
  created_at: string
}
