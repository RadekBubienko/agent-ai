import { NextRequest, NextResponse } from "next/server";
import type { ResultSetHeader } from "mysql2/promise";
import { db } from "@/lib/db";

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const token = req.headers.get("authorization");

  if (token !== `Bearer ${process.env.ADMIN_TOKEN}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;
  const { status } = (await req.json()) as { status: string };

  console.log("Updating ID:", id);
  console.log("New status:", status);

  try {
    let query = "UPDATE leads SET status = ?";
    const values: Array<string | number> = [status];

    if (status === "contacted") {
      query += ", contacted_at = NOW()";
    }

    query += " WHERE id = ?";
    values.push(id);

    const [result] = await db.query<ResultSetHeader>(query, values);

    console.log("Affected rows:", result.affectedRows);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Update failed" }, { status: 500 });
  }
}
