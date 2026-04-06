import { NextRequest, NextResponse } from "next/server";
import type { RowDataPacket } from "mysql2/promise";
import { db } from "@/lib/db";

type LeadRow = RowDataPacket & {
  id: number;
  name: string | null;
  email: string | null;
  created_at: string;
  ip_address: string | null;
  status: string | null;
  segment: string | null;
  total_score: number | null;
};

type CountRow = RowDataPacket & {
  count: number;
};

type StatRow = RowDataPacket & {
  day: string;
  count: number;
};

type StatusStatRow = RowDataPacket & {
  status: string;
  count: number;
};

type SegmentStatRow = RowDataPacket & {
  segment: string;
  count: number;
};

type IpStatRow = RowDataPacket & {
  ip_address: string;
  count: number;
};

const PAGE_SIZE_OPTIONS = new Set(["10", "25", "50", "100", "all"]);

function parsePage(value: string | null): number {
  const parsed = Number.parseInt(value ?? "1", 10);

  if (!Number.isFinite(parsed) || parsed < 1) {
    return 1;
  }

  return parsed;
}

function parsePageSize(value: string | null): number | "all" {
  if (!value || !PAGE_SIZE_OPTIONS.has(value)) {
    return 25;
  }

  if (value === "all") {
    return "all";
  }

  return Number.parseInt(value, 10);
}

function parseSort(value: string | null): "newest" | "oldest" {
  return value === "oldest" ? "oldest" : "newest";
}

export async function GET(req: NextRequest) {
  const token = req.headers.get("authorization");

  if (token !== `Bearer ${process.env.ADMIN_TOKEN}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const searchParams = req.nextUrl.searchParams;
    const page = parsePage(searchParams.get("page"));
    const pageSize = parsePageSize(searchParams.get("pageSize"));
    const sort = parseSort(searchParams.get("sort"));
    const search = searchParams.get("search")?.trim() ?? "";
    const status = searchParams.get("status")?.trim() ?? "";
    const from = searchParams.get("from")?.trim() ?? "";
    const to = searchParams.get("to")?.trim() ?? "";

    const whereClauses: string[] = [];
    const values: Array<string | number> = [];

    if (search) {
      const like = `%${search}%`;
      whereClauses.push("(name LIKE ? OR email LIKE ? OR ip_address LIKE ?)");
      values.push(like, like, like);
    }

    if (status) {
      whereClauses.push("status = ?");
      values.push(status);
    }

    if (from) {
      whereClauses.push("DATE(created_at) >= ?");
      values.push(from);
    }

    if (to) {
      whereClauses.push("DATE(created_at) <= ?");
      values.push(to);
    }

    const whereSql =
      whereClauses.length > 0 ? `WHERE ${whereClauses.join(" AND ")}` : "";
    const orderDirection = sort === "oldest" ? "ASC" : "DESC";

    const [totalRows] = await db.query<CountRow[]>(
      `SELECT COUNT(*) AS count FROM leads ${whereSql}`,
      values,
    );

    const total = Number(totalRows[0]?.count ?? 0);
    const totalPages =
      pageSize === "all" ? 1 : Math.max(1, Math.ceil(total / pageSize));
    const currentPage = pageSize === "all" ? 1 : Math.min(page, totalPages);

    const leadValues = [...values];
    let leadQuery = `
      SELECT id, name, email, created_at, ip_address, status, segment, total_score
      FROM leads
      ${whereSql}
      ORDER BY created_at ${orderDirection}, id ${orderDirection}
    `;

    if (pageSize !== "all") {
      leadQuery += " LIMIT ? OFFSET ?";
      leadValues.push(pageSize, (currentPage - 1) * pageSize);
    }

    const [leads] = await db.query<LeadRow[]>(leadQuery, leadValues);

    const [stats] = await db.query<StatRow[]>(`
      SELECT day, count
      FROM (
        SELECT
          DATE_FORMAT(DATE(created_at), '%Y-%m-%d') AS day,
          COUNT(*) AS count
        FROM leads
        GROUP BY DATE(created_at)
        ORDER BY DATE(created_at) DESC
        LIMIT 14
      ) recent_days
      ORDER BY day ASC
    `);

    const [statusStats] = await db.query<StatusStatRow[]>(`
      SELECT COALESCE(status, 'new') AS status, COUNT(*) AS count
      FROM leads
      GROUP BY COALESCE(status, 'new')
      ORDER BY count DESC
    `);

    const [segmentStats] = await db.query<SegmentStatRow[]>(`
      SELECT COALESCE(segment, 'unknown') AS segment, COUNT(*) AS count
      FROM leads
      GROUP BY COALESCE(segment, 'unknown')
      ORDER BY count DESC
    `);

    const [ipStats] = await db.query<IpStatRow[]>(`
      SELECT ip_address, COUNT(*) AS count
      FROM leads
      WHERE ip_address IS NOT NULL AND ip_address <> ''
      GROUP BY ip_address
      HAVING COUNT(*) > 1
      ORDER BY count DESC, ip_address ASC
      LIMIT 10
    `);

    const [todayRows] = await db.query<CountRow[]>(`
      SELECT COUNT(*) AS count
      FROM leads
      WHERE DATE(created_at) = CURDATE()
    `);

    const [followUpRows] = await db.query<CountRow[]>(`
      SELECT COUNT(*) AS count
      FROM leads
      WHERE status = 'contacted' AND DATE(contacted_at) = CURDATE()
    `);

    return NextResponse.json({
      leads,
      stats,
      total,
      page: currentPage,
      totalPages,
      pageSize,
      sort,
      statusStats,
      todayNew: Number(todayRows[0]?.count ?? 0),
      toFollowUp: Number(followUpRows[0]?.count ?? 0),
      ipStats,
      segmentStats,
    });
  } catch (error) {
    console.error("Admin leads fetch failed:", error);

    return NextResponse.json(
      { error: "Could not load admin leads" },
      { status: 500 },
    );
  }
}
