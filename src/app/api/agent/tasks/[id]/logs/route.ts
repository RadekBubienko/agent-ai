import { NextResponse } from "next/server";
import { getTaskLogs } from "@/lib/agent/taskLogs";

export async function GET(
  req: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const { searchParams } = new URL(req.url);
  const limit = Number(searchParams.get("limit")) || 200;

  try {
    const logs = await getTaskLogs(id, limit);

    return NextResponse.json(logs);
  } catch (error) {
    console.error("Task log read failed:", error);

    return NextResponse.json({ error: "Task logs unavailable" }, { status: 500 });
  }
}
