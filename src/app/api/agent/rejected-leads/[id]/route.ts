import { NextResponse } from "next/server";
import { restoreRejectedLeadById } from "@/lib/agent/rejectedLeads";

export async function POST(
  _req: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const rejectedLeadId = Number(id);

  if (!Number.isInteger(rejectedLeadId) || rejectedLeadId <= 0) {
    return NextResponse.json(
      { error: "Invalid rejected lead id" },
      { status: 400 },
    );
  }

  try {
    const result = await restoreRejectedLeadById(rejectedLeadId);

    if (!result.success) {
      return NextResponse.json(
        { error: "Rejected lead not found" },
        { status: 404 },
      );
    }

    return NextResponse.json({
      success: true,
      leadId: result.leadId,
      reusedExisting: result.reusedExisting,
    });
  } catch (error) {
    console.error("Restore rejected lead failed:", error);

    return NextResponse.json(
      { error: "Restore rejected lead failed" },
      { status: 500 },
    );
  }
}
