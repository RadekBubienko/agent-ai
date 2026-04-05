const WEBSITE_FETCH_TIMEOUT_MS = 8000;

export async function fetchWebsite(url: string) {
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
      },
      cache: "no-store",
      redirect: "follow",
      signal: AbortSignal.timeout(WEBSITE_FETCH_TIMEOUT_MS),
    });

    if (!res.ok) {
      console.log("Fetch returned non-ok status:", res.status, url);

      return null;
    }

    const html = await res.text();

    return html;
  } catch {
    console.log("Fetch failed:", url);

    return null;
  }
}
