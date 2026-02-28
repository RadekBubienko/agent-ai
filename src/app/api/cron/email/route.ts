import { NextResponse } from "next/server"

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const secret = searchParams.get("secret")

  return NextResponse.json({
    receivedSecret: secret,
    envSecret: process.env.CRON_SECRET ?? null
  })
}