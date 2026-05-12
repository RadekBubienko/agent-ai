import type { DbClient, JobRunContext, TaskConfig } from "@/types/agent"
import {
  collectInstagramComments,
  collectInstagramMedia,
  fetchOwnedInstagramAccount,
  getMaxInstagramCommentsPerMedia,
  getMaxInstagramMediaToInspect,
  getOwnedInstagramSettings,
  type InstagramMedia,
} from "@/lib/meta/instagram"
import { recordSocialEvent } from "@/lib/social/conversations"
import { saveLead } from "../saveLead"
import { hasTimeBudgetExpired, markStoppedEarly } from "../runtime"
import { logTaskEvent } from "../taskLogs"

const GENERAL_SIGNAL_MARKERS = [
  "swiatl",
  "fotostymul",
  "regener",
  "samolecz",
  "terap",
  "wellness",
  "zdrow",
  "urod",
  "biohack",
  "sygnal",
]

const INTENT_MARKERS = [
  "poprosze",
  "prosze",
  "chce",
  "interesuje mnie",
  "jak to dziala",
  "jak dziala",
  "gdzie",
  "ile",
  "link",
  "info",
  "szczegoly",
  "dm",
  "priv",
  "pw",
]

const STRONG_INTENT_MARKERS = [
  "poprosze",
  "prosze",
  "jak to dziala",
  "jak dziala",
  "link",
  "info",
  "szczegoly",
]

type SignalEvaluation = {
  normalizedText: string
  keywordMatches: string[]
  generalSignalCount: number
  intentSignalCount: number
  strongIntent: boolean
}

type InstagramStats = {
  mediaFetched: number
  mediaInspected: number
  mediaMatchedSignal: number
  mediaSkippedTooOld: number
  mediaSkippedNoSignal: number
  commentsFetched: number
  commentsSkippedMissingActor: number
  commentsSkippedOwnAccount: number
  commentsSkippedNoReason: number
  commentCandidatesMatched: number
  savedFromComments: number
  skippedDuplicateActorInRun: number
  skippedExistingLead: number
  skippedRejectedLead: number
}

export async function crawlInstagram(
  db: DbClient,
  config: TaskConfig,
  taskId: string,
  context: JobRunContext,
) {
  console.log("Instagram owned account crawler started")

  const settings = getOwnedInstagramSettings(config)
  const limit = config.limit || 50
  const normalizedKeywords = uniqueNormalizedStrings(
    (config.industry?.keywords || []).map(normalizeSignalText).filter(Boolean),
  )
  const scanEntireAccount = normalizedKeywords.length === 0
  const maxMediaToInspect = getMaxInstagramMediaToInspect(config.speed)
  const maxCommentsPerMedia = getMaxInstagramCommentsPerMedia(config.speed)
  const seenActorIds = new Set<string>()
  const stats: InstagramStats = {
    mediaFetched: 0,
    mediaInspected: 0,
    mediaMatchedSignal: 0,
    mediaSkippedTooOld: 0,
    mediaSkippedNoSignal: 0,
    commentsFetched: 0,
    commentsSkippedMissingActor: 0,
    commentsSkippedOwnAccount: 0,
    commentsSkippedNoReason: 0,
    commentCandidatesMatched: 0,
    savedFromComments: 0,
    skippedDuplicateActorInRun: 0,
    skippedExistingLead: 0,
    skippedRejectedLead: 0,
  }
  let leadsSaved = 0

  await logTaskEvent(taskId, "Instagram Owned Account: start huntera", {
    details: {
      pageId: settings.pageId,
      daysBack: settings.daysBack,
      includeComments: settings.includeComments,
      keywords: normalizedKeywords,
      limit,
    },
  })

  if (!settings.pageId) {
    await logTaskEvent(taskId, "Instagram Owned Account: brak PAGE_ID strony", {
      level: "error",
    })
    return 0
  }

  if (!settings.includeComments) {
    await logTaskEvent(
      taskId,
      "Instagram Owned Account: analizowanie komentarzy jest wylaczone",
      {
        level: "warn",
      },
    )
    return 0
  }

  if (
    config.quality_filters.email_required ||
    config.quality_filters.phone_required
  ) {
    await logTaskEvent(
      taskId,
      "Instagram Owned Account: filtry email/telefon sa pomijane dla leadow social",
      {
        level: "warn",
        details: {
          emailRequired: config.quality_filters.email_required,
          phoneRequired: config.quality_filters.phone_required,
        },
      },
    )
  }

  let account: Awaited<ReturnType<typeof fetchOwnedInstagramAccount>>

  try {
    account = await fetchOwnedInstagramAccount(settings.pageId)
  } catch (error) {
    await logTaskEvent(
      taskId,
      "Instagram Owned Account: nie mozna pobrac podlaczonego konta",
      {
        level: "error",
        details: {
          message: error instanceof Error ? error.message : String(error),
          pageId: settings.pageId,
        },
      },
    )
    return 0
  }

  if (!account) {
    await logTaskEvent(
      taskId,
      "Instagram Owned Account: brak podlaczonego konta profesjonalnego Instagram",
      {
        level: "warn",
        details: {
          pageId: settings.pageId,
        },
      },
    )
    return 0
  }

  await logTaskEvent(taskId, "Instagram Owned Account: konto potwierdzone", {
    details: {
      pageId: account.pageId,
      pageName: account.pageName,
      igUserId: account.igUserId,
      igUsername: account.igUsername,
    },
  })

  let mediaItems: InstagramMedia[]

  try {
    mediaItems = await collectInstagramMedia(account.igUserId, maxMediaToInspect)
  } catch (error) {
    await logTaskEvent(
      taskId,
      "Instagram Owned Account: blad pobierania mediow",
      {
        level: "error",
        details: {
          message: error instanceof Error ? error.message : String(error),
          igUserId: account.igUserId,
        },
      },
    )
    return 0
  }

  stats.mediaFetched = mediaItems.length

  const cutoffTime = Date.now() - settings.daysBack * 24 * 60 * 60 * 1000

  for (const media of mediaItems) {
    if (
      leadsSaved >= limit ||
      hasTimeBudgetExpired(context, 20_000) ||
      stats.mediaInspected >= maxMediaToInspect
    ) {
      if (hasTimeBudgetExpired(context, 20_000)) {
        markStoppedEarly(context)
        await logTaskEvent(
          taskId,
          "Instagram Owned Account: zatrzymano przed kolejnym medium przez limit czasu",
          {
            level: "warn",
            details: {
              leadsSaved,
              mediaInspected: stats.mediaInspected,
            },
          },
        )
      }

      break
    }

    const createdAt = Date.parse(media.timestamp)

    if (Number.isFinite(createdAt) && createdAt < cutoffTime) {
      stats.mediaSkippedTooOld++
      continue
    }

    stats.mediaInspected++

    const mediaText = buildMediaText(media)
    const mediaSignal = evaluateSignal(mediaText, normalizedKeywords)
    const mediaMatchesSignal =
      mediaSignal.keywordMatches.length > 0 ||
      mediaSignal.strongIntent ||
      mediaSignal.generalSignalCount >= 2

    if (mediaMatchesSignal) {
      stats.mediaMatchedSignal++
    }

    if (!scanEntireAccount && !mediaMatchesSignal) {
      stats.mediaSkippedNoSignal++
      continue
    }

    const expectedComments = Number(media.comments_count ?? 0)

    if (expectedComments <= 0) {
      continue
    }

    let comments: Awaited<ReturnType<typeof collectInstagramComments>>

    try {
      comments = await collectInstagramComments(
        media.id,
        Math.min(expectedComments || maxCommentsPerMedia, maxCommentsPerMedia),
      )
    } catch (error) {
      await logTaskEvent(
        taskId,
        "Instagram Owned Account: blad pobierania komentarzy",
        {
          level: "warn",
          details: {
            message: error instanceof Error ? error.message : String(error),
            mediaId: media.id,
            permalink: media.permalink ?? null,
          },
        },
      )
      continue
    }

    stats.commentsFetched += comments.length

    for (const comment of comments) {
      if (leadsSaved >= limit || hasTimeBudgetExpired(context, 10_000)) {
        if (hasTimeBudgetExpired(context, 10_000)) {
          markStoppedEarly(context)
        }
        break
      }

      const actorId = comment.from?.id?.trim()
      const actorUsername = comment.from?.username?.trim()

      if (!actorId || !actorUsername) {
        stats.commentsSkippedMissingActor++
        continue
      }

      if (
        actorId === account.igUserId ||
        normalizeSignalText(actorUsername) ===
          normalizeSignalText(account.igUsername ?? "")
      ) {
        stats.commentsSkippedOwnAccount++
        continue
      }

      if (seenActorIds.has(actorId)) {
        stats.skippedDuplicateActorInRun++
        continue
      }

      const commentSignal = evaluateSignal(comment.text ?? "", normalizedKeywords)
      const reason = getCommentLeadReason(
        mediaSignal,
        commentSignal,
        scanEntireAccount,
      )

      if (!reason) {
        stats.commentsSkippedNoReason++
        continue
      }

      stats.commentCandidatesMatched++

      const lead = {
        name: actorUsername,
        website: buildInstagramProfileUrl(actorUsername),
        source: "agent",
        platform: "instagram",
        email: null,
      }

      const result = await saveLead(db, lead, { taskId })
      seenActorIds.add(actorId)

      await recordSocialEvent({
        platform: "instagram",
        businessAccountId: account.igUserId,
        businessUsername: account.igUsername ?? null,
        customerScopedId: actorId,
        customerUsername: actorUsername,
        leadId: result.id ?? null,
        status: "new",
        entrypoint: "comment",
        eventType: "comment_scan_match",
        direction: "inbound",
        externalMessageId: comment.id,
        sourceMediaId: media.id,
        sourceCommentId: comment.id,
        text: comment.text ?? null,
        occurredAt: comment.timestamp ?? null,
        payload: {
          reason,
          mediaPermalink: media.permalink ?? null,
          mediaTimestamp: media.timestamp,
          preview: previewText(comment.text),
          keywords: uniqueNormalizedStrings([
            ...mediaSignal.keywordMatches,
            ...commentSignal.keywordMatches,
          ]),
        },
      })

      if (result.created) {
        leadsSaved++
        stats.savedFromComments++
        await logTaskEvent(
          taskId,
          `Instagram Owned Account: zapisano lead ${actorUsername}`,
          {
            level: "success",
            details: {
              actorId,
              profileUrl: lead.website,
              reason,
              mediaId: media.id,
              mediaPermalink: media.permalink ?? null,
              preview: previewText(comment.text),
              keywords: uniqueNormalizedStrings([
                ...mediaSignal.keywordMatches,
                ...commentSignal.keywordMatches,
              ]),
            },
          },
        )
      } else if (result.reason === "duplicate") {
        stats.skippedExistingLead++
      } else if (result.reason === "rejected") {
        stats.skippedRejectedLead++
      }
    }
  }

  await logTaskEvent(taskId, "Instagram Owned Account: koniec huntera", {
    level: "success",
    details: {
      pageId: account.pageId,
      igUserId: account.igUserId,
      igUsername: account.igUsername,
      leadsSaved,
      ...stats,
    },
  })

  return leadsSaved
}

function buildMediaText(media: InstagramMedia) {
  return [media.caption, media.media_product_type, media.media_type]
    .filter(Boolean)
    .join(" ")
}

function buildInstagramProfileUrl(username: string) {
  return `https://instagram.com/${encodeURIComponent(username)}`
}

function getCommentLeadReason(
  mediaSignal: SignalEvaluation,
  commentSignal: SignalEvaluation,
  scanEntireAccount: boolean,
) {
  if (commentSignal.keywordMatches.length > 0) {
    return "comment_keyword_match"
  }

  if (commentSignal.strongIntent) {
    return "comment_strong_intent"
  }

  if (
    mediaSignal.keywordMatches.length > 0 &&
    (commentSignal.intentSignalCount > 0 ||
      commentSignal.generalSignalCount > 0 ||
      commentSignal.normalizedText.length >= 10)
  ) {
    return "engaged_on_matching_media"
  }

  if (
    scanEntireAccount &&
    commentSignal.intentSignalCount >= 1 &&
    commentSignal.normalizedText.length >= 8
  ) {
    return "comment_general_intent"
  }

  if (scanEntireAccount && isMeaningfulEngagementComment(commentSignal.normalizedText)) {
    return "comment_on_owned_media"
  }

  return null
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

function countSignalMatches(text: string, markers: string[]) {
  return markers.reduce((count, marker) => {
    return count + (text.includes(marker) ? 1 : 0)
  }, 0)
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
