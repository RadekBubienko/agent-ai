export type TaskConfig = {
  geo: {
    mode: string
    country: string
    region: string
    city: string
    radius_km: number
  }
  industry: {
    keywords: string[]
    pkd: string[]
  }
  entity_type: string[]
  sources: string[]
  quality_filters: {
    email_required: boolean
    phone_required: boolean
    website_required: boolean
  }
  limit: number
  speed: string
}