import { NextRequest, NextResponse } from "next/server";
import type { RowDataPacket } from "mysql2/promise";
import { db } from "@/lib/db";

type LeadRow = RowDataPacket & {
  id: number;
  name: string;
  email: string;
  created_at: string;
  ip_address: string;
  status: string;
  segment: string;
  total_score: number;
};

type CountRow = RowDataPacket & {
  total: number;
};

type DayStatRow = RowDataPacket & {
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

type TodayNewRow = RowDataPacket & {
  todayNew: number;
};

type FollowUpRow = RowDataPacket & {
  toFollowUp: number;
};

type IpStatRow = RowDataPacket & {
  ip_address: string;
  count: number;
};

export async function GET(req: NextRequest) {
  const token = req.headers.get("authorization");

  if (token !== `Bearer ${process.env.ADMIN_TOKEN}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const page = Number(searchParams.get("page")) || 1;
  const limit = 20;
  const offset = (page - 1) * limit;

  try {
    const search = searchParams.get("search") || "";
    const statusFilter = searchParams.get("status");
    const dateFrom = searchParams.get("from");
    const dateTo = searchParams.get("to");

    const whereParts: string[] = [];
    const values: Array<string | number> = [];

    if (search) {
      whereParts.push("email LIKE ?");
      values.push(`%${search}%`);
    }

    if (statusFilter) {
      whereParts.push("status = ?");
      values.push(statusFilter);
    }

    if (dateFrom && dateTo) {
      whereParts.push("DATE(created_at) BETWEEN ? AND ?");
      values.push(dateFrom, dateTo);
    }

    const whereClause = whereParts.length
      ? `WHERE ${whereParts.join(" AND ")}`
      : "";

    const [countRows] = await db.query<CountRow[]>(
      `
      SELECT COUNT(*) as total
      FROM leads
      ${whereClause}
      `,
      values,
    );
    const total = countRows[0]?.total ?? 0;

    const [rows] = await db.query<LeadRow[]>(
      `
      SELECT 
        id,
        name,
        email,
        created_at,
        ip_address,
        status,
        segment,
        total_score
      FROM leads
      ${whereClause}
      ORDER BY created_at DESC
      LIMIT ? OFFSET ?
      `,
      [...values, limit, offset],
    );

    const [stats] = await db.query<DayStatRow[]>(`
      SELECT DATE(created_at) as day, COUNT(*) as count
      FROM leads
      GROUP BY day
      ORDER BY day DESC
      LIMIT 30
    `);

    const [statusStats] = await db.query<StatusStatRow[]>(`
      SELECT status, COUNT(*) as count
      FROM leads
      GROUP BY status
    `);

    const [segmentStats] = await db.query<SegmentStatRow[]>(`
      SELECT segment, COUNT(*) as count
      FROM leads
      GROUP BY segment
    `);

    const [todayRows] = await db.query<TodayNewRow[]>(`
      SELECT COUNT(*) as todayNew
      FROM leads
      WHERE status = 'new'
      AND DATE(created_at) = CURDATE()
    `);
    const todayNew = todayRows[0]?.todayNew ?? 0;

    const [followUpRows] = await db.query<FollowUpRow[]>(`
      SELECT COUNT(*) as toFollowUp
      FROM leads
      WHERE status = 'contacted'
      AND DATE(contacted_at) = CURDATE()
    `);
    const toFollowUp = followUpRows[0]?.toFollowUp ?? 0;

    const [ipStats] = await db.query<IpStatRow[]>(`
      SELECT ip_address, COUNT(*) as count
      FROM leads
      GROUP BY ip_address
      HAVING count > 1
      ORDER BY count DESC
      LIMIT 10
    `);

    return NextResponse.json({
      leads: rows,
      total,
      stats,
      statusStats,
      segmentStats,
      todayNew,
      toFollowUp,
      ipStats,
      page,
      totalPages: Math.ceil(total / limit),
    });
  } catch {
    return NextResponse.json({ error: "Database error" }, { status: 500 });
  }
}
