import { NextResponse } from "next/server"
import { getTasks } from "@/lib/agent/tasks"

export async function GET() {

  const tasks = await getTasks()

  return NextResponse.json(tasks)

}