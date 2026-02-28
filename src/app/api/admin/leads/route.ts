import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

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
    // search condition
    const search = searchParams.get("search") || "";
    const statusFilter = searchParams.get("status");
    const dateFrom = searchParams.get("from");
    const dateTo = searchParams.get("to");

    let whereParts: string[] = [];
    let values: any[] = [];

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

    // total count
    const [[{ total }]]: any = await db.query(
      `
    SELECT COUNT(*) as total
    FROM leads
    ${whereClause}
    `,
      values,
    );

    // leads
    const [rows] = await db.query(
      `
      SELECT id, name, email, created_at, ip_address, status
      FROM leads
      ${whereClause}
      ORDER BY created_at DESC
      LIMIT ? OFFSET ?
      `,
      [...values, limit, offset],
    );

    // daily stats
    const [stats] = await db.query(`
      SELECT DATE(created_at) as day, COUNT(*) as count
      FROM leads
      GROUP BY day
      ORDER BY day DESC
      LIMIT 30
    `);

    // status stats
    const [statusStats] = await db.query(`
      SELECT status, COUNT(*) as count
      FROM leads
      GROUP BY status
    `);

    const [[{ todayNew }]]: any = await db.query(`
      SELECT COUNT(*) as todayNew
      FROM leads
      WHERE status = 'new'
      AND DATE(created_at) = CURDATE()
    `);

    const [[{ toFollowUp }]]: any = await db.query(`
      SELECT COUNT(*) as toFollowUp
      FROM leads
      WHERE status = 'contacted'
      AND DATE(contacted_at) = CURDATE()
    `);

    const [ipStats]: any = await db.query(`
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
      todayNew,
      toFollowUp,
      ipStats,
      page,
      totalPages: Math.ceil(total / limit),
    });
  } catch (error) {
    return NextResponse.json({ error: "Database error" }, { status: 500 });
  }
}
