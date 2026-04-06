export function normalizeDomain(url?: string | null): string | null {
  if (!url) return null;

  try {
    const u = new URL(url.startsWith("http") ? url : "https://" + url);
    const host = u.hostname.toLowerCase().replace(/^www\./, "");

    if (
      host === "facebook.com" ||
      host === "m.facebook.com" ||
      host === "mbasic.facebook.com"
    ) {
      return normalizeFacebookIdentity(u);
    }

    if (host === "instagram.com") {
      return normalizeInstagramIdentity(u);
    }

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

function normalizeFacebookIdentity(url: URL): string {
  const pathname = normalizeSocialPath(url.pathname);
  const profileId = url.searchParams.get("id")?.trim();

  if (pathname === "/profile.php" && profileId) {
    return `facebook.com/profile.php?id=${profileId}`;
  }

  if (pathname && pathname !== "/") {
    return `facebook.com${pathname}`;
  }

  return "facebook.com";
}

function normalizeInstagramIdentity(url: URL): string {
  const pathname = normalizeSocialPath(url.pathname);

  if (pathname && pathname !== "/") {
    return `instagram.com${pathname}`;
  }

  return "instagram.com";
}

function normalizeSocialPath(pathname: string): string {
  return (
    pathname
      .trim()
      .toLowerCase()
      .replace(/\/+$/, "") || "/"
  );
}
