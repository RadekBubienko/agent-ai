import { after, NextResponse } from "next/server"
import { TaskConfig } from "@/types/agent"
import { startAgentJob } from "@/lib/agent/runner"
import { saveTask } from "@/lib/agent/tasks"
import { logTaskEvent } from "@/lib/agent/taskLogs"

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

  await logTaskEvent(task.id, "Task utworzony", {
    details: {
      sources: body.sources,
      keywords: body.industry?.keywords ?? [],
      limit: body.limit,
    },
  })

  after(async () => {
    await startAgentJob(task.id, body)
  })

  return NextResponse.json({
    status: "started",
    taskId: task.id
  })
}
