import * as cheerio from "cheerio"
import { fetchWebsite } from "@/lib/ai/fetchWebsite"
import { findEmails } from "@/lib/ai/findEmails"
import type { DbClient, JobRunContext, TaskConfig } from "@/types/agent"
import { saveLead } from "../saveLead"
import { hasTimeBudgetExpired, markStoppedEarly } from "../runtime"
import { logTaskEvent } from "../taskLogs"
import {
  FACEBOOK_HEADERS,
  canonicalizeFacebookUrl,
  extractContactEvidenceFromHtml,
  extractContactEvidenceFromText,
  extractDomain,
  fetchFacebookDocument,
  getFacebookInterRequestDelayMs,
  isLikelyFacebookCandidateUrl,
  sleep,
} from "./facebookCommon"

type SearchProvider = "duckduckgo" | "brave" | "bing"

type SearchEndpoint = {
  endpoint: string
  provider: SearchProvider
}

type SearchCandidate = {
  url: string
  title: string
  snippet: string
  provider: SearchProvider
}

type SearchAttemptDebug = {
  endpoint: string
  provider: SearchProvider
  status?: number
  htmlLength: number
  candidates: number
  title: string
  preview: string
  error?: string
}

type SearchDiscoveryResult = {
  candidates: SearchCandidate[]
  attempts: SearchAttemptDebug[]
}

type FacebookCrawlerStats = {
  queriesPrepared: number
  queriesRun: number
  searchCandidatesFound: number
  candidatesInspected: number
  directSearchBlocked: boolean
  snippetHintsUsed: number
  facebookPageFetches: number
  facebookPageConsentBlocks: number
  facebookPageFetchFailures: number
  skippedDuplicateFacebookUrl: number
  skippedDuplicateDomainInTask: number
  skippedNoContactEvidence: number
  skippedWeakEvidence: number
  skippedUnreachableWebsite: number
  skippedMissingWebsite: number
  skippedMissingEmail: number
  skippedMissingPhone: number
  skippedExistingLead: number
  skippedRejectedLead: number
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

const SEARCH_HEADERS = {
  ...FACEBOOK_HEADERS,
}

const BUSINESS_SIGNALS = [
  "kontakt",
  "o nas",
  "oferta",
  "uslugi",
  "cennik",
  "rezerwacja",
  "umow wizyte",
  "gabinet",
  "klinika",
  "salon",
  "centrum",
  "studio",
  "sklep",
  "adres",
  "telefon",
  "formularz kontaktowy",
  "godziny otwarcia",
  "zespol",
  "specjalista",
  "terapia",
  "zabieg",
  "konsultacja",
  "produkt",
  "zamow",
  "nip",
  "regon",
  "krs",
]

const STRONG_BUSINESS_SIGNALS = [
  "formularz kontaktowy",
  "godziny otwarcia",
  "umow wizyte",
  "rezerwacja",
  "cennik",
  "adres",
  "telefon",
  "nip",
  "regon",
  "krs",
]

export async function crawlFacebook(
  db: DbClient,
  config: TaskConfig,
  taskId: string,
  context: JobRunContext,
) {
  console.log("Facebook crawler started")

  const keywords = uniqueNormalizedStrings(
    (config.industry?.keywords || [])
      .map((keyword) => keyword.trim().replace(/\s+/g, " "))
      .filter(Boolean),
  )
  const limit = config.limit || 50
  let leadsSaved = 0
  const seenFacebookUrls = new Set<string>()
  const seenLeadDomains = new Set<string>()
  const maxCandidatesToInspect = Math.max(limit * 5, 20)
  const stats: FacebookCrawlerStats = {
    queriesPrepared: 0,
    queriesRun: 0,
    searchCandidatesFound: 0,
    candidatesInspected: 0,
    directSearchBlocked: false,
    snippetHintsUsed: 0,
    facebookPageFetches: 0,
    facebookPageConsentBlocks: 0,
    facebookPageFetchFailures: 0,
    skippedDuplicateFacebookUrl: 0,
    skippedDuplicateDomainInTask: 0,
    skippedNoContactEvidence: 0,
    skippedWeakEvidence: 0,
    skippedUnreachableWebsite: 0,
    skippedMissingWebsite: 0,
    skippedMissingEmail: 0,
    skippedMissingPhone: 0,
    skippedExistingLead: 0,
    skippedRejectedLead: 0,
  }

  await logTaskEvent(taskId, "Facebook: start crawlera", {
    details: {
      keywords,
      limit,
      speed: config.speed,
      qualityFilters: config.quality_filters,
    },
  })

  if (keywords.length === 0) {
    await logTaskEvent(taskId, "Facebook: brak slow kluczowych", {
      level: "warn",
    })

    return 0
  }

  await probeDirectFacebookSearch(taskId, keywords[0], stats)

  const queries = buildFacebookQueries(config)
  stats.queriesPrepared = queries.length

  await logTaskEvent(taskId, "Facebook: przygotowano zapytania discovery", {
    details: { queries },
  })

  for (const query of queries) {
    if (
      leadsSaved >= limit ||
      stats.candidatesInspected >= maxCandidatesToInspect ||
      hasTimeBudgetExpired(context, 45_000)
    ) {
      if (hasTimeBudgetExpired(context, 45_000)) {
        markStoppedEarly(context)
        await logTaskEvent(taskId, "Facebook: zatrzymano przez limit czasu", {
          level: "warn",
          details: {
            leadsSaved,
            candidatesInspected: stats.candidatesInspected,
            remainingQueries: Math.max(queries.length - stats.queriesRun, 0),
          },
        })
      }

      return leadsSaved
    }

    stats.queriesRun++
    await logTaskEvent(taskId, `Facebook: zapytanie "${query}"`)

    const remainingLeads = Math.max(limit - leadsSaved, 1)
    const remainingInspections = Math.max(
      maxCandidatesToInspect - stats.candidatesInspected,
      0,
    )
    const perQueryCap = getMaxFacebookCandidatesPerQuery(
      config.speed,
      remainingLeads,
    )
    const discovery = await discoverFacebookCandidates(query, perQueryCap * 2)
    stats.searchCandidatesFound += discovery.candidates.length

    await logTaskEvent(taskId, "Facebook: znaleziono kandydatow", {
      details: {
        query,
        selected: discovery.candidates.length,
        attempts: discovery.attempts.map((attempt) => ({
          provider: attempt.provider,
          status: attempt.status,
          candidates: attempt.candidates,
          title: attempt.title,
          preview: attempt.preview,
          error: attempt.error,
        })),
      },
    })

    const queryCandidates: SearchCandidate[] = []

    for (const candidate of discovery.candidates) {
      const canonicalUrl = canonicalizeFacebookUrl(candidate.url)

      if (seenFacebookUrls.has(canonicalUrl)) {
        stats.skippedDuplicateFacebookUrl++
        continue
      }

      seenFacebookUrls.add(canonicalUrl)
      queryCandidates.push(candidate)

      if (
        queryCandidates.length >= perQueryCap ||
        queryCandidates.length >= remainingInspections
      ) {
        break
      }
    }

    for (const candidate of queryCandidates) {
      if (hasTimeBudgetExpired(context, 15_000)) {
        markStoppedEarly(context)
        await logTaskEvent(
          taskId,
          "Facebook: zatrzymano przed kolejnym kandydatem",
          {
            level: "warn",
            details: {
              query,
              leadsSaved,
              candidatesInspected: stats.candidatesInspected,
            },
          },
        )
        return leadsSaved
      }

      if (
        leadsSaved >= limit ||
        stats.candidatesInspected >= maxCandidatesToInspect
      ) {
        return leadsSaved
      }

      stats.candidatesInspected++

      const created = await processFacebookCandidate(
        db,
        config,
        taskId,
        candidate,
        seenLeadDomains,
        stats,
      )

      if (created) {
        leadsSaved++
      }
    }

    await sleep(getFacebookInterRequestDelayMs(config.speed))
  }

  console.log("Facebook crawler finished")
  await logTaskEvent(taskId, "Facebook: koniec crawlera", {
    level: "success",
    details: { leadsSaved },
  })

  await logTaskEvent(taskId, "Facebook: podsumowanie crawlera", {
    details: {
      leadsSaved,
      maxCandidatesToInspect,
      ...stats,
    },
  })

  return leadsSaved
}

async function probeDirectFacebookSearch(
  taskId: string,
  keyword: string,
  stats: FacebookCrawlerStats,
) {
  const probeUrl =
    "https://mbasic.facebook.com/search/posts/?q=" + encodeURIComponent(keyword)
  const probe = await fetchFacebookDocument(probeUrl)

  if (probe.ok) {
    await logTaskEvent(
      taskId,
      "Facebook: mbasic search odpowiada, ale crawler korzysta z discovery fallback",
      {
        details: {
          keyword,
          finalUrl: probe.finalUrl,
          status: probe.status,
        },
      },
    )
    return
  }

  stats.directSearchBlocked = probe.blockedReason === "consent_or_login"

  await logTaskEvent(
    taskId,
    probe.blockedReason === "consent_or_login"
      ? "Facebook: mbasic search wpada w consent/login wall, wlaczam fallback przez wyszukiwarki"
      : "Facebook: mbasic search niedostepny, wlaczam fallback przez wyszukiwarki",
    {
      level: "warn",
      details: {
        keyword,
        blockedReason: probe.blockedReason,
        finalUrl: probe.finalUrl,
        status: probe.status,
      },
    },
  )
}

async function processFacebookCandidate(
  db: DbClient,
  config: TaskConfig,
  taskId: string,
  candidate: SearchCandidate,
  seenLeadDomains: Set<string>,
  stats: FacebookCrawlerStats,
) {
  let evidence = mergeContactEvidence(
    extractContactEvidenceFromText([candidate.title, candidate.snippet].join(" ")),
  )

  if (evidence.websites.length > 0 || evidence.emails.length > 0) {
    stats.snippetHintsUsed++
  }

  if (evidence.websites.length === 0 && evidence.emails.length === 0) {
    stats.facebookPageFetches++

    const page = await fetchFacebookDocument(candidate.url)

    if (!page.ok) {
      if (page.blockedReason === "consent_or_login") {
        stats.facebookPageConsentBlocks++
      } else {
        stats.facebookPageFetchFailures++
      }

      return false
    }

    evidence = mergeContactEvidence(
      evidence,
      extractContactEvidenceFromHtml(page.html || ""),
    )
  }

  if (evidence.websites.length === 0 && evidence.emails.length === 0) {
    stats.skippedNoContactEvidence++
    return false
  }

  for (const website of evidence.websites) {
    const domain = extractDomain(website).toLowerCase()

    if (!domain) {
      continue
    }

    if (seenLeadDomains.has(domain)) {
      stats.skippedDuplicateDomainInTask++
      continue
    }

    seenLeadDomains.add(domain)

    const htmlPage = await fetchWebsite(website)

    if (!htmlPage) {
      stats.skippedUnreachableWebsite++
      continue
    }

    const websiteEmails = findEmails(htmlPage)
    const phones = findPhones(htmlPage)
    const email = pickLeadEmail([...websiteEmails, ...evidence.emails], website)

    if (!isLikelyBusinessPage(htmlPage) && !email && phones.length === 0) {
      stats.skippedWeakEvidence++
      continue
    }

    if (config.quality_filters.email_required && !email) {
      stats.skippedMissingEmail++
      continue
    }

    if (config.quality_filters.phone_required && phones.length === 0) {
      stats.skippedMissingPhone++
      continue
    }

    const lead = {
      name: deriveLeadName(candidate.title, website),
      email,
      website,
      source: "agent",
      platform: "facebook",
    }

    const result = await saveLead(db, lead, { taskId })

    if (result.created) {
      await logTaskEvent(taskId, "Facebook: zapisano lead", {
        level: "success",
        details: {
          facebookUrl: candidate.url,
          provider: candidate.provider,
          website,
          email,
        },
      })

      return true
    }

    if (result.reason === "duplicate") {
      stats.skippedExistingLead++
    } else if (result.reason === "rejected") {
      stats.skippedRejectedLead++
    }
  }

  if (evidence.emails.length > 0 && !config.quality_filters.website_required) {
    const email = evidence.emails[0] || null

    if (config.quality_filters.email_required && !email) {
      stats.skippedMissingEmail++
      return false
    }

    if (config.quality_filters.phone_required) {
      stats.skippedMissingPhone++
      return false
    }

    const lead = {
      name: deriveLeadName(candidate.title, null),
      email,
      website: null,
      source: "agent",
      platform: "facebook",
    }

    const result = await saveLead(db, lead, { taskId })

    if (result.created) {
      await logTaskEvent(
        taskId,
        "Facebook: zapisano lead z maila w wyniku wyszukiwania",
        {
          level: "success",
          details: {
            facebookUrl: candidate.url,
            provider: candidate.provider,
            email,
          },
        },
      )

      return true
    }

    if (result.reason === "duplicate") {
      stats.skippedExistingLead++
    } else if (result.reason === "rejected") {
      stats.skippedRejectedLead++
    }

    return false
  }

  if (evidence.websites.length === 0) {
    stats.skippedMissingWebsite++
    return false
  }

  if (config.quality_filters.email_required) {
    stats.skippedMissingEmail++
  }

  return false
}

async function discoverFacebookCandidates(
  query: string,
  limit: number,
): Promise<SearchDiscoveryResult> {
  const attempts: SearchAttemptDebug[] = []

  for (const { endpoint, provider } of SEARCH_ENDPOINTS) {
    try {
      const url = endpoint + encodeURIComponent(query)
      const res = await fetch(url, {
        headers: SEARCH_HEADERS,
        cache: "no-store",
        redirect: "follow",
        signal: AbortSignal.timeout(SEARCH_REQUEST_TIMEOUT_MS),
      })
      const html = await res.text()
      const parsedCandidates = extractSearchCandidates(html, provider)
        .filter((candidate) => isLikelyFacebookCandidateUrl(candidate.url))
        .slice(0, Math.max(limit, 4))
      const $ = cheerio.load(html)
      const preview = $("body")
        .text()
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 240)

      attempts.push({
        endpoint,
        provider,
        status: res.status,
        htmlLength: html.length,
        candidates: parsedCandidates.length,
        title: $("title").text().trim(),
        preview,
      })

      if (parsedCandidates.length > 0) {
        return {
          candidates: uniqueCandidates(parsedCandidates).slice(0, limit),
          attempts,
        }
      }
    } catch (error) {
      attempts.push({
        endpoint,
        provider,
        htmlLength: 0,
        candidates: 0,
        title: "",
        preview: "",
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  return {
    candidates: [],
    attempts,
  }
}

function extractSearchCandidates(
  html: string,
  provider: SearchProvider,
): SearchCandidate[] {
  if (provider === "bing") {
    return extractBingCandidates(html)
  }

  if (provider === "brave") {
    return extractBraveCandidates(html)
  }

  return extractDuckDuckGoCandidates(html)
}

function extractDuckDuckGoCandidates(html: string): SearchCandidate[] {
  const $ = cheerio.load(html)
  const candidates: SearchCandidate[] = []

  $(".result, .results_links, .web-result, .links_main").each((_, el) => {
    const anchor = $(el).find("a.result__a, a.result-link, a").first()
    const href = anchor.attr("href")
    const normalized = normalizeSearchLink(href)

    if (!normalized) {
      return
    }

    const title = anchor.text().replace(/\s+/g, " ").trim()
    const snippet = $(el)
      .find(".result__snippet, .result-snippet, .result__extras")
      .first()
      .text()
      .replace(/\s+/g, " ")
      .trim()

    candidates.push({
      url: normalized,
      title,
      snippet,
      provider: "duckduckgo",
    })
  })

  if (candidates.length > 0) {
    return uniqueCandidates(candidates)
  }

  $("a").each((_, el) => {
    const href = $(el).attr("href")
    const normalized = normalizeSearchLink(href)

    if (!normalized) {
      return
    }

    candidates.push({
      url: normalized,
      title: $(el).text().replace(/\s+/g, " ").trim(),
      snippet: $(el)
        .parent()
        .text()
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 240),
      provider: "duckduckgo",
    })
  })

  return uniqueCandidates(candidates)
}

function extractBingCandidates(html: string): SearchCandidate[] {
  const $ = cheerio.load(html)
  const candidates: SearchCandidate[] = []

  $("li.b_algo").each((_, el) => {
    const anchor = $(el).find("h2 a").first()
    const href = anchor.attr("href")
    const normalized = normalizeSearchLink(href)

    if (!normalized) {
      return
    }

    candidates.push({
      url: normalized,
      title: anchor.text().replace(/\s+/g, " ").trim(),
      snippet: $(el)
        .find(".b_caption p, .b_snippet, p")
        .first()
        .text()
        .replace(/\s+/g, " ")
        .trim(),
      provider: "bing",
    })
  })

  return uniqueCandidates(candidates)
}

function extractBraveCandidates(html: string): SearchCandidate[] {
  const $ = cheerio.load(html)
  const candidates: SearchCandidate[] = []

  $("a").each((_, el) => {
    const href = $(el).attr("href")
    const normalized = normalizeSearchLink(href)

    if (!normalized) {
      return
    }

    const title = $(el).text().replace(/\s+/g, " ").trim()

    if (!title || title.length < 3) {
      return
    }

    candidates.push({
      url: normalized,
      title,
      snippet: $(el)
        .closest("div")
        .text()
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 240),
      provider: "brave",
    })
  })

  return uniqueCandidates(candidates)
}

function uniqueCandidates(candidates: SearchCandidate[]): SearchCandidate[] {
  const seen = new Set<string>()

  return candidates.filter((candidate) => {
    const normalizedUrl = canonicalizeFacebookUrl(candidate.url)

    if (!normalizedUrl || seen.has(normalizedUrl)) {
      return false
    }

    seen.add(normalizedUrl)
    return true
  })
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

function buildFacebookQueries(config: TaskConfig): string[] {
  const queries = new Set<string>()
  const keywords = uniqueNormalizedStrings(
    (config.industry?.keywords || [])
      .map((keyword) => keyword.trim().replace(/\s+/g, " "))
      .filter(Boolean),
  )
  const location = getSearchLocation(config)
  const modifiers = getBusinessModifiers(config)
  const intentTerms = getQueryIntentTerms(config)
  const strongIntentTerms = getStrongLeadIntentTerms(config)
  const queryDepth = getQueryDepthBySpeed(config.speed)

  for (const keyword of keywords) {
    const normalizedKeyword = normalizeSignalText(keyword)
    const broadKeywordLeadTerms = getBroadKeywordLeadTerms(keyword, config)
    const semanticKeywordAlternatives = getSemanticKeywordAlternatives(
      keyword,
      config.speed,
    )
    const variants = [
      joinQueryParts(keyword, location),
      ...semanticKeywordAlternatives.map((alternative) =>
        joinQueryParts(alternative, location),
      ),
      ...strongIntentTerms.map((term) => joinQueryParts(keyword, term, location)),
      ...intentTerms.map((term) => joinQueryParts(keyword, term, location)),
      ...modifiers.map((term) => joinQueryParts(keyword, term, location)),
      ...broadKeywordLeadTerms.map((term) => joinQueryParts(keyword, term, location)),
    ]
      .filter(Boolean)
      .filter((variant, index, all) => all.indexOf(variant) === index)

    const effectiveQueryDepth = broadKeywordLeadTerms.length > 0
      ? isHealthLikeKeyword(normalizedKeyword)
        ? Math.min(queryDepth + 2, 7)
        : Math.min(queryDepth + 1, 6)
      : queryDepth

    for (const variant of variants.slice(0, effectiveQueryDepth)) {
      queries.add(joinQueryParts("site:facebook.com", variant))
    }
  }

  return uniqueNormalizedStrings([...queries])
}

function getBusinessModifiers(config: TaskConfig): string[] {
  const entityTypes = new Set(config.entity_type ?? [])
  const modifiers: string[] = []

  if (entityTypes.has("company")) {
    modifiers.push("firma", "uslugi")
  }

  if (entityTypes.has("shop")) {
    modifiers.push("sklep", "produkty")
  }

  if (entityTypes.has("person") || entityTypes.has("influencer")) {
    modifiers.push("studio", "gabinet")
  }

  if (entityTypes.has("mlm_prospect")) {
    modifiers.push("wellness", "mlm")
  }

  if (modifiers.length === 0) {
    modifiers.push("gabinet", "klinika", "salon")
  }

  return [...new Set(modifiers)]
}

function getBroadKeywordLeadTerms(
  keyword: string,
  config: TaskConfig,
): string[] {
  const normalizedKeyword = normalizeSignalText(keyword)

  if (!isBroadLeadKeyword(normalizedKeyword)) {
    return []
  }

  const entityTypes = new Set(config.entity_type ?? [])
  const terms: string[] = []
  const healthLikeKeyword = isHealthLikeKeyword(normalizedKeyword)
  const beautyLikeKeyword = isBeautyLikeKeyword(normalizedKeyword)

  if (healthLikeKeyword) {
    terms.push(
      "prywatny gabinet",
      "gabinet",
      "terapia",
      "konsultacja",
      "cennik",
      "umow wizyte",
      "rejestracja",
      "telefon",
      "klinika prywatna",
      "oferta",
    )
  }

  if (beautyLikeKeyword) {
    terms.push(
      "gabinet",
      "salon",
      "cennik",
      "umow wizyte",
      "rezerwacja",
      "konsultacja",
      "kosmetologia",
      "medycyna estetyczna",
    )
  }

  if (
    !healthLikeKeyword &&
    !beautyLikeKeyword &&
    (entityTypes.has("company") ||
      entityTypes.has("person") ||
      entityTypes.has("influencer"))
  ) {
    terms.push("gabinet", "klinika", "salon")
  }

  if (entityTypes.has("shop")) {
    terms.push("sklep", "produkty", "zamow")
  }

  terms.push("kontakt", "oferta")

  if (healthLikeKeyword) {
    terms.push("rehabilitacja", "zabieg")
  }

  if (beautyLikeKeyword) {
    terms.push("zabieg")
  }

  if (normalizedKeyword.includes("mlm")) {
    terms.push("wellness", "dystrybutor")
  }

  return [...new Set(terms)]
}

function isHealthLikeKeyword(normalizedKeyword: string): boolean {
  return (
    normalizedKeyword.includes("zdrow") ||
    normalizedKeyword.includes("samolecz") ||
    normalizedKeyword.includes("wellness") ||
    normalizedKeyword.includes("terap") ||
    normalizedKeyword.includes("rehabil") ||
    normalizedKeyword.includes("autoterap") ||
    normalizedKeyword.includes("biohack") ||
    normalizedKeyword.includes("holistycz") ||
    normalizedKeyword.includes("integracyj") ||
    normalizedKeyword.includes("funkcjonal") ||
    normalizedKeyword.includes("longevity")
  )
}

function isBeautyLikeKeyword(normalizedKeyword: string): boolean {
  return (
    normalizedKeyword.includes("urod") ||
    normalizedKeyword.includes("kosmet") ||
    normalizedKeyword.includes("estety")
  )
}

function isBroadLeadKeyword(normalizedKeyword: string): boolean {
  const broadKeywordPatterns = [
    "zdrowie",
    "uroda",
    "wellness",
    "samoleczenie",
    "autoterapia",
    "biohacking",
    "terapia holistyczna",
    "medycyna integracyjna",
    "medycyna funkcjonalna",
    "longevity",
    "mlm",
    "kosmetyka",
    "kosmetologia",
    "medycyna estetyczna",
    "rehabilitacja",
    "terapia",
    "suplementy",
    "odzywianie",
    "detoks",
    "fitness",
  ]

  return broadKeywordPatterns.some((pattern) =>
    normalizedKeyword.includes(pattern),
  )
}

function getSemanticKeywordAlternatives(
  keyword: string,
  speed?: string,
): string[] {
  const normalizedKeyword = normalizeSignalText(keyword)
  const alternatives: string[] = []

  if (normalizedKeyword.includes("samolecz")) {
    alternatives.push(
      "autoterapia",
      "terapia holistyczna",
      "medycyna integracyjna",
      "biohacking",
    )
  }

  if (normalizedKeyword === "zdrowie" || normalizedKeyword.includes("wellness")) {
    alternatives.push("biohacking", "longevity", "medycyna funkcjonalna")
  }

  if (normalizedKeyword === "uroda") {
    alternatives.push("medycyna estetyczna", "kosmetologia", "beauty clinic")
  }

  const normalizedAlternatives = uniqueNormalizedStrings(
    alternatives.filter((alternative) => {
      const normalizedAlternative = normalizeSignalText(alternative)

      return (
        normalizedAlternative !== normalizedKeyword &&
        !normalizedKeyword.includes(normalizedAlternative)
      )
    }),
  )

  if (speed === "fast") {
    return normalizedAlternatives.slice(0, 1)
  }

  if (speed === "slow") {
    return normalizedAlternatives.slice(0, 3)
  }

  return normalizedAlternatives.slice(0, 2)
}

function getQueryIntentTerms(config: TaskConfig): string[] {
  const entityTypes = new Set(config.entity_type ?? [])
  const terms = new Set<string>()

  if (
    config.quality_filters.email_required ||
    config.quality_filters.phone_required
  ) {
    terms.add("kontakt")
  }

  if (entityTypes.has("company")) {
    terms.add("uslugi")
  }

  if (entityTypes.has("shop")) {
    terms.add("sklep")
  }

  if (entityTypes.has("person") || entityTypes.has("influencer")) {
    terms.add("studio")
  }

  if (entityTypes.has("mlm_prospect")) {
    terms.add("wellness")
  }

  if (terms.size === 0) {
    terms.add("uslugi")
  }

  return [...terms]
}

function getStrongLeadIntentTerms(config: TaskConfig): string[] {
  const entityTypes = new Set(config.entity_type ?? [])
  const terms: string[] = []

  if (
    config.quality_filters.email_required ||
    config.quality_filters.phone_required ||
    config.quality_filters.website_required
  ) {
    terms.push("kontakt")
  }

  if (entityTypes.has("company")) {
    terms.push("kontakt", "klinika")
  }

  if (entityTypes.has("shop")) {
    terms.push("sklep", "produkt")
  }

  if (entityTypes.has("person") || entityTypes.has("influencer")) {
    terms.push("gabinet", "studio")
  }

  if (entityTypes.has("mlm_prospect")) {
    terms.push("wellness")
  }

  if (
    entityTypes.has("company") ||
    entityTypes.has("person") ||
    entityTypes.has("influencer")
  ) {
    terms.push("salon", "oferta")
  }

  if (terms.length === 0) {
    terms.push("kontakt", "gabinet")
  }

  return [...new Set(terms)]
}

function getQueryDepthBySpeed(speed?: string): number {
  if (speed === "fast") {
    return 2
  }

  if (speed === "slow") {
    return 5
  }

  return 4
}

function getMaxFacebookCandidatesPerQuery(
  speed: string | undefined,
  remainingLeads: number,
) {
  if (speed === "fast") {
    return Math.max(Math.min(remainingLeads + 1, 3), 2)
  }

  if (speed === "slow") {
    return Math.max(Math.min(remainingLeads + 4, 7), 4)
  }

  return Math.max(Math.min(remainingLeads + 2, 5), 3)
}

function getSearchLocation(config: TaskConfig): string {
  const city = config.geo?.city?.trim()
  const region = config.geo?.region?.trim()
  const country = config.geo?.country?.trim()

  if (city) {
    return city
  }

  if (region) {
    return region
  }

  if (country) {
    return normalizeCountryForSearch(country)
  }

  return ""
}

function normalizeCountryForSearch(country: string): string {
  const normalized = country.trim().toUpperCase()

  if (normalized === "PL") {
    return "Polska"
  }

  if (normalized === "DE") {
    return "Niemcy"
  }

  if (normalized === "CZ") {
    return "Czechy"
  }

  if (normalized === "SK") {
    return "Slowacja"
  }

  if (normalized === "LT") {
    return "Litwa"
  }

  if (normalized === "UA") {
    return "Ukraina"
  }

  return country.length > 2 ? country : ""
}

function joinQueryParts(...parts: Array<string | undefined | null>): string {
  return parts
    .map((part) => part?.trim())
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim()
}

function normalizeSignalText(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
}

function uniqueNormalizedStrings(items: string[]): string[] {
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

function mergeContactEvidence(...chunks: Array<{ emails: string[]; websites: string[] }>) {
  const emails = new Set<string>()
  const websites = new Set<string>()

  for (const chunk of chunks) {
    for (const email of chunk.emails) {
      emails.add(email)
    }

    for (const website of chunk.websites) {
      websites.add(website)
    }
  }

  return {
    emails: [...emails],
    websites: [...websites],
  }
}

function findPhones(html?: string | null): string[] {
  if (!html) {
    return []
  }

  const matches = html.match(/(?:\+?\d[\d\s()-]{7,}\d)/g) ?? []
  const phones = matches
    .map((match) => match.replace(/[^\d+]/g, ""))
    .filter((match) => {
      const digits = match.replace(/\D/g, "")
      return digits.length >= 9 && digits.length <= 12
    })

  return [...new Set(phones)]
}

function pickLeadEmail(candidates: string[], url: string): string | null {
  const domain = extractDomain(url).replace(/^www\./, "").toLowerCase()
  const cleaned = candidates
    .map((candidate) => candidate.trim().replace(/^%20/i, ""))
    .filter((candidate) => candidate.includes("@"))
    .filter((candidate) => !/[<>"'\s]/.test(candidate))
    .filter((candidate) => !/\.(png|jpg|jpeg|gif|svg|webp)$/i.test(candidate))
    .filter((candidate) => {
      const normalized = candidate.toLowerCase()

      return (
        !normalized.startsWith("license@") &&
        !normalized.startsWith("contact@prestashop") &&
        !normalized.startsWith("noreply@") &&
        !normalized.startsWith("no-reply@")
      )
    })

  const sameDomain = cleaned.find((candidate) =>
    candidate.toLowerCase().endsWith(`@${domain}`),
  )

  return sameDomain ?? cleaned[0] ?? null
}

function isLikelyBusinessPage(html: string): boolean {
  const text = normalizePageText(html)
  const businessScore = countSignalMatches(text, BUSINESS_SIGNALS)
  const strongBusinessScore = countSignalMatches(text, STRONG_BUSINESS_SIGNALS)

  return businessScore >= 3 || strongBusinessScore >= 1
}

function deriveLeadName(title: string, website: string | null): string {
  const cleanedTitle = title
    .replace(/\|\s*facebook.*$/i, "")
    .replace(/-\s*facebook.*$/i, "")
    .replace(/\s+/g, " ")
    .trim()

  if (cleanedTitle) {
    return cleanedTitle
  }

  if (website) {
    return extractDomain(website)
  }

  return "Facebook lead"
}

function normalizePageText(html: string): string {
  const $ = cheerio.load(html)
  const text = $("body").text() || html

  return normalizeSignalText(text)
}

function countSignalMatches(text: string, signals: string[]): number {
  return signals.reduce((count, signal) => {
    return count + (text.includes(signal) ? 1 : 0)
  }, 0)
}
