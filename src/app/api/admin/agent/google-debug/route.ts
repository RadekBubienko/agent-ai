import { NextRequest, NextResponse } from "next/server";
import { findEmails } from "@/lib/ai/findEmails";
import { fetchWebsite } from "@/lib/ai/fetchWebsite";
import { debugSearchQuery } from "@/lib/agent/sources/google";

export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const token = req.headers.get("authorization");

  if (token !== `Bearer ${process.env.ADMIN_TOKEN}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const query = searchParams.get("q")?.trim();

  if (!query) {
    return NextResponse.json(
      { error: "Missing q parameter" },
      { status: 400 },
    );
  }

  const attempts = await debugSearchQuery(query);
  const firstLink =
    attempts.find((attempt) => attempt.sampleLinks.length > 0)?.sampleLinks[0] ??
    null;

  let websiteDebug: {
    url: string;
    htmlLength: number;
    emails: string[];
  } | null = null;

  if (firstLink) {
    const html = await fetchWebsite(firstLink);

    websiteDebug = {
      url: firstLink,
      htmlLength: html?.length ?? 0,
      emails: html ? findEmails(html).slice(0, 10) : [],
    };
  }

  return NextResponse.json({
    query,
    attempts,
    websiteDebug,
  });
}
