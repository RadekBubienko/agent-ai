import type { TaskConfig } from "@/types/agent"

const GRAPH_API_BASE_URL = "https://graph.facebook.com/v19.0"
const GRAPH_API_TIMEOUT_MS = 8_000

type GraphApiEdge<T> = {
  data: T[]
  paging?: {
    cursors?: {
      before?: string
      after?: string
    }
  }
}

type GraphApiErrorPayload = {
  message: string
  type?: string
  code?: number
  error_subcode?: number
}

type GraphApiEnvelope<T> = T & {
  error?: GraphApiErrorPayload
}

export type InstagramOwnedAccount = {
  pageId: string
  pageName?: string
  igUserId: string
  igUsername?: string
}

export type InstagramMedia = {
  id: string
  caption?: string
  comments_count?: number
  like_count?: number
  media_product_type?: string
  media_type?: string
  permalink?: string
  timestamp: string
}

export type InstagramComment = {
  id: string
  text?: string
  timestamp?: string
  from?: {
    id?: string
    username?: string
  }
}

export type InstagramSettings = {
  pageId: string | null
  daysBack: number
  includeComments: boolean
}

class InstagramGraphApiError extends Error {
  code?: number
  errorSubcode?: number
  errorType?: string

  constructor(message: string, payload: GraphApiErrorPayload = { message }) {
    super(message)
    this.name = "InstagramGraphApiError"
    this.code = payload.code
    this.errorSubcode = payload.error_subcode
    this.errorType = payload.type
  }
}

export function getOwnedInstagramSettings(config: TaskConfig): InstagramSettings {
  const customPageId = config.instagram?.page_id?.trim()

  return {
    pageId: customPageId || getConfiguredInstagramPageId() || null,
    daysBack: clampNumber(config.instagram?.days_back, 30, 1, 365),
    includeComments: config.instagram?.include_comments ?? true,
  }
}

export function getConfiguredInstagramPageId() {
  return (
    process.env.INSTAGRAM_PAGE_ID?.trim() ||
    process.env.FACEBOOK_PAGE_ID?.trim() ||
    null
  )
}

function getConfiguredInstagramToken() {
  return (
    process.env.INSTAGRAM_PAGE_TOKEN?.trim() ||
    process.env.FACEBOOK_TOKEN?.trim() ||
    null
  )
}

export async function fetchOwnedInstagramAccount(pageId: string) {
  const page = await instagramGraphApiRequest<{
    id: string
    name?: string
    instagram_business_account?: {
      id: string
      username?: string
    } | null
  }>(pageId, {
    fields: "id,name,instagram_business_account{id,username}",
  })

  if (!page.instagram_business_account?.id) {
    return null
  }

  return {
    pageId: page.id,
    pageName: page.name,
    igUserId: page.instagram_business_account.id,
    igUsername: page.instagram_business_account.username,
  } satisfies InstagramOwnedAccount
}

export async function collectInstagramMedia(
  igUserId: string,
  maxItems: number,
) {
  return collectGraphEdgeItems<InstagramMedia>(
    `${igUserId}/media`,
    "id,caption,comments_count,like_count,media_product_type,media_type,permalink,timestamp",
    maxItems,
  )
}

export async function collectInstagramComments(
  mediaId: string,
  maxItems: number,
) {
  return collectGraphEdgeItems<InstagramComment>(
    `${mediaId}/comments`,
    "id,from,text,timestamp",
    maxItems,
  )
}

async function collectGraphEdgeItems<T>(
  path: string,
  fields: string,
  maxItems: number,
) {
  const items: T[] = []
  let after: string | undefined

  while (items.length < maxItems) {
    const response = await instagramGraphApiRequest<GraphApiEdge<T>>(path, {
      after,
      limit: Math.min(maxItems - items.length, 100),
      fields,
    })

    items.push(...response.data)
    after = response.paging?.cursors?.after

    if (!after || response.data.length === 0) {
      break
    }
  }

  return items.slice(0, maxItems)
}

async function instagramGraphApiRequest<T>(
  path: string,
  params: Record<string, string | number | undefined>,
) {
  const token = getConfiguredInstagramToken()

  if (!token) {
    throw new InstagramGraphApiError("Missing Instagram/Page access token")
  }

  const url = new URL(`${GRAPH_API_BASE_URL}/${path}`)
  url.searchParams.set("access_token", token)

  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === "") {
      continue
    }

    url.searchParams.set(key, String(value))
  }

  const res = await fetch(url, {
    cache: "no-store",
    headers: {
      Accept: "application/json",
    },
    signal: AbortSignal.timeout(GRAPH_API_TIMEOUT_MS),
  })

  let payload: GraphApiEnvelope<T>

  try {
    payload = (await res.json()) as GraphApiEnvelope<T>
  } catch {
    throw new InstagramGraphApiError(
      "Instagram Graph API returned invalid JSON",
    )
  }

  if (!res.ok || payload.error) {
    throw new InstagramGraphApiError(
      payload.error?.message || `Instagram Graph API error ${res.status}`,
      payload.error,
    )
  }

  return payload
}

function clampNumber(
  value: number | undefined,
  fallback: number,
  min: number,
  max: number,
) {
  const safeValue = Number.isFinite(value) ? Number(value) : fallback
  return Math.min(Math.max(safeValue, min), max)
}

export function getMaxInstagramMediaToInspect(speed?: string) {
  if (speed === "fast") return 12
  if (speed === "slow") return 50
  return 24
}

export function getMaxInstagramCommentsPerMedia(speed?: string) {
  if (speed === "fast") return 12
  if (speed === "slow") return 60
  return 28
}
