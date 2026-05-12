import { createHmac, timingSafeEqual } from "crypto"
import { NextResponse } from "next/server"
import { recordSocialEvent, type SocialEventInput } from "@/lib/social/conversations"

type MetaWebhookPayload = {
  object?: string
  entry?: Array<Record<string, unknown>>
}

function getVerifyToken() {
  return process.env.META_WEBHOOK_VERIFY_TOKEN?.trim() || null
}

function getAppSecret() {
  return process.env.META_APP_SECRET?.trim() || null
}

function normalizeString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null
}

function normalizeTimestamp(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value > 10_000_000_000 ? new Date(value) : new Date(value * 1000)
  }

  if (typeof value === "string" && value.trim()) {
    const date = new Date(value)
    return Number.isNaN(date.getTime()) ? null : date
  }

  return null
}

function safeObject(value: unknown) {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {}
}

function verifyMetaSignature(rawBody: string, signatureHeader: string | null) {
  const secret = getAppSecret()

  if (!secret) {
    return true
  }

  if (!signatureHeader?.startsWith("sha256=")) {
    return false
  }

  const expected = createHmac("sha256", secret).update(rawBody).digest("hex")
  const actual = signatureHeader.slice("sha256=".length)

  const expectedBuffer = Buffer.from(expected, "hex")
  const actualBuffer = Buffer.from(actual, "hex")

  if (expectedBuffer.length !== actualBuffer.length) {
    return false
  }

  return timingSafeEqual(expectedBuffer, actualBuffer)
}

function extractInstagramCommentEvents(
  businessAccountId: string,
  change: Record<string, unknown>,
) {
  const field = normalizeString(change.field)

  if (field !== "comments" && field !== "live_comments") {
    return []
  }

  const value = safeObject(change.value)
  const from = safeObject(value.from)
  const media = safeObject(value.media)

  const event: SocialEventInput = {
    platform: "instagram",
    businessAccountId,
    customerScopedId: normalizeString(from.id),
    customerUsername: normalizeString(from.username),
    status: "new",
    entrypoint: field === "live_comments" ? "live_comment" : "comment",
    eventType: normalizeString(value.parent_id) ? "comment_reply" : "comment_created",
    direction: "inbound",
    externalMessageId: normalizeString(value.id),
    sourceMediaId: normalizeString(media.id),
    sourceCommentId: normalizeString(value.id),
    text: normalizeString(value.text),
    occurredAt:
      normalizeTimestamp(value.timestamp) ||
      normalizeTimestamp(value.created_time) ||
      new Date(),
    payload: value,
  }

  return [event]
}

function extractPageFeedEvents(
  businessAccountId: string,
  change: Record<string, unknown>,
) {
  const field = normalizeString(change.field)

  if (field !== "feed") {
    return []
  }

  const value = safeObject(change.value)
  const from = safeObject(value.from)
  const item = normalizeString(value.item)

  if (item !== "comment" && item !== "post") {
    return []
  }

  const event: SocialEventInput = {
    platform: "facebook",
    businessAccountId,
    customerScopedId: normalizeString(from.id),
    customerUsername: normalizeString(from.name),
    status: "new",
    entrypoint: item,
    eventType: normalizeString(value.verb) || (item === "comment" ? "comment" : "feed_update"),
    direction: "inbound",
    externalMessageId:
      normalizeString(value.comment_id) ||
      normalizeString(value.post_id) ||
      null,
    sourcePostId: normalizeString(value.post_id),
    sourceCommentId: normalizeString(value.comment_id),
    text: normalizeString(value.message),
    occurredAt:
      normalizeTimestamp(value.created_time) ||
      normalizeTimestamp(value.timestamp) ||
      new Date(),
    payload: value,
  }

  return [event]
}

function extractMessagingEvents(
  platform: "instagram" | "facebook",
  entry: Record<string, unknown>,
) {
  const messaging = Array.isArray(entry.messaging)
    ? (entry.messaging as Array<Record<string, unknown>>)
    : []

  const events: SocialEventInput[] = []

  for (const item of messaging) {
    const sender = safeObject(item.sender)
    const recipient = safeObject(item.recipient)
    const message = safeObject(item.message)
    const postback = safeObject(item.postback)
    const referral = safeObject(item.referral)

    const eventType = message.mid
      ? "message"
      : postback.payload
        ? "postback"
        : referral.ref
          ? "referral"
          : "messaging_event"

    events.push({
      platform,
      businessAccountId:
        normalizeString(recipient.id) ||
        normalizeString(entry.id) ||
        platform,
      customerScopedId: normalizeString(sender.id),
      customerUsername: null,
      status: "engaged",
      entrypoint: eventType === "message" ? "message" : "messaging",
      eventType,
      direction: "inbound",
      externalMessageId:
        normalizeString(message.mid) ||
        normalizeString(postback.mid) ||
        null,
      text:
        normalizeString(message.text) ||
        normalizeString(postback.title) ||
        normalizeString(postback.payload),
      occurredAt: normalizeTimestamp(item.timestamp) || new Date(),
      payload: item,
    })
  }

  return events
}

function extractSocialEvents(payload: MetaWebhookPayload) {
  const objectType = normalizeString(payload.object)
  const entries = Array.isArray(payload.entry)
    ? (payload.entry as Array<Record<string, unknown>>)
    : []
  const events: SocialEventInput[] = []

  for (const entry of entries) {
    const businessAccountId =
      normalizeString(entry.id) ||
      normalizeString(entry.uid) ||
      objectType ||
      "meta"

    const changes = Array.isArray(entry.changes)
      ? (entry.changes as Array<Record<string, unknown>>)
      : []

    for (const change of changes) {
      if (objectType === "instagram") {
        events.push(...extractInstagramCommentEvents(businessAccountId, change))
      }

      if (objectType === "page") {
        events.push(...extractPageFeedEvents(businessAccountId, change))
      }
    }

    if (objectType === "instagram" || objectType === "page") {
      events.push(
        ...extractMessagingEvents(
          objectType === "instagram" ? "instagram" : "facebook",
          entry,
        ),
      )
    }
  }

  return events
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const mode = searchParams.get("hub.mode")
  const verifyToken = searchParams.get("hub.verify_token")
  const challenge = searchParams.get("hub.challenge")
  const expectedToken = getVerifyToken()

  if (!expectedToken) {
    return NextResponse.json(
      { error: "META_WEBHOOK_VERIFY_TOKEN missing" },
      { status: 500 },
    )
  }

  if (mode === "subscribe" && verifyToken === expectedToken && challenge) {
    return new Response(challenge, { status: 200 })
  }

  return NextResponse.json({ error: "Webhook verification failed" }, { status: 403 })
}

export async function POST(request: Request) {
  const rawBody = await request.text()

  if (
    !verifyMetaSignature(rawBody, request.headers.get("x-hub-signature-256"))
  ) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 })
  }

  let payload: MetaWebhookPayload

  try {
    payload = JSON.parse(rawBody) as MetaWebhookPayload
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }

  const events = extractSocialEvents(payload)
  let inserted = 0

  for (const event of events) {
    const result = await recordSocialEvent(event)

    if (result.inserted) {
      inserted++
    }
  }

  return NextResponse.json({
    received: true,
    object: payload.object ?? null,
    eventsExtracted: events.length,
    eventsInserted: inserted,
  })
}
