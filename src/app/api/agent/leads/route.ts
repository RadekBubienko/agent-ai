import { NextResponse } from "next/server"
import { getAgentLeads } from "@/lib/agent/leads"

export async function GET(req:Request){

  const { searchParams } = new URL(req.url)

  const segment = searchParams.get("segment")

  const leads = await getAgentLeads(segment)

  return NextResponse.json(leads)

}