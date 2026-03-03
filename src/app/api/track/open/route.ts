import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { EVENT_CONFIG } from "@/lib/eventConfig";
import { recalculateSegment } from "@/lib/recalculateSegment";

export async function GET(req: NextRequest) {
  const leadId = req.nextUrl.searchParams.get("lead");

  if (leadId) {
    const eventValue = EVENT_CONFIG["email_open"] ?? 5;

    await db.query(
      `INSERT INTO lead_events (lead_id, event_type, event_value)
       VALUES (?, 'email_open', ?)`,
      [leadId, eventValue],
    );

    await recalculateSegment(Number(leadId));
    //await db.query(
    //  `UPDATE leads
    //  SET total_score = total_score + ?
    //   WHERE id = ?`,
    //  [eventValue, leadId]
    //)
  }

  // 1x1 transparent GIF
  const pixel = Buffer.from(
    "R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==",
    "base64",
  );

  return new Response(pixel, {
    headers: {
      "Content-Type": "image/gif",
      "Cache-Control": "no-store",
    },
  });
}
