import type { RowDataPacket } from "mysql2/promise"
import { db } from "@/lib/db"
import type { DbClient } from "@/types/agent"

export type LeadOrigin = "agent" | "landing_page" | "manual"

type InformationSchemaRow = RowDataPacket & {
  count: number
}

let ensureLeadOriginColumnPromise: Promise<void> | null = null

export function getLeadOriginFromExistingLead(input: {
  source?: string | null
  lead_type?: string | null
  task_id?: string | null
  lead_origin?: string | null
}) {
  const normalizedOrigin = input.lead_origin?.trim()

  if (normalizedOrigin) {
    return normalizedOrigin as LeadOrigin
  }

  if (
    input.source === "agent" ||
    input.source === "facebook" ||
    input.lead_type === "agent" ||
    Boolean(input.task_id)
  ) {
    return "agent" satisfies LeadOrigin
  }

  return "landing_page" satisfies LeadOrigin
}

export async function ensureLeadOriginColumn(client: DbClient = db) {
  if (!ensureLeadOriginColumnPromise) {
    ensureLeadOriginColumnPromise = (async () => {
      const [columnRows] = await client.query<InformationSchemaRow[]>(
        `
        SELECT COUNT(*) AS count
        FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = 'leads'
          AND COLUMN_NAME = 'lead_origin'
        `,
      )

      if (Number(columnRows[0]?.count ?? 0) === 0) {
        await client.query(`
          ALTER TABLE leads
          ADD COLUMN lead_origin VARCHAR(64) NOT NULL DEFAULT 'landing_page'
          AFTER lead_type
        `)
      }

      const [indexRows] = await client.query<InformationSchemaRow[]>(
        `
        SELECT COUNT(*) AS count
        FROM INFORMATION_SCHEMA.STATISTICS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = 'leads'
          AND INDEX_NAME = 'idx_leads_origin'
        `,
      )

      if (Number(indexRows[0]?.count ?? 0) === 0) {
        await client.query(`
          ALTER TABLE leads
          ADD INDEX idx_leads_origin (lead_origin)
        `)
      }

      await client.query(`
        UPDATE leads
        SET lead_origin = CASE
          WHEN lead_origin = 'manual' THEN 'manual'
          WHEN source = 'agent' OR source = 'facebook' OR lead_type = 'agent' OR task_id IS NOT NULL THEN 'agent'
          ELSE 'landing_page'
        END
      `)
    })().catch((error) => {
      ensureLeadOriginColumnPromise = null
      throw error
    })
  }

  await ensureLeadOriginColumnPromise
}
