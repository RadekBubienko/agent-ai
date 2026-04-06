import type { Pool, PoolConnection } from "mysql2/promise"

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
  facebook?: {
    page_id?: string
    days_back?: number
    scan_entire_page?: boolean
    include_comments?: boolean
    include_reactions?: boolean
  }
  limit: number
  speed: string
}

export type DbClient = Pool | PoolConnection

export type LeadInput = {
  name?: string | null
  email?: string | null
  website?: string | null
  source?: string | null
  platform?: string | null
}

export type SaveLeadResult = {
  id: number | null
  created: boolean
  reason?: "duplicate" | "rejected" | null
}

export type LeadScore = {
  fit_score: number
  intent_score: number
  engagement_score: number
  total_score: number
  segment: "cold" | "warm" | "hot"
}

export type JobRunContext = {
  startedAt: number
  softDeadlineAt: number
  stoppedEarly: boolean
}
