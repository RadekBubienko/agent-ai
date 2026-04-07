import { createHash } from "crypto"
import type { DbClient, JobRunContext, TaskConfig } from "@/types/agent"
import { saveLead } from "../saveLead"
import { hasTimeBudgetExpired, markStoppedEarly } from "../runtime"
import { logTaskEvent } from "../taskLogs"

const GRAPH_API_BASE_URL = "https://graph.facebook.com/v19.0"
const GRAPH_API_TIMEOUT_MS = 8000

const GENERAL_SIGNAL_MARKERS = [
  "zdrow",
  "urod",
  "wellness",
  "biohack",
  "fotostymul",
  "regener",
  "samolecz",
  "terap",
  "suplement",
  "odporn",
  "skora",
  "wlos",
  "mlm",
  "lifewave",
  "lr health",
]

const INTENT_MARKERS = [
  "szukam",
  "szuka",
  "polecacie",
  "polecasz",
  "czy ktos",
  "czy ktos z was",
  "czy warto",
  "jak to dziala",
  "jak dziala",
  "pomaga",
  "pomoc",
  "mam problem",
  "mam pytanie",
  "chcialabym",
  "chcialbym",
  "potrzebuje",
  "interesuje mnie",
]

const STRONG_INTENT_MARKERS = [
  "szukam",
  "polecacie",
  "mam problem",
  "potrzebuje",
  "czy warto",
  "czy ktos",
]

const LIGHT_ENGAGEMENT_MARKERS = [
  "poprosze",
  "prosze",
  "pw",
  "priv",
  "dm",
  "link",
  "info",
  "szczegoly",
  "cena",
  "gdzie",
  "jak",
  "ile",
]

type GraphApiEdge<T> = {
  data: T[]
  paging?: {
    cursors?: {
      before?: string
      after?: string
    }
    next?: string
  }
}

type GraphApiErrorPayload = {
  message: string
  type?: string
  code?: number
  error_subcode?: number
  fbtrace_id?: string
}

type GraphApiEnvelope<T> = T & {
  error?: GraphApiErrorPayload
}

type FacebookPageMeta = {
  id: string
  name?: string
  link?: string
  fan_count?: number
}

type FacebookAttachment = {
  description?: string
  media_type?: string
  title?: string
  url?: string
}

type FacebookPost = {
  id: string
  created_time: string
  message?: string
  permalink_url?: string
  attachments?: {
    data?: FacebookAttachment[]
  }
}

type FacebookComment = {
  id: string
  created_time: string
  like_count?: number
  message?: string
  permalink_url?: string
  from?: {
    id: string
    name: string
  }
}

type FacebookReaction = {
  id?: string
  name?: string
  type?: string
}

type OwnedPageSettings = {
  pageId: string | null
  daysBack: number
  scanEntirePage: boolean
  includeComments: boolean
  includeReactions: boolean
}

type SignalEvaluation = {
  normalizedText: string
  keywordMatches: string[]
  generalSignalCount: number
  intentSignalCount: number
  strongIntent: boolean
}

type OwnedPageStats = {
  postsFetched: number
  postsInspected: number
  postsMatchedSignal: number
  postsSkippedTooOld: number
  postsSkippedNoSignal: number
  commentsFetched: number
  reactionsFetched: number
  commentCandidatesMatched: number
  reactionCandidatesMatched: number
  savedFromComments: number
  savedFromReactions: number
  skippedDuplicateActorInRun: number
  skippedExistingLead: number
  skippedRejectedLead: number
  reactionCollectionDisabled: boolean
}

class FacebookGraphApiError extends Error {
  code?: number
  errorSubcode?: number
  errorType?: string

  constructor(message: string, payload: GraphApiErrorPayload = { message }) {
    super(message)
    this.name = "FacebookGraphApiError"
    this.code = payload.code
    this.errorSubcode = payload.error_subcode
    this.errorType = payload.type
  }
}

export async function crawlFacebook(
  db: DbClient,
  config: TaskConfig,
  taskId: string,
  context: JobRunContext,
) {
  console.log("Facebook owned page crawler started")

  const token = getConfiguredFacebookToken()
  const settings = getOwnedPageSettings(config)
  const limit = config.limit || 50
  const normalizedKeywords = uniqueNormalizedStrings(
    (config.industry?.keywords || []).map(normalizeSignalText).filter(Boolean),
  )
  const effectiveScanEntirePage =
    settings.scanEntirePage || normalizedKeywords.length === 0
  const maxPostsToInspect = getMaxPostsToInspect(config.speed)
  const postsPerPage = getPostsPerPage(config.speed)
  const maxCommentsPerPost = getMaxCommentsPerPost(config.speed)
  const maxReactionsPerPost = getMaxReactionsPerPost(config.speed)
  const seenActorIds = new Set<string>()
  const stats: OwnedPageStats = {
    postsFetched: 0,
    postsInspected: 0,
    postsMatchedSignal: 0,
    postsSkippedTooOld: 0,
    postsSkippedNoSignal: 0,
    commentsFetched: 0,
    reactionsFetched: 0,
    commentCandidatesMatched: 0,
    reactionCandidatesMatched: 0,
    savedFromComments: 0,
    savedFromReactions: 0,
    skippedDuplicateActorInRun: 0,
    skippedExistingLead: 0,
    skippedRejectedLead: 0,
    reactionCollectionDisabled: false,
  }
  let leadsSaved = 0
  let reactionsSupported = settings.includeReactions

  await logTaskEvent(taskId, "Facebook Owned Page: start huntera", {
    details: {
      pageId: settings.pageId,
      daysBack: settings.daysBack,
      scanEntirePage: effectiveScanEntirePage,
      includeComments: settings.includeComments,
      includeReactions: settings.includeReactions,
      keywords: normalizedKeywords,
      limit,
      tokenFingerprint: getTokenFingerprint(token),
    },
  })

  if (!token) {
    await logTaskEvent(taskId, "Facebook Owned Page: brak FACEBOOK_TOKEN", {
      level: "error",
    })
    return 0
  }

  if (!settings.pageId) {
    await logTaskEvent(taskId, "Facebook Owned Page: brak PAGE_ID strony", {
      level: "error",
    })
    return 0
  }

  if (!settings.includeComments && !settings.includeReactions) {
    await logTaskEvent(taskId, "Facebook Owned Page: brak aktywnych zrodel sygnalow", {
      level: "warn",
      details: {
        includeComments: settings.includeComments,
        includeReactions: settings.includeReactions,
      },
    })
    return 0
  }

  if (
    config.quality_filters.email_required ||
    config.quality_filters.phone_required
  ) {
    await logTaskEvent(
      taskId,
      "Facebook Owned Page: filtry email/telefon sa pomijane dla leadow social",
      {
        level: "warn",
        details: {
          emailRequired: config.quality_filters.email_required,
          phoneRequired: config.quality_filters.phone_required,
        },
      },
    )
  }

  if (!settings.scanEntirePage && normalizedKeywords.length === 0) {
    await logTaskEvent(
      taskId,
      "Facebook Owned Page: brak slow kluczowych, wlaczam skan calej strony",
      {
        level: "warn",
      },
    )
  }

  let pageMeta: FacebookPageMeta

  try {
    pageMeta = await fetchPageMeta(settings.pageId)
  } catch (error) {
    await logFacebookApiError(taskId, "Facebook Owned Page: nie mozna pobrac danych strony", error, {
      pageId: settings.pageId,
    })
    return 0
  }

  await logTaskEvent(taskId, "Facebook Owned Page: strona potwierdzona", {
    details: {
      id: pageMeta.id,
      name: pageMeta.name,
      link: pageMeta.link,
      fanCount: pageMeta.fan_count,
    },
  })

  const cutoffTime = Date.now() - settings.daysBack * 24 * 60 * 60 * 1000
  let afterCursor: string | undefined
  let reachedCutoff = false

  while (!reachedCutoff) {
    if (
      leadsSaved >= limit ||
      stats.postsInspected >= maxPostsToInspect ||
      hasTimeBudgetExpired(context, 45_000)
    ) {
      if (hasTimeBudgetExpired(context, 45_000)) {
        markStoppedEarly(context)
        await logTaskEvent(taskId, "Facebook Owned Page: zatrzymano przez limit czasu", {
          level: "warn",
          details: {
            leadsSaved,
            postsInspected: stats.postsInspected,
          },
        })
      }

      break
    }

    let postEdge: GraphApiEdge<FacebookPost>

    try {
      postEdge = await fetchPagePosts(settings.pageId, postsPerPage, afterCursor)
    } catch (error) {
      await logFacebookApiError(taskId, "Facebook Owned Page: blad pobierania postow", error, {
        pageId: settings.pageId,
      })
      break
    }

    if (postEdge.data.length === 0) {
      break
    }

    stats.postsFetched += postEdge.data.length

    for (const post of postEdge.data) {
      if (
        leadsSaved >= limit ||
        stats.postsInspected >= maxPostsToInspect ||
        hasTimeBudgetExpired(context, 15_000)
      ) {
        if (hasTimeBudgetExpired(context, 15_000)) {
          markStoppedEarly(context)
          await logTaskEvent(
            taskId,
            "Facebook Owned Page: zatrzymano przed kolejnym postem",
            {
              level: "warn",
              details: {
                leadsSaved,
                postsInspected: stats.postsInspected,
              },
            },
          )
        }

        break
      }

      const createdAt = Date.parse(post.created_time)

      if (Number.isFinite(createdAt) && createdAt < cutoffTime) {
        stats.postsSkippedTooOld++
        reachedCutoff = true
        break
      }

      stats.postsInspected++

      const postText = buildPostText(post)
      const postSignal = evaluateSignal(postText, normalizedKeywords)
      const postMatchesSignal =
        postSignal.keywordMatches.length > 0 ||
        postSignal.strongIntent ||
        postSignal.generalSignalCount >= 2

      if (postMatchesSignal) {
        stats.postsMatchedSignal++
      }

      if (!effectiveScanEntirePage && !postMatchesSignal) {
        stats.postsSkippedNoSignal++
        continue
      }

      if (settings.includeComments) {
        const comments = await safelyCollectComments(
          taskId,
          post.id,
          post.permalink_url,
          maxCommentsPerPost,
        )

        stats.commentsFetched += comments.length

        for (const comment of comments) {
          if (
            leadsSaved >= limit ||
            hasTimeBudgetExpired(context, 10_000)
          ) {
            break
          }

          if (!comment.from?.id || !comment.from.name) {
            continue
          }

          if (comment.from.id === settings.pageId) {
            continue
          }

          if (seenActorIds.has(comment.from.id)) {
            stats.skippedDuplicateActorInRun++
            continue
          }

          const commentSignal = evaluateSignal(comment.message ?? "", normalizedKeywords)
          const reason = getCommentLeadReason(
            postSignal,
            commentSignal,
            effectiveScanEntirePage,
          )

          if (!reason) {
            continue
          }

          stats.commentCandidatesMatched++

          const saved = await saveOwnedPageLead(
            db,
            taskId,
            {
              actorId: comment.from.id,
              actorName: comment.from.name,
              reason,
              postUrl: post.permalink_url ?? null,
              postId: post.id,
              preview: previewText(comment.message),
              signalKeywords: uniqueNormalizedStrings([
                ...postSignal.keywordMatches,
                ...commentSignal.keywordMatches,
              ]),
            },
            seenActorIds,
            stats,
          )

          if (saved) {
            leadsSaved++
            stats.savedFromComments++
          }
        }
      }

      if (reactionsSupported && settings.includeReactions) {
        const reactionReason = getReactionLeadReason(
          postSignal,
          effectiveScanEntirePage,
        )

        if (reactionReason) {
          try {
            const reactions = await collectGraphEdgeItems<FacebookReaction>(
              `${post.id}/reactions`,
              "id,name,type",
              maxReactionsPerPost,
            )

            stats.reactionsFetched += reactions.length

            for (const reaction of reactions) {
              if (
                leadsSaved >= limit ||
                hasTimeBudgetExpired(context, 10_000)
              ) {
                break
              }

              if (!reaction.id || !reaction.name) {
                continue
              }

              if (reaction.id === settings.pageId) {
                continue
              }

              if (seenActorIds.has(reaction.id)) {
                stats.skippedDuplicateActorInRun++
                continue
              }

              stats.reactionCandidatesMatched++

              const saved = await saveOwnedPageLead(
                db,
                taskId,
                {
                  actorId: reaction.id,
                  actorName: reaction.name,
                  reason: `${reactionReason}:${reaction.type ?? "reaction"}`,
                  postUrl: post.permalink_url ?? null,
                  postId: post.id,
                  preview: previewText(postText),
                  signalKeywords: [...postSignal.keywordMatches],
                },
                seenActorIds,
                stats,
              )

              if (saved) {
                leadsSaved++
                stats.savedFromReactions++
              }
            }
          } catch (error) {
            reactionsSupported = false
            stats.reactionCollectionDisabled = true
            await logFacebookApiError(
              taskId,
              "Facebook Owned Page: reakcje chwilowo niedostepne, wylaczam ich pobieranie",
              error,
              {
                postId: post.id,
                postUrl: post.permalink_url ?? null,
              },
            )
          }
        }
      }
    }

    afterCursor = postEdge.paging?.cursors?.after

    if (!afterCursor) {
      break
    }
  }

  await logTaskEvent(taskId, "Facebook Owned Page: koniec huntera", {
    level: "success",
    details: {
      pageId: settings.pageId,
      pageName: pageMeta.name,
      leadsSaved,
      ...stats,
    },
  })

  return leadsSaved
}

async function safelyCollectComments(
  taskId: string,
  postId: string,
  postUrl: string | undefined,
  maxComments: number,
) {
  try {
    return await collectGraphEdgeItems<FacebookComment>(
      `${postId}/comments`,
      "id,message,created_time,from{id,name},like_count,permalink_url",
      maxComments,
      {
        filter: "stream",
      },
    )
  } catch (error) {
    await logFacebookApiError(
      taskId,
      "Facebook Owned Page: blad pobierania komentarzy",
      error,
      {
        postId,
        postUrl: postUrl ?? null,
      },
    )
    return []
  }
}

async function saveOwnedPageLead(
  db: DbClient,
  taskId: string,
  input: {
    actorId: string
    actorName: string
    reason: string
    postUrl: string | null
    postId: string
    preview: string | null
    signalKeywords: string[]
  },
  seenActorIds: Set<string>,
  stats: OwnedPageStats,
) {
  const lead = {
    name: input.actorName,
    website: buildFacebookProfileUrl(input.actorId),
    source: "agent",
    platform: "facebook",
    email: null,
  }

  const result = await saveLead(db, lead, { taskId })
  seenActorIds.add(input.actorId)

  if (result.created) {
    await logTaskEvent(taskId, `Facebook Owned Page: zapisano lead ${input.actorName}`, {
      level: "success",
      details: {
        actorId: input.actorId,
        profileUrl: lead.website,
        reason: input.reason,
        postId: input.postId,
        postUrl: input.postUrl,
        preview: input.preview,
        keywords: input.signalKeywords,
      },
    })

    return true
  }

  if (result.reason === "duplicate") {
    stats.skippedExistingLead++
  } else if (result.reason === "rejected") {
    stats.skippedRejectedLead++
  }

  return false
}

async function fetchPageMeta(pageId: string) {
  return graphApiRequest<FacebookPageMeta>(pageId, {
    fields: "id,name,link,fan_count",
  })
}

async function fetchPagePosts(pageId: string, limit: number, after?: string) {
  return graphApiRequest<GraphApiEdge<FacebookPost>>(`${pageId}/posts`, {
    limit,
    after,
    fields:
      "id,message,created_time,permalink_url,attachments{title,description,media_type,url}",
  })
}

async function collectGraphEdgeItems<T>(
  path: string,
  fields: string,
  maxItems: number,
  extraParams: Record<string, string | number | undefined> = {},
) {
  const items: T[] = []
  let after: string | undefined

  while (items.length < maxItems) {
    const response = await graphApiRequest<GraphApiEdge<T>>(path, {
      ...extraParams,
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

async function graphApiRequest<T>(
  path: string,
  params: Record<string, string | number | undefined>,
) {
  const token = getConfiguredFacebookToken()

  if (!token) {
    throw new FacebookGraphApiError("Missing FACEBOOK_TOKEN")
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
    throw new FacebookGraphApiError("Facebook Graph API returned invalid JSON")
  }

  if (!res.ok || payload.error) {
    throw new FacebookGraphApiError(
      payload.error?.message || `Facebook Graph API error ${res.status}`,
      payload.error,
    )
  }

  return payload
}

async function logFacebookApiError(
  taskId: string,
  message: string,
  error: unknown,
  extraDetails: Record<string, unknown> = {},
) {
  const details =
    error instanceof FacebookGraphApiError
      ? {
          message: error.message,
          code: error.code,
          errorSubcode: error.errorSubcode,
          errorType: error.errorType,
          ...extraDetails,
        }
      : {
          message: error instanceof Error ? error.message : String(error),
          ...extraDetails,
        }

  await logTaskEvent(taskId, message, {
    level: "warn",
    details,
  })
}

function getOwnedPageSettings(config: TaskConfig): OwnedPageSettings {
  const customPageId = config.facebook?.page_id?.trim()

  return {
    pageId: customPageId || getConfiguredFacebookPageId() || null,
    daysBack: clampNumber(config.facebook?.days_back, 30, 1, 365),
    scanEntirePage: config.facebook?.scan_entire_page ?? true,
    includeComments: config.facebook?.include_comments ?? true,
    includeReactions: config.facebook?.include_reactions ?? true,
  }
}

function getConfiguredFacebookPageId() {
  return process.env.FACEBOOK_PAGE_ID?.trim() || null
}

function getConfiguredFacebookToken() {
  return process.env.FACEBOOK_TOKEN?.trim() || null
}

function getTokenFingerprint(token: string | null) {
  if (!token) {
    return null
  }

  return createHash("sha256").update(token).digest("hex").slice(0, 12)
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

function getPostsPerPage(speed?: string) {
  if (speed === "fast") return 10
  if (speed === "slow") return 25
  return 15
}

function getMaxPostsToInspect(speed?: string) {
  if (speed === "fast") return 20
  if (speed === "slow") return 80
  return 40
}

function getMaxCommentsPerPost(speed?: string) {
  if (speed === "fast") return 15
  if (speed === "slow") return 80
  return 35
}

function getMaxReactionsPerPost(speed?: string) {
  if (speed === "fast") return 10
  if (speed === "slow") return 50
  return 20
}

function evaluateSignal(text: string, normalizedKeywords: string[]): SignalEvaluation {
  const normalizedText = normalizeSignalText(text)
  const keywordMatches = normalizedKeywords.filter((keyword) =>
    keyword && normalizedText.includes(keyword),
  )

  return {
    normalizedText,
    keywordMatches,
    generalSignalCount: countSignalMatches(normalizedText, GENERAL_SIGNAL_MARKERS),
    intentSignalCount: countSignalMatches(normalizedText, INTENT_MARKERS),
    strongIntent: STRONG_INTENT_MARKERS.some((marker) =>
      normalizedText.includes(marker),
    ),
  }
}

function getCommentLeadReason(
  postSignal: SignalEvaluation,
  commentSignal: SignalEvaluation,
  scanEntirePage: boolean,
) {
  if (commentSignal.keywordMatches.length > 0) {
    return "comment_keyword_match"
  }

  if (commentSignal.strongIntent) {
    return "comment_strong_intent"
  }

  if (
    postSignal.keywordMatches.length > 0 &&
    (commentSignal.intentSignalCount > 0 ||
      commentSignal.generalSignalCount > 0 ||
      commentSignal.normalizedText.length >= 24)
  ) {
    return "engaged_on_matching_post"
  }

  if (
    scanEntirePage &&
    commentSignal.intentSignalCount >= 2 &&
    commentSignal.normalizedText.length >= 20
  ) {
    return "comment_general_intent"
  }

  if (
    scanEntirePage &&
    commentSignal.generalSignalCount >= 2 &&
    commentSignal.normalizedText.includes("?")
  ) {
    return "comment_question_signal"
  }

  if (scanEntirePage && isMeaningfulEngagementComment(commentSignal.normalizedText)) {
    return "comment_page_engagement"
  }

  return null
}

function getReactionLeadReason(
  postSignal: SignalEvaluation,
  scanEntirePage: boolean,
) {
  if (postSignal.keywordMatches.length > 0) {
    return "reaction_on_keyword_post"
  }

  if (
    scanEntirePage &&
    (postSignal.strongIntent || postSignal.generalSignalCount >= 3)
  ) {
    return "reaction_on_high_intent_post"
  }

  if (scanEntirePage) {
    return "reaction_on_owned_page"
  }

  return null
}

function buildPostText(post: FacebookPost) {
  const attachmentText =
    post.attachments?.data
      ?.flatMap((attachment) => [
        attachment.title,
        attachment.description,
        attachment.url,
      ])
      .filter(Boolean)
      .join(" ") || ""

  return [post.message, attachmentText].filter(Boolean).join(" ")
}

function buildFacebookProfileUrl(actorId: string) {
  return `https://www.facebook.com/profile.php?id=${encodeURIComponent(actorId)}`
}

function previewText(text?: string | null, maxLength = 140) {
  if (!text) {
    return null
  }

  const compact = text.replace(/\s+/g, " ").trim()

  if (compact.length <= maxLength) {
    return compact
  }

  return compact.slice(0, maxLength).trimEnd() + "..."
}

function countSignalMatches(text: string, markers: string[]) {
  return markers.reduce((count, marker) => {
    return count + (text.includes(marker) ? 1 : 0)
  }, 0)
}

function normalizeSignalText(text: string) {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
}

function isMeaningfulEngagementComment(text: string) {
  if (!text) {
    return false
  }

  const withoutLinks = text
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/www\.\S+/g, " ")
    .replace(/\s+/g, " ")
    .trim()

  if (!withoutLinks) {
    return false
  }

  if (LIGHT_ENGAGEMENT_MARKERS.some((marker) => withoutLinks.includes(marker))) {
    return true
  }

  return withoutLinks.length >= 4
}

function uniqueNormalizedStrings(items: string[]) {
  const seen = new Set<string>()

  return items.filter((item) => {
    const normalized = normalizeSignalText(item)

    if (!normalized || seen.has(normalized)) {
      return false
    }

    seen.add(normalized)
    return true
  })
}
