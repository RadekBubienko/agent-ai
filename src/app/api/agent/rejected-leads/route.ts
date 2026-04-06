import { NextResponse } from "next/server";
import { getRejectedLeads } from "@/lib/agent/rejectedLeads";

function parsePage(value: string | null): number {
  const parsed = Number.parseInt(value ?? "1", 10);

  if (!Number.isFinite(parsed) || parsed < 1) {
    return 1;
  }

  return parsed;
}

function parsePageSize(value: string | null): number | "all" {
  if (value === "all") {
    return "all";
  }

  const parsed = Number.parseInt(value ?? "25", 10);

  if ([10, 25, 50, 100].includes(parsed)) {
    return parsed;
  }

  return 25;
}

function parseSort(value: string | null): "newest" | "oldest" {
  return value === "oldest" ? "oldest" : "newest";
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const leads = await getRejectedLeads({
      page: parsePage(searchParams.get("page")),
      pageSize: parsePageSize(searchParams.get("pageSize")),
      sort: parseSort(searchParams.get("sort")),
    });

    return NextResponse.json(leads);
  } catch (error) {
    console.error("Rejected leads fetch failed:", error);

    return NextResponse.json(
      { error: "Rejected leads fetch failed" },
      { status: 500 },
    );
  }
}
