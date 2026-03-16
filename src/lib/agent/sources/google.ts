import { saveLead } from "../saveLead";
import { TaskConfig } from "@/types/agent";
import { fetchWebsite } from "@/lib/ai/fetchWebsite";
import { findEmails } from "@/lib/ai/findEmails";

export async function crawlGoogle(db: any, config: TaskConfig) {
  console.log("Search crawler started");
  console.log("Task config:", config);

  const limit = config.limit || 50;
  let leadsSaved = 0;

  const queries = buildQueries(config);

  console.log("Generated queries:", queries);

  for (const query of queries) {
    console.log("Search query:", query);

    const url = "https://duckduckgo.com/html/?q=" + encodeURIComponent(query);

    const res = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36",
      },
    });

    const html = await res.text();

    console.log("HTML size:", html.length);

    const links = extractLinks(html);

    console.log("Links found:", links.length);

    for (const link of links) {
      if (leadsSaved >= limit) {
        console.log("Limit reached:", limit);
        return;
      }

      // ---------------------------------
      // ANALIZA STRONY I SZUKANIE EMAILA
      // ---------------------------------

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

      await saveLead(db, lead);

      leadsSaved++;
    }

    await sleep(2000);
  }
}

/* ---------------- HELPERS ---------------- */

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

function extractLinks(html: string): string[] {
  const links: string[] = [];

  const regex = /uddg=([^&"]+)/g;

  let match;

  while ((match = regex.exec(html)) !== null) {
    const url = decodeURIComponent(match[1]);

    if (url.startsWith("http") && !url.includes("duckduckgo")) {
      links.push(url);
    }
  }

  return [...new Set(links)];
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
