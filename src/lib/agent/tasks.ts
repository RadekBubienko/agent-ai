import type { RowDataPacket } from "mysql2/promise"
import { TaskConfig } from "@/types/agent"
import { db } from "../db"

type AgentTaskRow = RowDataPacket & {
  id: string
  status: string
  leads_found: number
  created_at: string
}

export async function saveTask(config: TaskConfig) {

  const id = crypto.randomUUID()

  await db.query(
    `
    INSERT INTO agent_tasks
    (id,status,config,leads_found,created_at)
    VALUES (?,?,?,?,?)
    `,
    [
      id,
      "running",
      JSON.stringify(config),
      0,
      new Date()
    ]
  )

  return {
    id,
    status: "running",
    config
  }

}

export async function getTasks() {

  const [rows] = await db.query<AgentTaskRow[]>(
    `
    SELECT
      id,
      status,
      leads_found,
      created_at
    FROM agent_tasks
    ORDER BY created_at DESC
    `
  )

  return rows

}

export async function getTaskById(id: string) {

  const [rows] = await db.query<AgentTaskRow[]>(
    `
    SELECT
      id,
      status,
      leads_found,
      created_at
    FROM agent_tasks
    WHERE id = ?
    LIMIT 1
    `,
    [id]
  )

  return rows[0] ?? null

}
