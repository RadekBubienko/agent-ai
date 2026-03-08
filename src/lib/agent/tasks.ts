import { TaskConfig } from "@/types/agent"
import { db } from "../db"

export async function saveTask(config: TaskConfig) {

  const task = {
    id: crypto.randomUUID(),
    status: "running",
    created_at: new Date(),
    config
  }

 
  return task
}
export async function getTasks() {

  const [rows] = await db.query(
    "SELECT id,status,leads_found,created_at FROM agent_tasks ORDER BY created_at DESC"
  )

  return rows
}