import { NextRequest, NextResponse } from "next/server"
import type { RowDataPacket } from "mysql2/promise"
import { db } from "@/lib/db"
import { EVENT_CONFIG } from "@/lib/eventConfig"

type EventTotalRow = RowDataPacket & {
  total: number
}

type EventBody = {
  leadId?: number
  eventType?: string
  metadata?: unknown
}

function calculateSegment(score: number): string {
  if (score >= 81) return "priority"
  if (score >= 61) return "hot"
  if (score >= 31) return "warm"
  return "cold"
}

export async function POST(req: NextRequest) {
  try {
    const { leadId, eventType, metadata } = (await req.json()) as EventBody

    if (!leadId || !eventType) {
      return NextResponse.json({ error: "Invalid payload" }, { status: 400 })
    }

    const eventValue = EVENT_CONFIG[eventType]

    if (typeof eventValue !== "number") {
      return NextResponse.json({ error: "Unknown event type" }, { status: 400 })
    }

    const connection = await db.getConnection()

    try {
      await connection.beginTransaction()

      await connection.query(
        `INSERT INTO lead_events (lead_id, event_type, event_value, metadata)
         VALUES (?, ?, ?, ?)`,
        [leadId, eventType, eventValue, JSON.stringify(metadata || null)]
      )

      const [rows] = await connection.query<EventTotalRow[]>(
        `SELECT COALESCE(SUM(event_value),0) as total
         FROM lead_events
         WHERE lead_id = ?`,
        [leadId]
      )

      const totalScore = Number(rows[0]?.total ?? 0)
      const segment = calculateSegment(totalScore)

      await connection.query(
        `UPDATE leads
         SET total_score = ?, segment = ?
         WHERE id = ?`,
        [totalScore, segment, leadId]
      )

      await connection.commit()

      return NextResponse.json({
        success: true,
        totalScore,
        segment,
      })
    } catch (err) {
      await connection.rollback()
      throw err
    } finally {
      connection.release()
    }
  } catch (error) {
    console.error(error)
    return NextResponse.json({ error: "Server error" }, { status: 500 })
  }
}
