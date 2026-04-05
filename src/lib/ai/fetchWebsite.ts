export async function fetchWebsite(url: string) {
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
      },
      cache: "no-store",
    });

    const html = await res.text();

    return html;
  } catch {
    console.log("Fetch failed:", url);

    return null;
  }
}
