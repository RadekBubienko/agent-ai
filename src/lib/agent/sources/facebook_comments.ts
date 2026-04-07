import * as cheerio from "cheerio"
import type { DbClient, JobRunContext, TaskConfig } from "@/types/agent"
import { saveLead } from "../saveLead"
import { hasTimeBudgetExpired, markStoppedEarly } from "../runtime"
import { logTaskEvent } from "../taskLogs"
import {
  FACEBOOK_HEADERS,
  canonicalizeFacebookUrl,
  extractContactEvidenceFromHtml,
  extractDomain,
  fetchFacebookDocument,
  getFacebookInterRequestDelayMs,
  isLikelyFacebookCandidateUrl,
  sleep,
} from "./facebookCommon"

type FacebookCommentLeadCandidate = {
  email: string | null
  website: string | null
  phones: string[]
  preview: string
}

type FacebookCommentsStats = {
  keywordsProcessed: number
  searchesBlocked: number
  searchFailures: number
  fallbackSearchesUsed: number
  postsFound: number
  postsScanned: number
  postsBlocked: number
  postFailures: number
  commentCandidatesFound: number
  commentCandidatesMatched: number
  commentsWithoutPersistableContact: number
  skippedMissingEmail: number
  skippedMissingWebsite: number
  skippedMissingPhone: number
  skippedExistingLead: number
  skippedRejectedLead: number
}

type SearchProvider = "duckduckgo" | "brave" | "bing"

type SearchEndpoint = {
  endpoint: string
  provider: SearchProvider
}

type SearchAttemptDebug = {
  endpoint: string
  provider: SearchProvider
  query: string
  status?: number
  htmlLength: number
  candidates: number
  title: string
  preview: string
  error?: string
}

type PostDiscoveryResult = {
  postLinks: string[]
  usedFallback: boolean
  attempts: SearchAttemptDebug[]
  mbasicOutcome?: {
    kind: "error" | "empty"
    blockedReason?: string
    status?: number
    finalUrl: string
  }
}

const SEARCH_ENDPOINTS: SearchEndpoint[] = [
  {
    endpoint: "https://www.bing.com/search?cc=pl&setlang=pl&mkt=pl-PL&q=",
    provider: "bing",
  },
  {
    endpoint: "https://search.brave.com/search?source=web&q=",
    provider: "brave",
  },
  {
    endpoint: "https://html.duckduckgo.com/html/?q=",
    provider: "duckduckgo",
  },
  {
    endpoint: "https://lite.duckduckgo.com/lite/?q=",
    provider: "duckduckgo",
  },
]

const SEARCH_REQUEST_TIMEOUT_MS = 8000

export async function crawlFacebookComments(
  db: DbClient,
  config: TaskConfig,
  taskId: string,
  context: JobRunContext,
) {
  console.log("Facebook COMMENTS crawler started")

  const keywords = uniqueNormalizedStrings(config.industry?.keywords || [])
  const limit = config.limit || 50
  let leadsSaved = 0
  const stats: FacebookCommentsStats = {
    keywordsProcessed: 0,
    searchesBlocked: 0,
    searchFailures: 0,
    fallbackSearchesUsed: 0,
    postsFound: 0,
    postsScanned: 0,
    postsBlocked: 0,
    postFailures: 0,
    commentCandidatesFound: 0,
    commentCandidatesMatched: 0,
    commentsWithoutPersistableContact: 0,
    skippedMissingEmail: 0,
    skippedMissingWebsite: 0,
    skippedMissingPhone: 0,
    skippedExistingLead: 0,
    skippedRejectedLead: 0,
  }

  await logTaskEvent(taskId, "Facebook Comments: start crawlera", {
    details: {
      keywords,
      limit,
      speed: config.speed,
      qualityFilters: config.quality_filters,
    },
  })

  if (keywords.length === 0) {
    await logTaskEvent(taskId, "Facebook Comments: brak slow kluczowych", {
      level: "warn",
    })
    return 0
  }

  if (config.quality_filters.phone_required) {
    await logTaskEvent(
      taskId,
      "Facebook Comments: filtr telefonu sprawdzany heurystycznie po tresci komentarza, numer nie jest zapisywany w leadzie",
      {
        level: "warn",
      },
    )
  }

  for (const keyword of keywords) {
    if (leadsSaved >= limit) {
      return leadsSaved
    }

    stats.keywordsProcessed++

    if (hasTimeBudgetExpired(context, 20_000)) {
      markStoppedEarly(context)
      await logTaskEvent(taskId, "Facebook Comments: zatrzymano przez limit czasu", {
        level: "warn",
        details: { leadsSaved, keyword },
      })
      return leadsSaved
    }

    try {
      await logTaskEvent(taskId, `Facebook Comments: wyszukiwanie "${keyword}"`)

      const discovery = await discoverFacebookCommentPosts(keyword, config)

      if (discovery.mbasicOutcome?.kind === "error") {
        if (discovery.mbasicOutcome.blockedReason === "consent_or_login") {
          stats.searchesBlocked++
        } else {
          stats.searchFailures++
        }
      }

      if (discovery.mbasicOutcome) {
        await logTaskEvent(
          taskId,
          discovery.mbasicOutcome.kind === "empty"
            ? "Facebook Comments: mbasic search nie zwrocil postow, wlaczam fallback przez wyszukiwarki"
            : discovery.usedFallback
              ? "Facebook Comments: mbasic search niedostepny, wlaczam fallback przez wyszukiwarki"
              : "Facebook Comments: search niedostepny lub zablokowany",
          {
            level: "warn",
            details: {
              keyword,
              blockedReason: discovery.mbasicOutcome.blockedReason,
              status: discovery.mbasicOutcome.status,
              finalUrl: discovery.mbasicOutcome.finalUrl,
            },
          },
        )
      }

      if (discovery.usedFallback) {
        stats.fallbackSearchesUsed++
      }

      const postLinks = discovery.postLinks
      stats.postsFound += postLinks.length

      await logTaskEvent(taskId, "Facebook Comments: znalezione posty", {
        details: {
          keyword,
          posts: postLinks.length,
          discoveryMethod: discovery.usedFallback ? "search_fallback" : "mbasic",
          attempts: discovery.attempts.map((attempt) => ({
            provider: attempt.provider,
            query: attempt.query,
            status: attempt.status,
            candidates: attempt.candidates,
            title: attempt.title,
            preview: attempt.preview,
            error: attempt.error,
          })),
        },
      })

      if (postLinks.length === 0) {
        continue
      }

      for (const postUrl of postLinks.slice(0, getMaxPostsPerKeyword(config.speed))) {
        if (leadsSaved >= limit) {
          return leadsSaved
        }

        if (hasTimeBudgetExpired(context, 15_000)) {
          markStoppedEarly(context)
          await logTaskEvent(
            taskId,
            "Facebook Comments: zatrzymano przed kolejnym postem",
            {
              level: "warn",
              details: { leadsSaved, keyword },
            },
          )
          return leadsSaved
        }

        try {
          stats.postsScanned++
          const resPost = await fetchFacebookDocument(postUrl)

          if (!resPost.ok || !resPost.html) {
            if (resPost.blockedReason === "consent_or_login") {
              stats.postsBlocked++
            } else {
              stats.postFailures++
            }

            await logTaskEvent(taskId, "Facebook Comments: post zablokowany", {
              level: "warn",
              details: {
                keyword,
                postUrl,
                blockedReason: resPost.blockedReason,
                status: resPost.status,
                finalUrl: resPost.finalUrl,
              },
            })
            continue
          }

          const candidates = extractCommentLeadCandidates(
            resPost.html,
            config.speed,
          )
          stats.commentCandidatesFound += candidates.length

          for (const candidate of candidates) {
            if (hasTimeBudgetExpired(context, 10_000)) {
              markStoppedEarly(context)
              await logTaskEvent(
                taskId,
                "Facebook Comments: zatrzymano przed kolejnym komentarzem",
                {
                  level: "warn",
                  details: { leadsSaved, keyword, postUrl },
                },
              )
              return leadsSaved
            }

            if (!candidate.email && !candidate.website) {
              stats.commentsWithoutPersistableContact++
              continue
            }

            if (config.quality_filters.email_required && !candidate.email) {
              stats.skippedMissingEmail++
              continue
            }

            if (config.quality_filters.website_required && !candidate.website) {
              stats.skippedMissingWebsite++
              continue
            }

            if (config.quality_filters.phone_required && candidate.phones.length === 0) {
              stats.skippedMissingPhone++
              continue
            }

            stats.commentCandidatesMatched++

            const lead = {
              name: deriveLeadName(keyword, candidate),
              email: candidate.email,
              website: candidate.website,
              source: "agent",
              platform: "facebook_comments",
            }

            const result = await saveLead(db, lead, { taskId })

            if (result.created) {
              leadsSaved++
              await logTaskEvent(
                taskId,
                `Facebook Comments: zapisano lead dla "${keyword}"`,
                {
                  level: "success",
                  details: {
                    email: lead.email,
                    website: lead.website,
                    phonesDetected: candidate.phones,
                    postUrl,
                    preview: candidate.preview,
                  },
                },
              )
            }

            if (result.reason === "duplicate") {
              stats.skippedExistingLead++
            } else if (result.reason === "rejected") {
              stats.skippedRejectedLead++
            }

            if (leadsSaved >= limit) {
              return leadsSaved
            }
          }

          await sleep(getFacebookInterRequestDelayMs(config.speed))
        } catch (err) {
          console.error("post crawl error:", err)
          await logTaskEvent(taskId, "Facebook Comments: blad postu", {
            level: "error",
            details: {
              keyword,
              postUrl,
              message: err instanceof Error ? err.message : String(err),
            },
          })
        }
      }

      await sleep(getFacebookInterRequestDelayMs(config.speed))
    } catch (err) {
      console.error("facebook comments crawler error:", err)
      await logTaskEvent(taskId, `Facebook Comments: blad dla "${keyword}"`, {
        level: "error",
        details: {
          message: err instanceof Error ? err.message : String(err),
        },
      })
    }
  }

  console.log("Facebook COMMENTS crawler finished")
  await logTaskEvent(taskId, "Facebook Comments: koniec crawlera", {
    level: "success",
    details: {
      leadsSaved,
      ...stats,
    },
  })

  return leadsSaved
}

async function discoverFacebookCommentPosts(
  keyword: string,
  config: TaskConfig,
): Promise<PostDiscoveryResult> {
  const searchUrl =
    "https://mbasic.facebook.com/search/posts/?q=" +
    encodeURIComponent(keyword)
  const res = await fetchFacebookDocument(searchUrl)

  if (res.ok && res.html) {
    const directLinks = extractPostLinks(res.html)

    if (directLinks.length > 0) {
      return {
        postLinks: directLinks,
        usedFallback: false,
        attempts: [],
      }
    }
  }

  const fallback = await discoverFacebookPostsBySearch(keyword, config)

  return {
    ...fallback,
    usedFallback: true,
    mbasicOutcome: res.ok && res.html
      ? {
          kind: "empty",
          status: res.status,
          finalUrl: res.finalUrl,
        }
      : {
          kind: "error",
          blockedReason: res.blockedReason,
          status: res.status,
          finalUrl: res.finalUrl,
        },
  }
}

function extractPostLinks(html: string) {
  const $ = cheerio.load(html)
  const seen = new Set<string>()
  const links: string[] = []

  $("a").each((_, el) => {
    const href = $(el).attr("href")
    const normalized = normalizePostUrl(href)

    if (!normalized) {
      return
    }

    const fingerprint = canonicalizeFacebookUrl(normalized)

    if (seen.has(fingerprint)) {
      return
    }

    seen.add(fingerprint)
    links.push(normalized)
  })

  return links
}

async function discoverFacebookPostsBySearch(
  keyword: string,
  config: TaskConfig,
) {
  const attempts: SearchAttemptDebug[] = []
  const candidates: string[] = []
  const seen = new Set<string>()
  const queries = buildFacebookCommentSearchQueries(keyword, config)
  const maxCandidates = getMaxSearchFallbackCandidates(config.speed)

  for (const query of queries) {
    for (const { endpoint, provider } of SEARCH_ENDPOINTS) {
      try {
        const url = endpoint + encodeURIComponent(query)
        const res = await fetch(url, {
          headers: FACEBOOK_HEADERS,
          cache: "no-store",
          redirect: "follow",
          signal: AbortSignal.timeout(SEARCH_REQUEST_TIMEOUT_MS),
        })
        const html = await res.text()
        const parsedCandidates = extractSearchCandidates(html, provider)
          .filter((candidate) => isLikelyFacebookPostUrl(candidate))
          .slice(0, maxCandidates)
        const $ = cheerio.load(html)

        attempts.push({
          endpoint,
          provider,
          query,
          status: res.status,
          htmlLength: html.length,
          candidates: parsedCandidates.length,
          title: $("title").text().trim(),
          preview: $("body")
            .text()
            .replace(/\s+/g, " ")
            .trim()
            .slice(0, 240),
        })

        for (const candidate of parsedCandidates) {
          const fingerprint = canonicalizeFacebookUrl(candidate)

          if (seen.has(fingerprint)) {
            continue
          }

          seen.add(fingerprint)
          candidates.push(candidate)

          if (candidates.length >= maxCandidates) {
            return {
              postLinks: candidates,
              usedFallback: true,
              attempts,
            }
          }
        }

        if (parsedCandidates.length > 0 && candidates.length > 0) {
          return {
            postLinks: candidates,
            usedFallback: true,
            attempts,
          }
        }
      } catch (error) {
        attempts.push({
          endpoint,
          provider,
          query,
          htmlLength: 0,
          candidates: 0,
          title: "",
          preview: "",
          error: error instanceof Error ? error.message : String(error),
        })
      }
    }
  }

  return {
    postLinks: candidates,
    usedFallback: true,
    attempts,
  }
}

function normalizePostUrl(href?: string | null) {
  if (!href) {
    return null
  }

  if (
    !href.includes("/story.php") &&
    !href.includes("/posts/") &&
    !href.includes("/permalink.php")
  ) {
    return null
  }

  try {
    return new URL(href, "https://mbasic.facebook.com").toString()
  } catch {
    return null
  }
}

function extractSearchCandidates(
  html: string,
  provider: SearchProvider,
): string[] {
  if (provider === "bing") {
    return extractBingCandidates(html)
  }

  if (provider === "brave") {
    return extractBraveCandidates(html)
  }

  return extractDuckDuckGoCandidates(html)
}

function extractDuckDuckGoCandidates(html: string) {
  const $ = cheerio.load(html)
  const candidates: string[] = []

  $(".result, .results_links, .web-result, .links_main").each((_, el) => {
    const anchor = $(el).find("a.result__a, a.result-link, a").first()
    const href = anchor.attr("href")
    const normalized = normalizeSearchLink(href)

    if (normalized) {
      candidates.push(normalized)
    }
  })

  if (candidates.length > 0) {
    return [...new Set(candidates)]
  }

  $("a").each((_, el) => {
    const href = $(el).attr("href")
    const normalized = normalizeSearchLink(href)

    if (normalized) {
      candidates.push(normalized)
    }
  })

  return [...new Set(candidates)]
}

function extractBingCandidates(html: string) {
  const $ = cheerio.load(html)
  const candidates: string[] = []

  $("li.b_algo").each((_, el) => {
    const anchor = $(el).find("h2 a").first()
    const href = anchor.attr("href")
    const normalized = normalizeSearchLink(href)

    if (normalized) {
      candidates.push(normalized)
    }
  })

  return [...new Set(candidates)]
}

function extractBraveCandidates(html: string) {
  const $ = cheerio.load(html)
  const candidates: string[] = []

  $("a").each((_, el) => {
    const href = $(el).attr("href")
    const normalized = normalizeSearchLink(href)
    const title = $(el).text().replace(/\s+/g, " ").trim()

    if (!normalized || !title || title.length < 3) {
      return
    }

    candidates.push(normalized)
  })

  return [...new Set(candidates)]
}

function normalizeSearchLink(href?: string | null): string | null {
  if (!href) {
    return null
  }

  try {
    if (href.startsWith("//duckduckgo.com/l/?uddg=")) {
      const url = new URL("https:" + href)
      return url.searchParams.get("uddg")
    }

    if (href.startsWith("/l/?uddg=")) {
      const url = new URL("https://duckduckgo.com" + href)
      return url.searchParams.get("uddg")
    }

    if (href.startsWith("http")) {
      if (href.includes("bing.com/ck/a")) {
        const url = new URL(href)
        const encodedTarget = url.searchParams.get("u")
        return decodeBingTarget(encodedTarget)
      }

      return href
    }

    if (href.startsWith("//")) {
      return "https:" + href
    }
  } catch {
    return null
  }

  return null
}

function decodeBingTarget(encodedTarget?: string | null): string | null {
  if (!encodedTarget) {
    return null
  }

  try {
    const payload = encodedTarget.startsWith("a1")
      ? encodedTarget.slice(2)
      : encodedTarget
    const decoded = Buffer.from(payload, "base64").toString("utf8")

    return decoded || null
  } catch {
    return null
  }
}

function buildFacebookCommentSearchQueries(
  keyword: string,
  config: TaskConfig,
) {
  const location = getSearchLocation(config)
  const queries = [
    joinQueryParts("site:facebook.com", keyword, location, "posts"),
    joinQueryParts("site:facebook.com", keyword, location, "permalink.php"),
    joinQueryParts("site:facebook.com", keyword, location, "story_fbid"),
    joinQueryParts("site:facebook.com", keyword, location, "comment_id"),
  ].filter(Boolean)

  if (config.speed === "fast") {
    return queries.slice(0, 1)
  }

  if (config.speed === "slow") {
    return queries.slice(0, 4)
  }

  return queries.slice(0, 3)
}

function getSearchLocation(config: TaskConfig) {
  const city = config.geo?.city?.trim()
  const region = config.geo?.region?.trim()
  const country = config.geo?.country?.trim()

  if (city) {
    return city
  }

  if (region) {
    return region
  }

  if (country?.toUpperCase() === "PL") {
    return "Polska"
  }

  return country || ""
}

function joinQueryParts(...parts: Array<string | undefined | null>) {
  return parts
    .map((part) => part?.trim())
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim()
}

function isLikelyFacebookPostUrl(url: string) {
  if (!isLikelyFacebookCandidateUrl(url)) {
    return false
  }

  try {
    const parsed = new URL(url)
    const path = parsed.pathname.toLowerCase()

    if (
      path.includes("/posts/") ||
      path.includes("/permalink.php") ||
      path.includes("/story.php")
    ) {
      return true
    }

    return parsed.searchParams.has("story_fbid")
  } catch {
    return false
  }
}

function getMaxSearchFallbackCandidates(speed?: string) {
  if (speed === "fast") {
    return 3
  }

  if (speed === "slow") {
    return 8
  }

  return 5
}

function extractCommentLeadCandidates(
  html: string,
  speed?: string,
): FacebookCommentLeadCandidate[] {
  const $ = cheerio.load(html)
  const seen = new Set<string>()
  const candidates: FacebookCommentLeadCandidate[] = []

  const pushCandidate = (fragmentHtml?: string | null) => {
    if (!fragmentHtml) {
      return
    }

    const evidence = extractContactEvidenceFromHtml(fragmentHtml)
    const normalizedText = evidence.text.replace(/\s+/g, " ").trim()

    if (!normalizedText || normalizedText.length < 20 || normalizedText.length > 1200) {
      return
    }

    const candidate: FacebookCommentLeadCandidate = {
      preview: normalizePreview(normalizedText),
      email: pickBestEmail(evidence.emails),
      website: pickBestWebsite(evidence.websites),
      phones: findPhones(normalizedText),
    }

    if (!candidate.email && !candidate.website && candidate.phones.length === 0) {
      return
    }

    const fingerprint = JSON.stringify([
      candidate.email,
      candidate.website,
      candidate.phones,
      candidate.preview.slice(0, 180),
    ])

    if (seen.has(fingerprint)) {
      return
    }

    seen.add(fingerprint)
    candidates.push(candidate)
  }

  $(
    'a[href*="mailto:"], a[href*="/l.php?u="], a[href*="/flx/warn/?u="], a[href^="http"]',
  ).each((_, anchor) => {
    const container = $(anchor).closest("div, article, td")

    if (container.length > 0) {
      pushCandidate($.html(container))
    }
  })

  $("div, article, td").each((_, el) => {
    const block = $(el)
    const nestedContainers = block.find("div, article, td").length

    if (nestedContainers > 8) {
      return
    }

    pushCandidate($.html(block))
  })

  return candidates.slice(0, getMaxCandidatesPerPost(speed))
}

function deriveLeadName(
  keyword: string,
  candidate: FacebookCommentLeadCandidate,
) {
  const websiteDomain = candidate.website ? extractDomain(candidate.website) : null
  const emailDomain = extractDomainFromEmail(candidate.email)
  const identity = websiteDomain || emailDomain

  if (identity) {
    return `${keyword} - ${identity}`
  }

  return `${keyword} comment lead`
}

function pickBestEmail(candidates: string[]) {
  const cleaned = uniqueNormalizedStrings(
    candidates
      .map((candidate) => candidate.trim().replace(/^%20/i, ""))
      .filter((candidate) => candidate.includes("@"))
      .filter((candidate) => !/[<>"'\s]/.test(candidate))
      .filter((candidate) => !/\.(png|jpg|jpeg|gif|svg|webp)$/i.test(candidate)),
  )

  return cleaned[0] ?? null
}

function pickBestWebsite(candidates: string[]) {
  const cleaned = uniqueNormalizedStrings(
    candidates.filter((candidate) => candidate.startsWith("http")),
  )

  return cleaned[0] ?? null
}

function extractDomainFromEmail(email?: string | null) {
  if (!email || !email.includes("@")) {
    return null
  }

  return email.split("@")[1]?.toLowerCase() || null
}

function getMaxPostsPerKeyword(speed?: string) {
  if (speed === "fast") {
    return 3
  }

  if (speed === "slow") {
    return 8
  }

  return 5
}

function getMaxCandidatesPerPost(speed?: string) {
  if (speed === "fast") {
    return 10
  }

  if (speed === "slow") {
    return 35
  }

  return 20
}

function findPhones(text: string) {
  const matches = text.match(/(?:\+?\d[\d\s()-]{7,}\d)/g) ?? []
  const phones = matches
    .map((match) => match.replace(/[^\d+]/g, ""))
    .filter((match) => {
      const digits = match.replace(/\D/g, "")
      return digits.length >= 9 && digits.length <= 12
    })

  return [...new Set(phones)]
}

function normalizePreview(text: string, maxLength = 220) {
  const compact = text.replace(/\s+/g, " ").trim()

  if (!compact) {
    return ""
  }

  if (compact.length <= maxLength) {
    return compact
  }

  return compact.slice(0, maxLength).trimEnd() + "..."
}

function uniqueNormalizedStrings(items: string[]) {
  const seen = new Set<string>()

  return items.filter((item) => {
    const normalized = item.trim().toLowerCase()

    if (!normalized || seen.has(normalized)) {
      return false
    }

    seen.add(normalized)
    return true
  })
}
