import { findDuplicate } from "./dedup";
import { scoreLead } from "@/lib/ai/leadScoring";

export async function saveLead(db:any, lead:any) {

  const duplicate = await findDuplicate(db, lead)

  if (duplicate) {

    console.log("duplicate lead:", duplicate)

    await db.query(
      "UPDATE leads SET source = CONCAT(source, ',agent') WHERE id = ?",
      [duplicate]
    )

    return duplicate
  }

  const [result] = await db.query(
`
INSERT INTO leads
(name,email,website,source,platform,fit_score,intent_score,engagement_score,total_score,segment)
VALUES (?,?,?,?,?,0,0,0,0,'cold')
`,
[
lead.name,
lead.email || null,
lead.website,
lead.source,
lead.platform || null
]
)

  const leadId = result.insertId

  const scores = await scoreLead(lead)

  await db.query(
  `
  UPDATE leads
  SET
  fit_score=?,
  intent_score=?,
  engagement_score=?,
  total_score=?,
  segment=?
  WHERE id=?
  `,
  [
  scores.fit_score,
  scores.intent_score,
  scores.engagement_score,
  scores.total_score,
  scores.segment,
  leadId
  ]
  )

  return leadId
}