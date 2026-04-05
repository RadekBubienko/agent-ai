import * as cheerio from "cheerio";
import { fetchWebsite } from "@/lib/ai/fetchWebsite";
import { findEmails } from "@/lib/ai/findEmails";
import type { DbClient, TaskConfig } from "@/types/agent";
import { saveLead } from "../saveLead";
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
) {
  console.log("Search crawler started");
  console.log("Task config:", config);

  const limit = config.limit || 50;
  let leadsSaved = 0;
  const seenDomains = new Set<string>();
  const maxPagesToInspect = Math.max(limit * 5, 20);
  let pagesInspected = 0;

  const queries = buildQueries(config);

  console.log("Generated queries:", queries);
  await logTaskEvent(taskId, "Google: przygotowano zapytania", {
    details: { queries },
  });

  for (const query of queries) {
    if (leadsSaved >= limit || pagesInspected >= maxPagesToInspect) {
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
    const maxLinksThisQuery = Math.min(
      links.length,
      Math.max(remainingLeads * 3, 6),
      remainingPages,
    );
    const candidateLinks = links.slice(0, maxLinksThisQuery);

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
          continue;
        }
      } else {
        console.log("Skipping unreachable page:", link);
        continue;
      }

      if (config.quality_filters.email_required && !email) {
        console.log("Skipping lead without email:", link);
        continue;
      }

      if (config.quality_filters.phone_required && phones.length === 0) {
        console.log("Skipping lead without phone:", link);
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
      }
    }

    await sleep(2000);
  }

  await logTaskEvent(taskId, "Google: crawler zakończony", {
    level: "success",
    details: { leadsSaved },
  });

  return leadsSaved;
}

function buildQueries(config: TaskConfig): string[] {
  const queries = new Set<string>();
  const keywords = (config.industry?.keywords || [])
    .map((keyword) => keyword.trim().replace(/\s+/g, " "))
    .filter(Boolean);
  const location = getSearchLocation(config);
  const modifiers = getBusinessModifiers(config).slice(0, 2);
  const intentTerms = getQueryIntentTerms(config).slice(0, 2);

  for (const keyword of keywords) {
    queries.add(joinQueryParts(keyword, location));

    for (const modifier of modifiers) {
      queries.add(joinQueryParts(keyword, modifier, location));
    }

    for (const intent of intentTerms) {
      queries.add(joinQueryParts(keyword, intent, location));
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

  if (entityTypes.has("mlm_prospect")) {
    return ["wellness", "kontakt", "firma"];
  }

  if (entityTypes.has("shop")) {
    return ["sklep", "hurtownia", "produkty"];
  }

  if (entityTypes.has("person") || entityTypes.has("influencer")) {
    return ["studio", "gabinet", "kontakt"];
  }

  if (entityTypes.has("company")) {
    return ["firma", "uslugi", "kontakt"];
  }

  return ["gabinet", "klinika", "salon"];
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
  const editorialPage = isEditorialPageContent(html);
  const likelyBusinessPage = isLikelyBusinessPage(html);
  const sameDomainEmail = hasSameDomainEmail(email, url);
  const hasPhone = phones.length > 0;

  if (isBlockedPageContent(html) || publicInstitutionScore > 0) {
    return {
      accepted: false,
      reason: "Skipping blocked or public institution page:",
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

  if (entityTypes.has("shop")) {
    terms.add("sklep");
  } else if (entityTypes.has("person") || entityTypes.has("influencer")) {
    terms.add("studio");
  } else if (entityTypes.has("mlm_prospect")) {
    terms.add("wellness");
  } else {
    terms.add("uslugi");
  }

  return [...terms];
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

  if (country && country.length > 2) {
    return country;
  }

  return "";
}

function joinQueryParts(...parts: Array<string | undefined | null>): string {
  return parts
    .map((part) => part?.trim())
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
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
