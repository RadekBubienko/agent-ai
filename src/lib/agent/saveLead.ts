import type { ResultSetHeader } from "mysql2/promise";
import { scoreLead } from "@/lib/ai/leadScoring";
import type { DbClient, LeadInput, SaveLeadResult } from "@/types/agent";
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

type SaveLeadOptions = {
  taskId?: string | null;
};

async function incrementTaskLeadCount(
  db: DbClient,
  taskId?: string | null,
): Promise<void> {
  if (!taskId) {
    return;
  }

  await db.query(
    `
    UPDATE agent_tasks
    SET leads_found = COALESCE(leads_found, 0) + 1
    WHERE id = ?
    `,
    [taskId],
  );
}

export async function saveLead(
  db: DbClient,
  lead: LeadInput,
  options: SaveLeadOptions = {},
): Promise<SaveLeadResult> {
  const duplicate = await findDuplicate(db, lead);
  const taskId = options.taskId ?? null;
  const source = lead.source ?? "agent";
  const platform = lead.platform ?? null;

  if (duplicate) {
    console.log("duplicate lead:", duplicate);

    await db.query(
      `
      UPDATE leads
      SET
        source = CASE
          WHEN source IS NULL OR source = '' THEN ?
          WHEN FIND_IN_SET(?, source) > 0 THEN source
          ELSE CONCAT(source, ',', ?)
        END,
        platform = COALESCE(platform, ?),
        task_id = COALESCE(task_id, ?),
        lead_type = CASE
          WHEN lead_type IS NULL OR lead_type = 'inbound' THEN 'agent'
          ELSE lead_type
        END
      WHERE id = ?
      `,
      [source, source, source, platform, taskId, duplicate],
    );

    return { id: duplicate, created: false };
  }

  const domain =
    normalizeDomain(lead.website) ||
    (lead.email ? lead.email.split("@")[1] : null);

  const [result] = await db.query<ResultSetHeader>(
    `
    INSERT INTO leads
    (name,email,website,domain,source,platform,task_id,lead_type,fit_score,intent_score,engagement_score,total_score,segment,created_at)
    VALUES (?,?,?,?,?,?,?,'agent',0,0,0,0,'cold',?)
    `,
    [
      lead.name ?? null,
      lead.email || null,
      lead.website ?? null,
      domain,
      source,
      platform,
      taskId,
      new Date(),
    ],
  );

  const leadId = result.insertId;

  await incrementTaskLeadCount(db, taskId);

  try {
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
  } catch (error) {
    console.error("Lead scoring failed:", error);
  }

  return { id: leadId, created: true };
}
