import type { RowDataPacket } from "mysql2/promise"
import { db } from "@/lib/db"

type AgentLeadRow = RowDataPacket & {
  id: number
  name: string
  email: string | null
  website: string | null
  source: string
  platform: string | null
  segment: string
  total_score: number
  created_at: string
  status: string
}

export async function getAgentLeads(segment?: string | null) {
  let query = `
    SELECT
      id,
      name,
      email,
      website,
      source,
      platform,
      segment,
      total_score,
      created_at,
      status
    FROM leads
    WHERE source='agent'
  `

  const params: string[] = []

  if (segment) {
    query += " AND segment = ?"
    params.push(segment)
  }

  query += " ORDER BY created_at DESC LIMIT 500"

  const [rows] = await db.query<AgentLeadRow[]>(query, params)

  return rows
}
