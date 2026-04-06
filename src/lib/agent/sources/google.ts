import * as cheerio from "cheerio";
import { fetchWebsite } from "@/lib/ai/fetchWebsite";
import { findEmails } from "@/lib/ai/findEmails";
import type { DbClient, JobRunContext, TaskConfig } from "@/types/agent";
import { saveLead } from "../saveLead";
import { hasTimeBudgetExpired, markStoppedEarly } from "../runtime";
import { logTaskEvent } from "../taskLogs";

type SearchEndpoint = {
  endpoint: string;
  provider: "duckduckgo" | "brave" | "bing";
};

const SEARCH_ENDPOINTS: SearchEndpoint[] = [
  {
    endpoint: "https://html.duckduckgo.com/html/?q=",
    provider: "duckduckgo",
  },
  {
    endpoint: "https://lite.duckduckgo.com/lite/?q=",
    provider: "duckduckgo",
  },
  {
    endpoint: "https://search.brave.com/search?source=web&q=",
    provider: "brave",
  },
  {
    endpoint: "https://www.bing.com/search?cc=pl&setlang=pl&mkt=pl-PL&q=",
    provider: "bing",
  },
];

const SEARCH_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36",
  "Accept-Language": "pl-PL,pl;q=0.9,en;q=0.8",
};

const SEARCH_REQUEST_TIMEOUT_MS = 8000;

const BLOCKED_HOST_PATTERNS = [
  "facebook.com",
  "instagram.com",
  "youtube.com",
  "youtu.be",
  "tiktok.com",
  "x.com",
  "twitter.com",
  "linkedin.com",
  "wikipedia.org",
  "wikimedia.org",
  "gov.pl",
  "pap.pl",
  "abczdrowie.pl",
  "poradnikzdrowie.pl",
  "rynekzdrowia.pl",
  "medonet.pl",
  "doz.pl",
  "hellozdrowie.pl",
  "zdrowie.pl",
  "onet.pl",
  "forbes.pl",
  "forbes.com",
  "allegro.pl",
  "gemini.pl",
  "cambridge.org",
  "nofluffjobs.com",
  "pep.pl",
  "znanylekarz.pl",
  "tvn24.pl",
  "radiozet.pl",
  "baidu.com",
  "zhihu.com",
  "goo.ne.jp",
  "stronazdrowia.pl",
  "politykazdrowotna.com",
  "elle.pl",
  "pwn.pl",
  "dobryslownik.pl",
  "diki.pl",
  "zwierciadlo.pl",
  "magazynuroda.pl",
  "urodaizdrowie.pl",
];

const BLOCKED_HOST_FRAGMENTS = ["bip", "nfz", "pacjent", "cez"];

const BLOCKED_PATH_PATTERNS = [
  "/wiki/",
  "/videos/",
  "/video/",
  "/watch",
  "/reel/",
  "/posts/",
  "/post/",
  "/poradnik/",
  "/blog/",
  "/dictionary/",
  "/slownik/",
  "/log/",
  "/artyk",
  "/news/",
  "/dzial/",
];

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
  "kup teraz",
  "koszyk",
  "nip",
  "regon",
  "krs",
];

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
  "zamow",
  "koszyk",
];

const EDITORIAL_SIGNALS = [
  "redakcja",
  "czytaj wiecej",
  "newsletter",
  "artykul",
  "portal",
  "news",
  "wiadomosci",
  "autor",
  "udostepnij",
  "komentarze",
  "publikacja",
  "aktualnosci",
  "magazyn",
  "poradnik",
  "przeczytaj",
];

const PUBLIC_INSTITUTION_SIGNALS = [
  "ministerstwo",
  "serwis rzadowy",
  "urzad",
  "urzad marszalkowski",
  "samorzad",
  "gov.pl",
  "bip",
  "nfz",
  "centrum e-zdrowia",
  "wojewodztwo",
  "gmina",
  "powiat",
  "fundusze europejskie",
];

const TARGET_BUSINESS_SIGNALS = [
  "gabinet",
  "klinika",
  "salon",
  "studio",
  "poradnia",
  "przychodnia",
  "centrum medyczne",
  "centrum zdrowia",
  "placowka medyczna",
  "medycyna estetyczna",
  "kosmetolog",
  "kosmetologia",
  "rehabilitacja",
  "fizjoterapia",
  "terapia",
  "zabieg",
  "stomatolog",
  "dentysta",
  "dietetyk",
  "dietetyka",
  "spa",
  "wellness",
];

const OUT_OF_SCOPE_BUSINESS_SIGNALS = [
  "ubezpieczenie",
  "ubezpieczenia",
  "ubezpieczyciel",
  "towarzystwo ubezpieczen",
  "towarzystwo ubezpieczeniowe",
  "polisa",
  "certyfikacja",
  "certyfikat",
  "certyfikaty",
  "akredytacja",
  "audyt",
  "auditor",
  "iso 9001",
  "iso 14001",
  "iso 45001",
  "szkolenie",
  "szkolenia",
  "kurs",
  "kursy",
];

export type SearchAttemptDebug = {
  endpoint: string;
  provider: "duckduckgo" | "brave" | "bing";
  status?: number;
  htmlLength: number;
  linksFound: number;
  sampleLinks: string[];
  title: string;
  preview: string;
  selectorCounts?: {
    bAlgo: number;
    bingRedirectAnchors: number;
    braveAnchors?: number;
  };
  error?: string;
};

type PageQualityDecision = {
  accepted: boolean;
  reason: string;
};

export async function crawlGoogle(
  db: DbClient,
  config: TaskConfig,
  taskId: string,
  context: JobRunContext,
) {
  console.log("Search crawler started");
  console.log("Task config:", config);

  const limit = config.limit || 50;
  let leadsSaved = 0;
  const seenDomains = new Set<string>();
  const maxPagesToInspect = Math.max(limit * 5, 20);
  let pagesInspected = 0;
  let skippedDuplicateDomainInTask = 0;
  let skippedExistingLead = 0;
  let skippedRejectedLead = 0;
  let skippedQualityOrContent = 0;
  let skippedUnreachable = 0;
  let skippedMissingEmail = 0;
  let skippedMissingPhone = 0;
  const qualitySkipReasonCounts: Record<string, number> = {};

  const queries = buildQueries(config);

  console.log("Generated queries:", queries);
  await logTaskEvent(taskId, "Google: przygotowano zapytania", {
    details: { queries },
  });

  for (const query of queries) {
    if (
      leadsSaved >= limit ||
      pagesInspected >= maxPagesToInspect ||
      hasTimeBudgetExpired(context, 45_000)
    ) {
      if (hasTimeBudgetExpired(context, 45_000)) {
        markStoppedEarly(context);
        await logTaskEvent(taskId, "Google: zatrzymano przez limit czasu", {
          level: "warn",
          details: {
            leadsSaved,
            pagesInspected,
            remainingQueries: queries.length,
          },
        });
      }

      console.log("Stopping search crawler early", {
        leadsSaved,
        limit,
        pagesInspected,
        maxPagesToInspect,
      });
      return leadsSaved;
    }

    console.log("Search query:", query);
    await logTaskEvent(taskId, `Google: zapytanie "${query}"`);

    const links = (await searchLinks(query)).filter((link) =>
      isAllowedSearchResult(link),
    );
    const remainingLeads = Math.max(limit - leadsSaved, 1);
    const remainingPages = Math.max(maxPagesToInspect - pagesInspected, 0);
    const perQueryLinkCap = getMaxLinksPerQuery(config.speed, remainingLeads);
    const uniqueLinks: string[] = [];
    const querySeenDomains = new Set<string>();

    for (const link of links) {
      const domain = extractDomain(link).toLowerCase();

      if (!domain) {
        continue;
      }

      if (seenDomains.has(domain) || querySeenDomains.has(domain)) {
        skippedDuplicateDomainInTask++;
        continue;
      }

      querySeenDomains.add(domain);
      uniqueLinks.push(link);
    }

    const maxLinksThisQuery = Math.min(
      uniqueLinks.length,
      perQueryLinkCap,
      remainingPages,
    );
    const candidateLinks = uniqueLinks.slice(0, maxLinksThisQuery);

    console.log("Links found:", links.length);
    console.log("Links selected for inspection:", candidateLinks.length);
    await logTaskEvent(taskId, "Google: znaleziono kandydatów", {
      details: {
        query,
        linksFound: links.length,
        selected: candidateLinks.length,
      },
    });

    for (const link of candidateLinks) {
      if (hasTimeBudgetExpired(context, 15_000)) {
        markStoppedEarly(context);
        await logTaskEvent(taskId, "Google: zatrzymano przed kolejną stroną", {
          level: "warn",
          details: {
            query,
            leadsSaved,
            pagesInspected,
          },
        });
        return leadsSaved;
      }

      if (leadsSaved >= limit) {
        console.log("Lead limit reached:", limit);
        return leadsSaved;
      }

      if (pagesInspected >= maxPagesToInspect) {
        console.log("Page inspection limit reached:", maxPagesToInspect);
        return leadsSaved;
      }

      pagesInspected++;

      const domain = extractDomain(link).toLowerCase();

      if (seenDomains.has(domain)) {
        console.log("Skipping duplicate domain in task:", domain);
        skippedDuplicateDomainInTask++;
        continue;
      }

      seenDomains.add(domain);

      const htmlPage = await fetchWebsite(link);
      let email: string | null = null;
      let phones: string[] = [];

      if (htmlPage) {
        const emails = findEmails(htmlPage);
        const bestEmail = pickLeadEmail(emails, link);
        phones = findPhones(htmlPage);

        console.log("Emails found:", emails);

        if (bestEmail) {
          email = bestEmail;
        }

        const qualityDecision = evaluatePageQuality(
          htmlPage,
          link,
          email,
          phones,
        );

        if (!qualityDecision.accepted) {
          console.log(qualityDecision.reason, link);
          skippedQualityOrContent++;
          qualitySkipReasonCounts[qualityDecision.reason] =
            (qualitySkipReasonCounts[qualityDecision.reason] ?? 0) + 1;
          continue;
        }
      } else {
        console.log("Skipping unreachable page:", link);
        skippedUnreachable++;
        continue;
      }

      if (config.quality_filters.email_required && !email) {
        console.log("Skipping lead without email:", link);
        skippedMissingEmail++;
        continue;
      }

      if (config.quality_filters.phone_required && phones.length === 0) {
        console.log("Skipping lead without phone:", link);
        skippedMissingPhone++;
        continue;
      }

      const lead = {
        name: domain,
        website: link,
        source: "agent",
        platform: "search",
        email,
      };

      console.log("Saving lead:", lead);

      const result = await saveLead(db, lead, { taskId });

      if (result.created) {
        leadsSaved++;
        await logTaskEvent(taskId, `Google: zapisano lead ${domain}`, {
          level: "success",
          details: {
            website: link,
            email,
            leadsSaved,
          },
        });
      } else if (result.reason === "duplicate") {
        skippedExistingLead++;
      } else if (result.reason === "rejected") {
        skippedRejectedLead++;
      }
    }

    await sleep(getInterQueryDelayMs(config.speed));
  }

  await logTaskEvent(taskId, "Google: crawler zakończony", {
    level: "success",
    details: { leadsSaved },
  });

  await logTaskEvent(taskId, "Google: podsumowanie crawlera", {
    level: "info",
    details: {
      leadsSaved,
      pagesInspected,
      skippedDuplicateDomainInTask,
      skippedExistingLead,
      skippedRejectedLead,
      skippedQualityOrContent,
      skippedUnreachable,
      skippedMissingEmail,
      skippedMissingPhone,
      qualitySkipReasonCounts,
    },
  });

  return leadsSaved;
}

function buildQueries(config: TaskConfig): string[] {
  const queries = new Set<string>();
  const keywords = (config.industry?.keywords || [])
    .map((keyword) => keyword.trim().replace(/\s+/g, " "))
    .filter(Boolean);
  const location = getSearchLocation(config);
  const modifiers = getBusinessModifiers(config);
  const intentTerms = getQueryIntentTerms(config);
  const strongIntentTerms = getStrongLeadIntentTerms(config);
  const queryDepth = getQueryDepthBySpeed(config.speed);

  for (const keyword of keywords) {
    const broadKeywordLeadTerms = getBroadKeywordLeadTerms(keyword, config);
    const broadKeyword = broadKeywordLeadTerms.length > 0;
    const searchExclusionTerms = getSearchExclusionTerms(keyword);
    const variants = [
      ...broadKeywordLeadTerms.map((term) =>
        joinQueryParts(keyword, term, location),
      ),
      joinQueryParts(keyword, location),
      ...strongIntentTerms.map((term) => joinQueryParts(keyword, term, location)),
      ...intentTerms.map((term) => joinQueryParts(keyword, term, location)),
      ...modifiers.map((term) => joinQueryParts(keyword, term, location)),
    ]
      .filter(Boolean)
      .filter((variant, index, all) => all.indexOf(variant) === index);

    const prioritizedVariants = broadKeyword
      ? variants
      : [
          joinQueryParts(keyword, location),
          ...variants.filter((variant) => variant !== joinQueryParts(keyword, location)),
        ];
    const finalizedVariants = prioritizedVariants.map((variant) =>
      appendSearchExclusions(variant, searchExclusionTerms),
    );

    const effectiveQueryDepth = broadKeyword
      ? Math.min(queryDepth + 1, 6)
      : queryDepth;

    for (const variant of finalizedVariants.slice(0, effectiveQueryDepth)) {
      queries.add(variant);
    }
  }

  return [...queries].filter(Boolean);
}

async function searchLinks(query: string): Promise<string[]> {
  const attempts = await debugSearchQuery(query);

  for (const attempt of attempts) {
    console.log("Search endpoint:", attempt.endpoint);
    console.log("HTML size:", attempt.htmlLength);

    if (attempt.sampleLinks.length > 0) {
      return attempt.sampleLinks;
    }
  }

  return [];
}

export async function debugSearchQuery(
  query: string,
): Promise<SearchAttemptDebug[]> {
  const attempts: SearchAttemptDebug[] = [];

  for (const { endpoint, provider } of SEARCH_ENDPOINTS) {
    try {
      const url = endpoint + encodeURIComponent(query);
      const res = await fetch(url, {
        headers: SEARCH_HEADERS,
        cache: "no-store",
        redirect: "follow",
        signal: AbortSignal.timeout(SEARCH_REQUEST_TIMEOUT_MS),
      });

      const html = await res.text();
      const links = extractLinks(html, provider);
      const $ = cheerio.load(html);
      const preview = $("body")
        .text()
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 240);

      attempts.push({
        endpoint,
        provider,
        status: res.status,
        htmlLength: html.length,
        linksFound: links.length,
        sampleLinks: links.slice(0, 10),
        title: $("title").text().trim(),
        preview,
        selectorCounts:
          provider === "bing"
            ? {
                bAlgo: $("li.b_algo").length,
                bingRedirectAnchors: $('a[href*="bing.com/ck/a"]').length,
              }
            : provider === "brave"
              ? {
                  bAlgo: 0,
                  bingRedirectAnchors: 0,
                  braveAnchors: $("a").length,
                }
              : undefined,
      });
    } catch (error) {
      attempts.push({
        endpoint,
        provider,
        htmlLength: 0,
        linksFound: 0,
        sampleLinks: [],
        title: "",
        preview: "",
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return attempts;
}

function extractLinks(
  html: string,
  provider: SearchEndpoint["provider"],
): string[] {
  if (provider === "bing") {
    return extractBingLinks(html);
  }

  if (provider === "brave") {
    return extractBraveLinks(html);
  }

  return extractDuckDuckGoLinks(html);
}

function extractDuckDuckGoLinks(html: string): string[] {
  const links: string[] = [];
  const regex = /uddg=([^&"]+)/g;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(html)) !== null) {
    const url = decodeURIComponent(match[1]);

    if (url.startsWith("http") && !url.includes("duckduckgo")) {
      links.push(url);
    }
  }

  const $ = cheerio.load(html);

  $("a").each((_, el) => {
    const href = $(el).attr("href");

    if (!href) return;

    const normalized = normalizeSearchLink(href);

    if (normalized) {
      links.push(normalized);
    }
  });

  return [...new Set(links)];
}

function extractBingLinks(html: string): string[] {
  const links: string[] = [];
  const $ = cheerio.load(html);

  $("li.b_algo").each((_, el) => {
    const text = $(el).text().replace(/\s+/g, " ").trim();

    if (!text || text.length > 1000 || text.includes("{")) {
      return;
    }

    const href = $(el).find("h2 a").first().attr("href");

    if (!href) {
      return;
    }

    const normalized = normalizeSearchLink(href);

    if (normalized) {
      links.push(normalized);
    }
  });

  $('a[href*="bing.com/ck/a"]').each((_, el) => {
    const href = $(el).attr("href");
    const text = $(el).text().replace(/\s+/g, " ").trim();

    if (!href || !isUsefulBingAnchorText(text)) {
      return;
    }

    const normalized = normalizeSearchLink(href);

    if (normalized && isUsefulBingTarget(normalized)) {
      links.push(normalized);
    }
  });

  return [...new Set(links)];
}

function extractBraveLinks(html: string): string[] {
  const links: string[] = [];
  const $ = cheerio.load(html);

  $("a").each((_, el) => {
    const href = $(el).attr("href");
    const text = $(el).text().replace(/\s+/g, " ").trim();

    if (!href) {
      return;
    }

    if (!isUsefulBraveLink(href, text)) {
      return;
    }

    links.push(href);
  });

  return [...new Set(links)];
}

function normalizeSearchLink(href: string): string | null {
  try {
    if (href.startsWith("//duckduckgo.com/l/?uddg=")) {
      const url = new URL("https:" + href);
      const target = url.searchParams.get("uddg");

      return isUsefulLink(target) ? target : null;
    }

    if (href.startsWith("/l/?uddg=")) {
      const url = new URL("https://duckduckgo.com" + href);
      const target = url.searchParams.get("uddg");

      return isUsefulLink(target) ? target : null;
    }

    if (href.startsWith("http")) {
      if (href.includes("bing.com/ck/a")) {
        const url = new URL(href);
        const encodedTarget = url.searchParams.get("u");
        const target = decodeBingTarget(encodedTarget);

        return isUsefulLink(target) ? target : null;
      }

      return isUsefulLink(href) ? href : null;
    }

    if (href.startsWith("//")) {
      const absolute = "https:" + href;

      return isUsefulLink(absolute) ? absolute : null;
    }
  } catch {
    return null;
  }

  return null;
}

function decodeBingTarget(encodedTarget?: string | null): string | null {
  if (!encodedTarget) {
    return null;
  }

  try {
    const payload = encodedTarget.startsWith("a1")
      ? encodedTarget.slice(2)
      : encodedTarget;
    const decoded = Buffer.from(payload, "base64").toString("utf8");

    return decoded || null;
  } catch {
    return null;
  }
}

function isUsefulLink(url?: string | null): url is string {
  return Boolean(url && url.startsWith("http") && !url.includes("duckduckgo"));
}

function isUsefulBingAnchorText(text: string): boolean {
  if (!text) {
    return false;
  }

  const normalized = normalizeSignalText(text);
  const blocked = [
    "przejdz do zawartosci",
    "opinia dotyczaca ulatwien dostepu",
    "przejdź do zawartości",
    "opinia dotycząca ułatwień dostępu",
    "english",
    "wszystko",
    "obrazy",
    "wideo",
    "mapy",
    "wiadomosci",
    "wiadomości",
    "zakupy",
    "loty",
    "podroze",
    "narzedzia",
    "prywatnosc",
    "podróże",
    "narzędzia",
    "prywatność",
    "warunki",
    "dowiedz sie wiecej",
    "dowiedz się więcej",
  ];

  if (blocked.includes(normalized)) {
    return false;
  }

  return text.length >= 8;
}

function isUsefulBingTarget(url: string): boolean {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase();
    const blockedHosts = [
      "www.bing.com",
      "bing.com",
      "go.microsoft.com",
      "support.microsoft.com",
      "apps.apple.com",
      "play.google.com",
    ];

    if (blockedHosts.includes(host)) {
      return false;
    }

    return true;
  } catch {
    return false;
  }
}

function isUsefulBraveLink(href: string, text: string): boolean {
  if (!href.startsWith("http")) {
    return false;
  }

  if (href.startsWith("tel:")) {
    return false;
  }

  try {
    const parsed = new URL(href);
    const host = parsed.hostname.toLowerCase();
    const blockedHosts = [
      "search.brave.com",
      "brave.com",
      "www.youtube.com",
      "youtube.com",
      "www.instagram.com",
      "instagram.com",
      "play.google.com",
      "apps.apple.com",
    ];

    if (blockedHosts.includes(host)) {
      return false;
    }
  } catch {
    return false;
  }

  const normalizedText = text.toLowerCase();

  if (
    !text ||
    normalizedText === "google" ||
    normalizedText === "bing" ||
    normalizedText === "mojeek"
  ) {
    return false;
  }

  return true;
}

function extractDomain(url: string): string {
  try {
    const u = new URL(url);
    return u.hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function getBusinessModifiers(config: TaskConfig): string[] {
  const entityTypes = new Set(config.entity_type ?? []);
  const modifiers: string[] = [];

  if (entityTypes.has("company")) {
    modifiers.push("firma", "uslugi");
  }

  if (entityTypes.has("shop")) {
    modifiers.push("sklep", "produkty");
  }

  if (entityTypes.has("person") || entityTypes.has("influencer")) {
    modifiers.push("studio", "gabinet");
  }

  if (entityTypes.has("mlm_prospect")) {
    modifiers.push("wellness", "mlm");
  }

  if (modifiers.length === 0) {
    modifiers.push("gabinet", "klinika", "salon");
  }

  return [...new Set(modifiers)];
}

function getBroadKeywordLeadTerms(
  keyword: string,
  config: TaskConfig,
): string[] {
  const normalizedKeyword = normalizeSignalText(keyword);

  if (!isBroadLeadKeyword(normalizedKeyword)) {
    return [];
  }

  const entityTypes = new Set(config.entity_type ?? []);
  const terms: string[] = [];
  const healthLikeKeyword =
    normalizedKeyword.includes("zdrow") ||
    normalizedKeyword.includes("samolecz") ||
    normalizedKeyword.includes("wellness") ||
    normalizedKeyword.includes("terap") ||
    normalizedKeyword.includes("rehabil");
  const beautyLikeKeyword =
    normalizedKeyword.includes("urod") ||
    normalizedKeyword.includes("kosmet") ||
    normalizedKeyword.includes("estety");

  if (healthLikeKeyword) {
    terms.push(
      "gabinet",
      "terapia",
      "cennik",
      "umow wizyte",
      "prywatnie",
      "klinika",
    );
  }

  if (beautyLikeKeyword) {
    terms.push(
      "gabinet",
      "salon",
      "cennik",
      "umow wizyte",
      "kosmetologia",
      "medycyna estetyczna",
    );
  }

  if (
    !healthLikeKeyword &&
    !beautyLikeKeyword &&
    (entityTypes.has("company") ||
      entityTypes.has("person") ||
      entityTypes.has("influencer"))
  ) {
    terms.push("gabinet", "klinika", "salon");
  }

  if (entityTypes.has("shop")) {
    terms.push("sklep", "produkty");
  }

  terms.push("kontakt", "oferta");

  if (healthLikeKeyword) {
    terms.push("rehabilitacja", "zabieg");
  }

  if (beautyLikeKeyword) {
    terms.push("zabieg");
  }

  if (normalizedKeyword.includes("mlm")) {
    terms.push("wellness", "dystrybutor");
  }

  return [...new Set(terms)];
}

function isBroadLeadKeyword(normalizedKeyword: string): boolean {
  const broadKeywordPatterns = [
    "zdrowie",
    "uroda",
    "wellness",
    "samoleczenie",
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
  ];

  return broadKeywordPatterns.some((pattern) =>
    normalizedKeyword.includes(pattern),
  );
}

function getSearchExclusionTerms(keyword: string): string[] {
  const normalizedKeyword = normalizeSignalText(keyword);

  if (!isBroadLeadKeyword(normalizedKeyword)) {
    return [];
  }

  const terms = [
    "gov.pl",
    "nfz",
    "bip",
    "pacjent",
    "ministerstwo",
    "urzad",
    "samorzad",
    "wikipedia",
    "medonet",
    "abczdrowie",
    "poradnikzdrowie",
    "rynekzdrowia",
    "pap",
    "forbes",
  ];

  if (
    normalizedKeyword.includes("zdrow") ||
    normalizedKeyword.includes("samolecz") ||
    normalizedKeyword.includes("wellness") ||
    normalizedKeyword.includes("terap") ||
    normalizedKeyword.includes("rehabil")
  ) {
    terms.push("publiczny", "fundusz");
  }

  return [...new Set(terms)];
}

function isAllowedSearchResult(url: string): boolean {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase();
    const path = parsed.pathname.toLowerCase();

    if (
      BLOCKED_HOST_PATTERNS.some(
        (pattern) => host === pattern || host.endsWith(`.${pattern}`),
      )
    ) {
      console.log("Skipping blocked host:", host);
      return false;
    }

    if (BLOCKED_HOST_FRAGMENTS.some((fragment) => host.includes(fragment))) {
      console.log("Skipping blocked host fragment:", host);
      return false;
    }

    if (BLOCKED_PATH_PATTERNS.some((pattern) => path.includes(pattern))) {
      console.log("Skipping blocked path:", url);
      return false;
    }

    return true;
  } catch {
    return false;
  }
}

function isBlockedPageContent(html: string): boolean {
  const text = normalizePageText(html);
  const blockedFragments = [
    "wikipedia",
    "ministerstwo zdrowia",
    "serwis rzadowy",
    "urzad marszalkowski",
    "centrum e-zdrowia",
    "serwis rządowy",
    "gov.pl",
    "pacjent.gov.pl",
    "pap mediaroom",
    "poradnikzdrowie",
    "abczdrowie",
    "rynek zdrowia",
    "tvn24",
    "radio zet",
    "zhihu",
    "baidu",
  ];

  return blockedFragments.some((fragment) => text.includes(fragment));
}

function hasBusinessIntentPath(url: string): boolean {
  try {
    const path = new URL(url).pathname.toLowerCase();
    const businessPathSignals = [
      "/kontakt",
      "/contact",
      "/o-nas",
      "/about",
      "/oferta",
      "/uslugi",
      "/services",
      "/cennik",
      "/rezerwacja",
      "/booking",
      "/produkty",
      "/produkt",
      "/sklep",
      "/shop",
    ];

    return businessPathSignals.some((signal) => path.includes(signal));
  } catch {
    return false;
  }
}

function isLikelyArticleUrl(url: string): boolean {
  try {
    const path = new URL(url).pathname.toLowerCase();

    if (hasBusinessIntentPath(url)) {
      return false;
    }

    const articleSignals = [
      "co-to",
      "czy-",
      "jak-",
      "dlaczego",
      "poradnik",
      "artyk",
      "blog",
      "news",
      "aktualnosci",
      "wiadomosci",
      "ranking",
      "przewodnik",
      "na-czym-polega",
      "warto",
      "ile-kosztuje",
      "objawy",
      "przyczyny",
    ];

    return articleSignals.some((signal) => path.includes(signal));
  } catch {
    return false;
  }
}

function isEditorialPageContent(html: string): boolean {
  const text = normalizePageText(html);
  const editorialSignals = [
    "redakcja",
    "aktualnosci",
    "magazyn",
    "poradnik",
    "wiadomości",
    "wiadomosci",
    "czytaj więcej",
    "czytaj wiecej",
    "newsletter",
    "artykuł",
    "artykul",
    "portal",
    "news",
    "autor",
    "udostępnij",
    "udostepnij",
    "komentarze",
  ];

  return countSignalMatches(text, editorialSignals) >= 3;
}

function isLikelyBusinessPage(html: string): boolean {
  const text = normalizePageText(html);
  const businessSignals = [
    "kontakt",
    "o nas",
    "oferta",
    "formularz kontaktowy",
    "godziny otwarcia",
    "usługi",
    "uslugi",
    "cennik",
    "rezerwacja",
    "umów wizytę",
    "umow wizyte",
    "gabinet",
    "klinika",
    "salon",
    "centrum",
    "studio",
    "sklep",
    "adres",
    "telefon",
    "nip",
    "regon",
    "krs",
    "tel.",
    "tel:",
    "zespół",
    "zespol",
  ];

  if (countSignalMatches(text, PUBLIC_INSTITUTION_SIGNALS) > 0) {
    return false;
  }

  const businessScore = countSignalMatches(text, businessSignals);
  const strongBusinessScore = countSignalMatches(text, STRONG_BUSINESS_SIGNALS);

  return businessScore >= 3 || strongBusinessScore >= 1;
}

function findPhones(html?: string | null): string[] {
  if (!html) {
    return [];
  }

  const matches = html.match(/(?:\+?\d[\d\s()-]{7,}\d)/g) ?? [];
  const phones = matches
    .map((match) => match.replace(/[^\d+]/g, ""))
    .filter((match) => {
      const digits = match.replace(/\D/g, "");
      return digits.length >= 9 && digits.length <= 12;
    });

  return [...new Set(phones)];
}

function pickLeadEmail(candidates: string[], url: string): string | null {
  const domain = extractDomain(url).replace(/^www\./, "").toLowerCase();
  const cleaned = candidates
    .map((candidate) => candidate.trim().replace(/^%20/i, ""))
    .filter((candidate) => candidate.includes("@"))
    .filter((candidate) => !/[<>"'\s]/.test(candidate))
    .filter((candidate) => !/\.(png|jpg|jpeg|gif|svg|webp)$/i.test(candidate))
    .filter((candidate) => {
      const normalized = candidate.toLowerCase();

      return (
        !normalized.startsWith("license@") &&
        !normalized.startsWith("contact@prestashop") &&
        !normalized.startsWith("noreply@") &&
        !normalized.startsWith("no-reply@")
      );
    });

  const sameDomain = cleaned.find((candidate) =>
    candidate.toLowerCase().endsWith(`@${domain}`),
  );

  return sameDomain ?? cleaned[0] ?? null;
}

function evaluatePageQuality(
  html: string,
  url: string,
  email: string | null,
  phones: string[],
): PageQualityDecision {
  const normalizedText = normalizePageText(html);
  const businessScore = countSignalMatches(normalizedText, BUSINESS_SIGNALS);
  const strongBusinessScore = countSignalMatches(
    normalizedText,
    STRONG_BUSINESS_SIGNALS,
  );
  const editorialScore = countSignalMatches(normalizedText, EDITORIAL_SIGNALS);
  const publicInstitutionScore = countSignalMatches(
    normalizedText,
    PUBLIC_INSTITUTION_SIGNALS,
  );
  const targetBusinessScore = countSignalMatches(
    normalizedText,
    TARGET_BUSINESS_SIGNALS,
  );
  const outOfScopeBusinessScore = countSignalMatches(
    normalizedText,
    OUT_OF_SCOPE_BUSINESS_SIGNALS,
  );
  const editorialPage = isEditorialPageContent(html);
  const likelyBusinessPage = isLikelyBusinessPage(html);
  const sameDomainEmail = hasSameDomainEmail(email, url);
  const hasPhone = phones.length > 0;
  const businessIntentPath = hasBusinessIntentPath(url);
  const articleUrl = isLikelyArticleUrl(url);

  if (isBlockedPageContent(html) || publicInstitutionScore > 0) {
    return {
      accepted: false,
      reason: "Skipping blocked or public institution page:",
    };
  }

  if (
    articleUrl &&
    !businessIntentPath &&
    strongBusinessScore === 0 &&
    targetBusinessScore === 0
  ) {
    return {
      accepted: false,
      reason: "Skipping article-like page:",
    };
  }

  if (editorialPage && editorialScore >= 4 && businessScore < 5) {
    return {
      accepted: false,
      reason: "Skipping editorial page:",
    };
  }

  if (
    editorialPage &&
    !likelyBusinessPage &&
    editorialScore >= 3 &&
    strongBusinessScore === 0 &&
    !sameDomainEmail
  ) {
    return {
      accepted: false,
      reason: "Skipping content-heavy page:",
    };
  }

  if (
    outOfScopeBusinessScore >= 2 &&
    !businessIntentPath &&
    targetBusinessScore === 0
  ) {
    return {
      accepted: false,
      reason: "Skipping out-of-scope business:",
    };
  }

  if (
    outOfScopeBusinessScore >= 1 &&
    targetBusinessScore === 0 &&
    strongBusinessScore === 0 &&
    !sameDomainEmail
  ) {
    return {
      accepted: false,
      reason: "Skipping weak-fit business:",
    };
  }

  if (businessScore < editorialScore && strongBusinessScore === 0) {
    return {
      accepted: false,
      reason: "Skipping low business confidence page:",
    };
  }

  if (!likelyBusinessPage && businessScore < 2 && !sameDomainEmail && !hasPhone) {
    return {
      accepted: false,
      reason: "Skipping weak business signal:",
    };
  }

  return {
    accepted: true,
    reason: "",
  };
}

function getQueryIntentTerms(config: TaskConfig): string[] {
  const entityTypes = new Set(config.entity_type ?? []);
  const terms = new Set<string>();

  if (
    config.quality_filters.email_required ||
    config.quality_filters.phone_required
  ) {
    terms.add("kontakt");
  }

  if (entityTypes.has("company")) {
    terms.add("uslugi");
  }

  if (entityTypes.has("shop")) {
    terms.add("sklep");
  }

  if (entityTypes.has("person") || entityTypes.has("influencer")) {
    terms.add("studio");
  }

  if (entityTypes.has("mlm_prospect")) {
    terms.add("wellness");
  }

  if (terms.size === 0) {
    terms.add("uslugi");
  }

  return [...terms];
}

function getStrongLeadIntentTerms(config: TaskConfig): string[] {
  const entityTypes = new Set(config.entity_type ?? []);
  const terms: string[] = [];

  if (
    config.quality_filters.email_required ||
    config.quality_filters.phone_required ||
    config.quality_filters.website_required
  ) {
    terms.push("kontakt");
  }

  if (entityTypes.has("company")) {
    terms.push("kontakt");
    terms.push("klinika");
  }

  if (entityTypes.has("shop")) {
    terms.push("sklep");
    terms.push("produkt");
  }

  if (entityTypes.has("person") || entityTypes.has("influencer")) {
    terms.push("gabinet");
    terms.push("studio");
  }

  if (entityTypes.has("mlm_prospect")) {
    terms.push("wellness");
  }

  if (
    entityTypes.has("company") ||
    entityTypes.has("person") ||
    entityTypes.has("influencer")
  ) {
    terms.push("salon");
    terms.push("oferta");
  }

  if (terms.length === 0) {
    terms.push("kontakt");
    terms.push("gabinet");
  }

  return [...new Set(terms)];
}

function getQueryDepthBySpeed(speed?: string): number {
  if (speed === "fast") {
    return 2;
  }

  if (speed === "slow") {
    return 5;
  }

  return 4;
}

function getMaxLinksPerQuery(speed: string | undefined, remainingLeads: number) {
  if (speed === "fast") {
    return Math.max(Math.min(remainingLeads + 1, 3), 2);
  }

  if (speed === "slow") {
    return Math.max(Math.min(remainingLeads + 3, 6), 4);
  }

  return Math.max(Math.min(remainingLeads + 2, 5), 3);
}

function getInterQueryDelayMs(speed?: string): number {
  if (speed === "fast") {
    return 250;
  }

  if (speed === "slow") {
    return 1000;
  }

  return 500;
}

function getSearchLocation(config: TaskConfig): string {
  const city = config.geo?.city?.trim();
  const region = config.geo?.region?.trim();
  const country = config.geo?.country?.trim();

  if (city) {
    return city;
  }

  if (region) {
    return region;
  }

  if (country) {
    return normalizeCountryForSearch(country);
  }

  return "";
}

function normalizeCountryForSearch(country: string): string {
  const normalized = country.trim().toUpperCase();

  if (normalized === "PL") {
    return "Polska";
  }

  if (normalized === "DE") {
    return "Niemcy";
  }

  if (normalized === "CZ") {
    return "Czechy";
  }

  if (normalized === "SK") {
    return "Słowacja";
  }

  if (normalized === "LT") {
    return "Litwa";
  }

  if (normalized === "UA") {
    return "Ukraina";
  }

  return country.length > 2 ? country : "";
}

function joinQueryParts(...parts: Array<string | undefined | null>): string {
  return parts
    .map((part) => part?.trim())
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

function appendSearchExclusions(query: string, exclusionTerms: string[]): string {
  if (exclusionTerms.length === 0) {
    return query;
  }

  return joinQueryParts(query, ...exclusionTerms.map((term) => `-${term}`));
}

function normalizeSignalText(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizePageText(html: string): string {
  const $ = cheerio.load(html);
  const text = $("body").text() || html;

  return normalizeSignalText(text);
}

function countSignalMatches(text: string, signals: string[]): number {
  return signals.reduce((count, signal) => {
    return count + (text.includes(signal) ? 1 : 0);
  }, 0);
}

function hasSameDomainEmail(email: string | null, url: string): boolean {
  if (!email) {
    return false;
  }

  const domain = extractDomain(url).replace(/^www\./, "").toLowerCase();

  return email.toLowerCase().endsWith(`@${domain}`);
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
