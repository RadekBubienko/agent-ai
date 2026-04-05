import { NextResponse } from "next/server";
import { getRejectedLeads } from "@/lib/agent/rejectedLeads";

export async function GET() {
  try {
    const leads = await getRejectedLeads();

    return NextResponse.json(leads);
  } catch (error) {
    console.error("Rejected leads fetch failed:", error);

    return NextResponse.json(
      { error: "Rejected leads fetch failed" },
      { status: 500 },
    );
  }
}
