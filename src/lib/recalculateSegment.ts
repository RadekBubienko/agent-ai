import type { RowDataPacket } from "mysql2/promise";
import { db } from "@/lib/db";
import { sendBusinessAlert, sendClientAlert } from "@/lib/mailer";

type LeadSegment = "neutral" | "engaged" | "business_intent" | "client_intent";

type LeadSegmentRow = RowDataPacket & {
  segment: string;
};

type LeadScoreRow = RowDataPacket & {
  total: number;
  businessScore: number;
  productScore: number;
};

type LeadContactRow = RowDataPacket & {
  name: string;
  email: string;
};

function resolveSegment(
  totalScore: number,
  businessScore: number,
  productScore: number,
): LeadSegment {
  if (businessScore >= 30) return "business_intent";
  if (productScore >= 20) return "client_intent";
  if (totalScore >= 10) return "engaged";

  return "neutral";
}

async function sendSegmentAlert(segment: LeadSegment, leadId: number) {
  if (segment !== "business_intent" && segment !== "client_intent") {
    return;
  }

  const [leadRows] = await db.query<LeadContactRow[]>(
    `SELECT name, email FROM leads WHERE id = ?`,
    [leadId],
  );

  const lead = leadRows[0];
  if (!lead) return;

  if (segment === "business_intent") {
    await sendBusinessAlert(lead.name, lead.email);
    return;
  }

  await sendClientAlert(lead.name, lead.email);
}

export async function recalculateSegment(leadId: number) {
  const [segmentRows] = await db.query<LeadSegmentRow[]>(
    `SELECT segment FROM leads WHERE id = ?`,
    [leadId],
  );
  const currentSegment = (segmentRows[0]?.segment ?? "neutral") as LeadSegment;

  const [scoreRows] = await db.query<LeadScoreRow[]>(
    `
    SELECT
      COALESCE(SUM(event_value),0) as total,
      COALESCE(
        SUM(
          CASE
            WHEN event_type = 'business_interest_click' THEN event_value
            ELSE 0
          END
        ),
        0
      ) as businessScore,
      COALESCE(
        SUM(
          CASE
            WHEN event_type = 'product_interest_click' THEN event_value
            ELSE 0
          END
        ),
        0
      ) as productScore
    FROM lead_events
    WHERE lead_id = ?
    `,
    [leadId],
  );

  const totalScore = Number(scoreRows[0]?.total ?? 0);
  const businessScore = Number(scoreRows[0]?.businessScore ?? 0);
  const productScore = Number(scoreRows[0]?.productScore ?? 0);
  const nextSegment = resolveSegment(totalScore, businessScore, productScore);

  await db.query(
    `UPDATE leads SET total_score = ?, segment = ? WHERE id = ?`,
    [totalScore, nextSegment, leadId],
  );

  if (currentSegment !== nextSegment) {
    await sendSegmentAlert(nextSegment, leadId);
  }
}
