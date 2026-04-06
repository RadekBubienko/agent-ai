import { NextResponse } from "next/server";
import { getAgentLeadsByFilters } from "@/lib/agent/leads";

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
  const { searchParams } = new URL(req.url);

  const segment = searchParams.get("segment");
  const platform = searchParams.get("platform");
  const page = parsePage(searchParams.get("page"));
  const pageSize = parsePageSize(searchParams.get("pageSize"));
  const sort = parseSort(searchParams.get("sort"));

  const leads = await getAgentLeadsByFilters({
    segment,
    platform,
    page,
    pageSize,
    sort,
  });

  return NextResponse.json(leads);
}
