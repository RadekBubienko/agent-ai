import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { EVENT_CONFIG } from "@/lib/eventConfig";
import { recalculateSegment } from "@/lib/recalculateSegment";

export async function GET(req: NextRequest) {
  const leadId = req.nextUrl.searchParams.get("lead");
  const targetUrl = req.nextUrl.searchParams.get("url");
  const clickType = req.nextUrl.searchParams.get("type");

  if (leadId) {
    let eventType = "email_click";

    if (clickType === "business") {
      eventType = "business_interest_click";
    } else if (clickType === "product") {
      eventType = "product_interest_click";
    }

    const eventValue = EVENT_CONFIG[eventType] ?? 10;

    await db.query(
      `INSERT INTO lead_events (lead_id, event_type, event_value)
       VALUES (?, ?, ?)`,
      [leadId, eventType, eventValue],
    );

    await recalculateSegment(Number(leadId));
  }

  return NextResponse.redirect(targetUrl || "https://probalancelife.pl");
}
