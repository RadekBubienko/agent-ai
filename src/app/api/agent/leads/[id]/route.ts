import { NextResponse } from "next/server";
import { rejectLeadById } from "@/lib/agent/rejectedLeads";

export async function DELETE(
  _req: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const leadId = Number(id);

  if (!Number.isInteger(leadId) || leadId <= 0) {
    return NextResponse.json({ error: "Invalid lead id" }, { status: 400 });
  }

  try {
    const rejected = await rejectLeadById(leadId);

    if (!rejected) {
      return NextResponse.json({ error: "Lead not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Reject lead failed:", error);

    return NextResponse.json({ error: "Reject lead failed" }, { status: 500 });
  }
}
