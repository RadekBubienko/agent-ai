export function normalizeDomain(url?: string | null): string | null {
  if (!url) return null;

  try {
    const u = new URL(url.startsWith("http") ? url : "https://" + url);
    const host = u.hostname.toLowerCase().replace(/^www\./, "");

    return host || null;
  } catch {
    return null;
  }
}

export function normalizeEmail(email?: string | null): string | null {
  const normalized = email?.trim().toLowerCase();

  return normalized || null;
}

export function normalizeLeadName(name?: string | null): string | null {
  const normalized = name
    ?.trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ");

  return normalized || null;
}

export function resolveLeadDomain(input: {
  website?: string | null;
  email?: string | null;
}): string | null {
  return normalizeDomain(input.website) || extractDomainFromEmail(input.email);
}

function extractDomainFromEmail(email?: string | null): string | null {
  const normalizedEmail = normalizeEmail(email);

  if (!normalizedEmail || !normalizedEmail.includes("@")) {
    return null;
  }

  const [, domain] = normalizedEmail.split("@");

  return domain || null;
}
