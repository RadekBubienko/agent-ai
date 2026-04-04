import type { RowDataPacket } from "mysql2/promise"
import type { DbClient, LeadInput } from "@/types/agent"

type DuplicateLeadRow = RowDataPacket & {
  id: number
}

function normalizeDomain(url?: string | null): string | null {
  if (!url) return null

  try {
    const u = new URL(url.startsWith("http") ? url : "https://" + url)

    let host = u.hostname.toLowerCase()

    if (host.startsWith("www.")) {
      host = host.replace("www.", "")
    }

    return host
  } catch {
    return null
  }
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
