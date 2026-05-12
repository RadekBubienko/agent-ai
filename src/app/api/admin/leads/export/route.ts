import { NextRequest, NextResponse } from "next/server";
import type { RowDataPacket } from "mysql2/promise";
import { db } from "@/lib/db";
import { ensureLeadOriginColumn, type LeadOrigin } from "@/lib/leads/leadOrigin";

type ExportLeadRow = RowDataPacket & {
  id: number;
  name: string | null;
  email: string | null;
  created_at: string;
  ip_address: string | null;
  lead_origin: LeadOrigin | null;
};

function parseOrigin(value: string | null): LeadOrigin | "all" {
  if (value === "all") {
    return "all";
  }

  if (value === "agent" || value === "manual") {
    return value;
  }

  return "landing_page";
};

export async function GET(req: NextRequest) {
  const token = req.headers.get("authorization");

  if (token !== `Bearer ${process.env.ADMIN_TOKEN}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    await ensureLeadOriginColumn();

    const origin = parseOrigin(req.nextUrl.searchParams.get("origin"));
    const values: Array<string> = [];
    const whereSql =
      origin === "all"
        ? ""
        : (() => {
            values.push(origin);
            return "WHERE lead_origin = ?";
          })();

    const [rows] = await db.query<ExportLeadRow[]>(
      `SELECT id, name, email, created_at, ip_address, lead_origin
       FROM leads
       ${whereSql}
       ORDER BY created_at DESC`,
      values,
    );

    const header = "id,name,email,created_at,ip_address,lead_origin\n";

    const csvRows = rows.map(
      (row) =>
        `${row.id},"${row.name ?? ""}","${row.email ?? ""}",${row.created_at},${row.ip_address ?? ""},${row.lead_origin ?? ""}`,
    );

    const csv = header + csvRows.join("\n");

    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv",
        "Content-Disposition": "attachment; filename=leads.csv",
      },
    });
  } catch {
    return NextResponse.json({ error: "Export error" }, { status: 500 });
  }
}
