import type { RowDataPacket } from "mysql2/promise"
import type { DbClient, LeadInput } from "@/types/agent"
import { normalizeDomain } from "./leadIdentity"
import { findRejectedLead } from "./rejectedLeads"

type DuplicateLeadRow = RowDataPacket & {
  id: number
}

export type LeadMatch = {
  id: number
  type: "duplicate" | "rejected"
}

export async function findDuplicate(db: DbClient, lead: LeadInput) {
  if (lead.email) {
    const [rows] = await db.query<DuplicateLeadRow[]>(
      "SELECT id FROM leads WHERE email = ? LIMIT 1",
      [lead.email]
    )

    if (rows.length) return rows[0].id
  }

  const domain = normalizeDomain(lead.website)

  if (domain) {
    const [rows] = await db.query<DuplicateLeadRow[]>(
      "SELECT id FROM leads WHERE domain = ? LIMIT 1",
      [domain]
    )

    if (rows.length) return rows[0].id
  }

  if (lead.name) {
    const [rows] = await db.query<DuplicateLeadRow[]>(
      `
      SELECT id FROM leads
      WHERE name = ?
      LIMIT 1
      `,
      [lead.name]
    )

    if (rows.length) return rows[0].id
  }

  return null
}

export async function findLeadMatch(
  db: DbClient,
  lead: LeadInput,
): Promise<LeadMatch | null> {
  const rejectedId = await findRejectedLead(db, lead)

  if (rejectedId) {
    return {
      id: rejectedId,
      type: "rejected",
    }
  }

  const duplicateId = await findDuplicate(db, lead)

  if (duplicateId) {
    return {
      id: duplicateId,
      type: "duplicate",
    }
  }

  return null
}
