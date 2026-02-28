import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { sendEducationEmail, sendDecisionEmail } from "@/lib/mailer"

export async function GET(request: Request) {
  try {
    const authHeader = request.headers.get("authorization")

    if (!authHeader || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      )
    }

    const [rows]: any = await db.execute(
      `SELECT es.*, l.email, l.name
       FROM email_sequences es
       JOIN leads l ON es.lead_id = l.id
       WHERE es.sent = false
       AND es.send_at <= NOW()
       LIMIT 20`
    )

    for (const row of rows) {
      try {
        if (row.type === "education") {
          await sendEducationEmail(row.email, row.name)
        }

        if (row.type === "decision") {
          await sendDecisionEmail(row.email, row.name)
        }

        await db.execute(
          `UPDATE email_sequences
           SET sent = true, sent_at = NOW()
           WHERE id = ?`,
          [row.id]
        )

      } catch (error: any) {
        await db.execute(
          `UPDATE email_sequences
           SET error = ?
           WHERE id = ?`,
          [error.message, row.id]
        )
      }
    }

    return NextResponse.json({ processed: rows.length })

  } catch (error) {
    console.error(error)
    return NextResponse.json({ error: "Cron error" }, { status: 500 })
  }
}