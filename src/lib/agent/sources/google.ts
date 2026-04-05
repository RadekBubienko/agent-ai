import * as cheerio from "cheerio";
import { fetchWebsite } from "@/lib/ai/fetchWebsite";
import { findEmails } from "@/lib/ai/findEmails";
import type { DbClient, TaskConfig } from "@/types/agent";
import { saveLead } from "../saveLead";

const SEARCH_ENDPOINTS = [
  "https://html.duckduckgo.com/html/?q=",
  "https://lite.duckduckgo.com/lite/?q=",
  "https://duckduckgo.com/html/?q=",
];

const SEARCH_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36",
  "Accept-Language": "pl-PL,pl;q=0.9,en;q=0.8",
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
  for (const endpoint of SEARCH_ENDPOINTS) {
    try {
      const url = endpoint + encodeURIComponent(query);
      const res = await fetch(url, {
        headers: SEARCH_HEADERS,
      });

      const html = await res.text();

      console.log("Search endpoint:", endpoint);
      console.log("HTML size:", html.length);

      const links = extractLinks(html);

      if (links.length > 0) {
        return links;
      }
    } catch (error) {
      console.error("Search fetch failed:", endpoint, error);
    }
  }

  return [];
}

function extractLinks(html: string): string[] {
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
