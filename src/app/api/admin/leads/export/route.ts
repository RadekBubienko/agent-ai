import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"

export async function GET(req: NextRequest) {
  const token = req.headers.get("authorization")

  if (token !== `Bearer ${process.env.ADMIN_TOKEN}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const [rows]: any = await db.query(
      "SELECT id, name, email, created_at, ip_address FROM leads ORDER BY created_at DESC"
    )

    const header = "id,name,email,created_at,ip_address\n"

    const csvRows = rows.map((row: any) =>
      `${row.id},"${row.name}","${row.email}",${row.created_at},${row.ip_address}`
    )

    const csv = header + csvRows.join("\n")

    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv",
        "Content-Disposition": "attachment; filename=leads.csv",
      },
    })
  } catch (error) {
    return NextResponse.json({ error: "Export error" }, { status: 500 })
  }
}