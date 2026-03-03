import { db } from "@/lib/db"
import { sendBusinessAlert } from "@/lib/mailer"
import { sendClientAlert } from "@/lib/mailer"

export async function recalculateSegment(leadId: number) {

  // 1️⃣ pobierz aktualny segment
  const [currentRows]: any = await db.query(
    `SELECT segment FROM leads WHERE id = ?`,
    [leadId]
  )

  const currentSegment = currentRows[0]?.segment ?? "neutral"

  // 2️⃣ przelicz eventy
  const [rows]: any = await db.query(
    `
    SELECT
      COALESCE(SUM(event_value),0) as total,

      COALESCE(SUM(CASE 
        WHEN event_type = 'business_interest_click' 
        THEN event_value ELSE 0 END),0) as businessScore,

      COALESCE(SUM(CASE 
        WHEN event_type = 'product_interest_click' 
        THEN event_value ELSE 0 END),0) as productScore

    FROM lead_events
    WHERE lead_id = ?
    `,
    [leadId]
  )

  const totalScore = Number(rows[0].total)
  const businessScore = Number(rows[0].businessScore)
  const productScore = Number(rows[0].productScore)

  let newSegment = "neutral"

  if (businessScore >= 30) {
    newSegment = "business_intent"
  } else if (productScore >= 20) {
    newSegment = "client_intent"
  } else if (totalScore >= 10) {
    newSegment = "engaged"
  }

  // 3️⃣ update segment + score
  await db.query(
    `UPDATE leads SET total_score = ?, segment = ? WHERE id = ?`,
    [totalScore, newSegment, leadId]
  )

  // 4️⃣ jeśli zmiana na business_intent lub client_intent → alert
  if (currentSegment !== newSegment) {

  const [leadRows]: any = await db.query(
    `SELECT name, email FROM leads WHERE id = ?`,
    [leadId]
  )

  const lead = leadRows[0]

  if (newSegment === "business_intent") {
    await sendBusinessAlert(lead.name, lead.email)
  }

  if (newSegment === "client_intent") {
    await sendClientAlert(lead.name, lead.email)
  }
}
}