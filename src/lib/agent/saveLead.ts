import type { ResultSetHeader } from "mysql2/promise";
import { scoreLead } from "@/lib/ai/leadScoring";
import type { DbClient, LeadInput } from "@/types/agent";
import { findDuplicate } from "./dedup";

function normalizeDomain(url?: string | null): string | null {
  if (!url) return null;

  try {
    const u = new URL(url.startsWith("http") ? url : "https://" + url);

    let host = u.hostname.toLowerCase();

    if (host.startsWith("www.")) {
      host = host.replace("www.", "");
    }

    return host;
  } catch {
    return null;
  }
}

export async function saveLead(db: DbClient, lead: LeadInput) {
  const duplicate = await findDuplicate(db, lead);

  if (duplicate) {
    console.log("duplicate lead:", duplicate);

    await db.query(
      "UPDATE leads SET source = CONCAT(source, ',agent') WHERE id = ?",
      [duplicate],
    );

    return duplicate;
  }

  const domain =
    normalizeDomain(lead.website) ||
    (lead.email ? lead.email.split("@")[1] : null);

  const [result] = await db.query<ResultSetHeader>(
    `
    INSERT INTO leads
    (name,email,website,domain,source,platform,fit_score,intent_score,engagement_score,total_score,segment)
    VALUES (?,?,?,?,?, ?,0,0,0,0,'cold')
    `,
    [
      lead.name ?? null,
      lead.email || null,
      lead.website ?? null,
      domain,
      lead.source ?? null,
      lead.platform || null,
    ],
  );

  const leadId = result.insertId;
  const scores = await scoreLead(lead);

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
      leadId,
    ],
  );

  return leadId;
}
