import { NextResponse } from "next/server"
import { getAgentLeadsByFilters } from "@/lib/agent/leads"

export async function GET(req:Request){

  const { searchParams } = new URL(req.url)

  const segment = searchParams.get("segment")
  const platform = searchParams.get("platform")

  const leads = await getAgentLeadsByFilters({ segment, platform })

  return NextResponse.json(leads)

}
