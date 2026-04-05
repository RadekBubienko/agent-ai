import { after, NextResponse } from "next/server"
import { TaskConfig } from "@/types/agent"
import { startAgentJob } from "@/lib/agent/runner"
import { saveTask } from "@/lib/agent/tasks"

export const maxDuration = 300

export async function POST(req: Request) {

  const body: TaskConfig = await req.json()

  if (!body) {
    return NextResponse.json(
      { error: "Invalid payload" },
      { status: 400 }
    )
  }

  const task = await saveTask(body)

  after(async () => {
    await startAgentJob(task.id, body)
  })

  return NextResponse.json({
    status: "started",
    taskId: task.id
  })
}
