import { db } from "@/lib/db"

export async function getAgentLeads(segment?:string|null){

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

  const params:any[] = []

  if(segment){
    query += " AND segment = ?"
    params.push(segment)
  }

  query += " ORDER BY created_at DESC LIMIT 500"

  const [rows] = await db.query(query,params)

  return rows
}