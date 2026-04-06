import * as cheerio from "cheerio";
import { findEmails } from "@/lib/ai/findEmails";

export const FACEBOOK_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36",
  "Accept-Language": "pl-PL,pl;q=0.9,en;q=0.8",
  Accept:
    "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
};

const FACEBOOK_REQUEST_TIMEOUT_MS = 8000;

const BLOCKED_EXTERNAL_HOST_PATTERNS = [
  "facebook.com",
  "fb.com",
  "fbcdn.net",
  "messenger.com",
  "m.me",
  "instagram.com",
  "cdninstagram.com",
  "threads.net",
  "meta.com",
  "whatsapp.com",
  "whatsapp.net",
];

const FACEBOOK_CONSENT_URL_MARKERS = [
  "/cookie/consent_prompt/",
  "/login",
  "/checkpoint/",
  "/recover/",
  "/two_step_verification/",
];

const FACEBOOK_CONSENT_TEXT_MARKERS = [
  "allow all cookies",
  "allow essential and optional cookies",
  "we use cookies",
  "before continuing to facebook",
  "please review this decision",
];

const FACEBOOK_LOGIN_TEXT_MARKERS = [
  "create new account",
  "forgot password",
  "email or phone number",
  "mobile number or email",
  "log in to facebook",
  "see more from",
];

export type FacebookFetchBlockReason =
  | "non_ok_status"
  | "consent_or_login"
  | "network_error";

export type FacebookDocumentResult = {
  ok: boolean;
  status?: number;
  finalUrl: string;
  html: string | null;
  blockedReason?: FacebookFetchBlockReason;
};

export type ContactEvidence = {
  emails: string[];
  websites: string[];
  text: string;
};

export async function fetchFacebookDocument(
  url: string,
): Promise<FacebookDocumentResult> {
  try {
    const res = await fetch(url, {
      headers: FACEBOOK_HEADERS,
      cache: "no-store",
      redirect: "follow",
      signal: AbortSignal.timeout(FACEBOOK_REQUEST_TIMEOUT_MS),
    });
    const finalUrl = res.url || url;

    if (!res.ok) {
      return {
        ok: false,
        status: res.status,
        finalUrl,
        html: null,
        blockedReason: "non_ok_status",
      };
    }

    const html = await res.text();

    if (isFacebookConsentOrLoginPage(finalUrl, html)) {
      return {
        ok: false,
        status: res.status,
        finalUrl,
        html,
        blockedReason: "consent_or_login",
      };
    }

    return {
      ok: true,
      status: res.status,
      finalUrl,
      html,
    };
  } catch {
    return {
      ok: false,
      finalUrl: url,
      html: null,
      blockedReason: "network_error",
    };
  }
}

export function isFacebookConsentOrLoginPage(url: string, html: string): boolean {
  const normalizedUrl = safeDecode(url).toLowerCase();

  if (
    FACEBOOK_CONSENT_URL_MARKERS.some((marker) => normalizedUrl.includes(marker))
  ) {
    return true;
  }

  const normalizedText = normalizeText(html).slice(0, 5000);
  const consentScore = FACEBOOK_CONSENT_TEXT_MARKERS.reduce((total, marker) => {
    return total + (normalizedText.includes(marker) ? 1 : 0);
  }, 0);
  const loginScore = FACEBOOK_LOGIN_TEXT_MARKERS.reduce((total, marker) => {
    return total + (normalizedText.includes(marker) ? 1 : 0);
  }, 0);

  return consentScore >= 1 || loginScore >= 3;
}

export function extractContactEvidenceFromHtml(html: string): ContactEvidence {
  const $ = cheerio.load(html);
  const text = ($("body").text() || html).replace(/\s+/g, " ").trim();
  const emails = new Set<string>(findEmails(text));
  const websites = new Set<string>(collectExternalUrlsFromText(text));

  $("a").each((_, el) => {
    const href = $(el).attr("href");

    if (!href) {
      return;
    }

    const mail = extractMailtoEmail(href);

    if (mail) {
      emails.add(mail);
    }

    const normalized = normalizeExternalHref(href);

    if (normalized) {
      websites.add(normalized);
    }

    for (const textUrl of collectExternalUrlsFromText($(el).text())) {
      websites.add(textUrl);
    }
  });

  return {
    emails: [...emails],
    websites: [...websites],
    text,
  };
}

export function extractContactEvidenceFromText(text: string): ContactEvidence {
  const normalizedText = text.replace(/\s+/g, " ").trim();

  return {
    emails: findEmails(normalizedText),
    websites: collectExternalUrlsFromText(normalizedText),
    text: normalizedText,
  };
}

export function normalizeExternalUrl(candidate?: string | null): string | null {
  if (!candidate) {
    return null;
  }

  let value = cleanupUrlCandidate(safeDecode(candidate.trim()));

  if (!value) {
    return null;
  }

  const lowered = value.toLowerCase();

  if (
    lowered.startsWith("mailto:") ||
    lowered.startsWith("tel:") ||
    lowered.startsWith("javascript:") ||
    lowered.startsWith("#")
  ) {
    return null;
  }

  if (value.startsWith("//")) {
    value = "https:" + value;
  }

  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(value)) {
    value = "https://" + value.replace(/^\/+/, "");
  }

  try {
    const parsed = new URL(value);

    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return null;
    }

    const host = parsed.hostname.toLowerCase().replace(/^www\./, "");

    if (!host || isBlockedExternalHost(host)) {
      return null;
    }

    parsed.hash = "";

    return parsed.toString();
  } catch {
    return null;
  }
}

export function extractDomain(url: string): string {
  try {
    const parsed = new URL(url);
    return parsed.hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

export function canonicalizeFacebookUrl(url: string): string {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase();

    if (host === "m.facebook.com" || host === "mbasic.facebook.com") {
      parsed.hostname = "www.facebook.com";
    }

    const removableParams = [
      "__cft__",
      "__tn__",
      "__xts__",
      "comment_id",
      "locale",
      "mibextid",
      "paipv",
      "rdid",
      "ref",
      "refid",
      "refsrc",
      "share_url",
    ];

    for (const key of removableParams) {
      parsed.searchParams.delete(key);
    }

    parsed.hash = "";

    return parsed.toString();
  } catch {
    return url;
  }
}

export function isLikelyFacebookCandidateUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase();
    const path = parsed.pathname.toLowerCase();
    const blockedPathFragments = [
      "/business/help",
      "/checkpoint/",
      "/cookie/consent_prompt/",
      "/dialog/",
      "/events/",
      "/gaming/",
      "/groups/",
      "/help/",
      "/legal/",
      "/login",
      "/marketplace/",
      "/plugins/",
      "/privacy/",
      "/reel/",
      "/settings/",
      "/share/",
      "/sharer",
      "/unsupportedbrowser",
      "/videos/",
      "/watch",
    ];

    if (!host.endsWith("facebook.com")) {
      return false;
    }

    if (!path || path === "/") {
      return false;
    }

    return !blockedPathFragments.some((fragment) => path.includes(fragment));
  } catch {
    return false;
  }
}

export function getFacebookInterRequestDelayMs(speed?: string): number {
  if (speed === "fast") {
    return 250;
  }

  if (speed === "slow") {
    return 1250;
  }

  return 600;
}

export function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function collectExternalUrlsFromText(text: string): string[] {
  const urls = new Set<string>();
  const prepared = safeDecode(text).replace(/[\u00a0\r\n\t]+/g, " ");
  const explicitUrlRegex = /(?:https?:\/\/|www\.)[^\s<>"'()]+/gi;
  const bareDomainRegex =
    /\b(?:[a-z0-9-]+\.)+[a-z]{2,}(?:\/[^\s<>"'()]*)?/gi;

  for (const match of prepared.matchAll(explicitUrlRegex)) {
    const normalized = normalizeExternalUrl(match[0]);

    if (normalized) {
      urls.add(normalized);
    }
  }

  for (const match of prepared.matchAll(bareDomainRegex)) {
    const value = match[0];
    const startIndex = match.index ?? 0;
    const previousChar = startIndex > 0 ? prepared[startIndex - 1] : "";

    if (previousChar === "@") {
      continue;
    }

    const normalized = normalizeExternalUrl(value);

    if (normalized) {
      urls.add(normalized);
    }
  }

  return [...urls];
}

function normalizeExternalHref(href: string): string | null {
  const value = safeDecode(href.trim());

  if (!value) {
    return null;
  }

  if (value.startsWith("/l.php?u=")) {
    try {
      const parsed = new URL("https://www.facebook.com" + value);
      return normalizeExternalUrl(parsed.searchParams.get("u"));
    } catch {
      return null;
    }
  }

  if (value.startsWith("/flx/warn/?u=")) {
    try {
      const parsed = new URL("https://www.facebook.com" + value);
      return normalizeExternalUrl(parsed.searchParams.get("u"));
    } catch {
      return null;
    }
  }

  if (value.includes("facebook.com/l.php")) {
    try {
      const parsed = new URL(value);
      return normalizeExternalUrl(parsed.searchParams.get("u"));
    } catch {
      return null;
    }
  }

  return normalizeExternalUrl(value);
}

function extractMailtoEmail(href: string): string | null {
  if (!href.toLowerCase().startsWith("mailto:")) {
    return null;
  }

  const address = href.slice("mailto:".length).split("?")[0]?.trim();

  if (!address || !address.includes("@")) {
    return null;
  }

  return address;
}

function isBlockedExternalHost(host: string): boolean {
  return BLOCKED_EXTERNAL_HOST_PATTERNS.some((pattern) => {
    return host === pattern || host.endsWith(`.${pattern}`);
  });
}

function cleanupUrlCandidate(value: string): string {
  return value
    .replace(/&amp;/gi, "&")
    .replace(/[)\],.;!?]+$/g, "")
    .replace(/^[(\["']+/, "")
    .trim();
}

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function normalizeText(text: string): string {
  return text.toLowerCase().replace(/\s+/g, " ").trim();
}
