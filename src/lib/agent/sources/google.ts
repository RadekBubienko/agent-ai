import * as cheerio from "cheerio";
import { fetchWebsite } from "@/lib/ai/fetchWebsite";
import { findEmails } from "@/lib/ai/findEmails";
import type { DbClient, TaskConfig } from "@/types/agent";
import { saveLead } from "../saveLead";

type SearchEndpoint = {
  endpoint: string;
  provider: "duckduckgo" | "bing";
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
    endpoint: "https://www.bing.com/search?cc=pl&setlang=pl&mkt=pl-PL&q=",
    provider: "bing",
  },
];

const SEARCH_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36",
  "Accept-Language": "pl-PL,pl;q=0.9,en;q=0.8",
};

export type SearchAttemptDebug = {
  endpoint: string;
  provider: "duckduckgo" | "bing";
  status?: number;
  htmlLength: number;
  linksFound: number;
  sampleLinks: string[];
  title: string;
  preview: string;
  error?: string;
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

  const queries = buildQueries(config);

  console.log("Generated queries:", queries);

  for (const query of queries) {
    console.log("Search query:", query);

    const links = await searchLinks(query);

    console.log("Links found:", links.length);

    for (const link of links) {
      if (leadsSaved >= limit) {
        console.log("Limit reached:", limit);
        return leadsSaved;
      }

      const htmlPage = await fetchWebsite(link);
      let email: string | null = null;

      if (htmlPage) {
        const emails = findEmails(htmlPage);

        console.log("Emails found:", emails);

        if (emails.length > 0) {
          email = emails[0];
        }
      }

      const lead = {
        name: extractDomain(link),
        website: link,
        source: "agent",
        platform: "search",
        email,
      };

      console.log("Saving lead:", lead);

      const result = await saveLead(db, lead, { taskId });

      if (result.created) {
        leadsSaved++;
      }
    }

    await sleep(2000);
  }

  return leadsSaved;
}

function buildQueries(config: TaskConfig): string[] {
  const queries: string[] = [];
  const keywords = config.industry?.keywords || [];
  const city = config.geo?.city;
  const country = config.geo?.country;

  for (const keyword of keywords) {
    if (city) queries.push(`${keyword} ${city}`);
    if (country) queries.push(`${keyword} ${country}`);

    queries.push(keyword);
  }

  return queries;
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

function extractDomain(url: string): string {
  try {
    const u = new URL(url);
    return u.hostname;
  } catch {
    return url;
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
