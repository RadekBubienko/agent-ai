import { TaskConfig } from "@/types/agent"
import { db } from "../db"

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

  const [rows] = await db.query(
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