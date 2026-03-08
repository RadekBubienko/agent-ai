import { db } from "@/lib/db"

export async function getAgentLeads(source?:string|null,segment?:string|null){

  let query = `
    SELECT id,name,email,website,source,segment,total_score,created_at
    FROM leads
    WHERE 1=1
  `

  const params:any[] = []

  if(source){
    query += " AND source = ?"
    params.push(source)
  }

  if(segment){
    query += " AND segment = ?"
    params.push(segment)
  }

  query += " ORDER BY created_at DESC LIMIT 500"

  const [rows] = await db.query(query,params)

  return rows
}