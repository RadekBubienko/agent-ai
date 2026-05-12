import { createHash } from "crypto"
import type { ResultSetHeader, RowDataPacket } from "mysql2/promise"
import { db } from "@/lib/db"
import type { DbClient } from "@/types/agent"

export type SocialPlatform = "instagram" | "facebook"
export type SocialDirection = "inbound" | "outbound" | "system"

export type SocialConversationStatus =
  | "new"
  | "engaged"
  | "awaiting_landing"
  | "registered"
  | "closed"

export type SocialEventInput = {
  platform: SocialPlatform
  businessAccountId: string
  businessUsername?: string | null
  customerScopedId?: string | null
  customerUsername?: string | null
  leadId?: number | null
  status?: SocialConversationStatus | null
  entrypoint?: string | null
  eventType: string
  direction: SocialDirection
  externalMessageId?: string | null
  sourceMediaId?: string | null
  sourceCommentId?: string | null
  sourcePostId?: string | null
  entryKeyword?: string | null
  text?: string | null
  occurredAt?: Date | string | number | null
  payload?: unknown
}

type SocialConversationRow = RowDataPacket & {
  id: number
}

let ensureSocialTablesPromise: Promise<void> | null = null

async function ensureSocialTables(client: DbClient = db) {
  if (!ensureSocialTablesPromise) {
    ensureSocialTablesPromise = (async () => {
      await client.query(`
        CREATE TABLE IF NOT EXISTS social_conversations (
          id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
          conversation_key VARCHAR(191) NOT NULL,
          platform VARCHAR(32) NOT NULL,
          business_account_id VARCHAR(128) NOT NULL,
          business_username VARCHAR(191) NULL,
          customer_scoped_id VARCHAR(128) NULL,
          customer_username VARCHAR(191) NULL,
          lead_id BIGINT UNSIGNED NULL,
          status VARCHAR(32) NOT NULL DEFAULT 'new',
          entrypoint VARCHAR(64) NULL,
          entry_keyword VARCHAR(191) NULL,
          source_media_id VARCHAR(128) NULL,
          source_comment_id VARCHAR(128) NULL,
          source_post_id VARCHAR(128) NULL,
          last_event_type VARCHAR(64) NULL,
          last_message_text TEXT NULL,
          last_event_at DATETIME NULL,
          metadata LONGTEXT NULL,
          created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          UNIQUE KEY uniq_social_conversation_key (conversation_key),
          KEY idx_social_conversations_platform_status (platform, status),
          KEY idx_social_conversations_customer (platform, customer_scoped_id),
          KEY idx_social_conversations_lead (lead_id)
        )
      `)

      await client.query(`
        CREATE TABLE IF NOT EXISTS social_messages (
          id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
          conversation_id BIGINT UNSIGNED NOT NULL,
          dedup_key VARCHAR(191) NOT NULL,
          platform VARCHAR(32) NOT NULL,
          direction VARCHAR(16) NOT NULL,
          entrypoint VARCHAR(64) NULL,
          event_type VARCHAR(64) NOT NULL,
          external_message_id VARCHAR(128) NULL,
          customer_scoped_id VARCHAR(128) NULL,
          customer_username VARCHAR(191) NULL,
          source_media_id VARCHAR(128) NULL,
          source_comment_id VARCHAR(128) NULL,
          source_post_id VARCHAR(128) NULL,
          text TEXT NULL,
          payload LONGTEXT NULL,
          occurred_at DATETIME NULL,
          created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          UNIQUE KEY uniq_social_messages_dedup (dedup_key),
          KEY idx_social_messages_conversation_created (conversation_id, created_at),
          CONSTRAINT fk_social_messages_conversation
            FOREIGN KEY (conversation_id)
            REFERENCES social_conversations (id)
            ON DELETE CASCADE
        )
      `)
    })().catch((error) => {
      ensureSocialTablesPromise = null
      throw error
    })
  }

  await ensureSocialTablesPromise
}

function normalizeOptionalString(value?: string | null) {
  const normalized = value?.trim()
  return normalized || null
}

function normalizeOccurredAt(value?: Date | string | number | null) {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    const timestamp = value > 10_000_000_000 ? value : value * 1000
    const date = new Date(timestamp)
    return Number.isNaN(date.getTime()) ? null : date
  }

  if (typeof value === "string" && value.trim()) {
    const date = new Date(value)
    return Number.isNaN(date.getTime()) ? null : date
  }

  return null
}

function safeJsonStringify(value: unknown) {
  if (value === undefined) {
    return null
  }

  try {
    return JSON.stringify(value)
  } catch {
    return JSON.stringify({ error: "payload_stringify_failed" })
  }
}

function shortHash(input: string) {
  return createHash("sha256").update(input).digest("hex").slice(0, 24)
}

function shrinkKey(rawKey: string) {
  if (rawKey.length <= 191) {
    return rawKey
  }

  return `hash:${shortHash(rawKey)}`
}

function buildConversationKey(event: SocialEventInput) {
  if (event.customerScopedId) {
    return shrinkKey(
      `${event.platform}:${event.businessAccountId}:customer:${event.customerScopedId}`,
    )
  }

  if (event.sourceCommentId) {
    return shrinkKey(
      `${event.platform}:${event.businessAccountId}:comment:${event.sourceCommentId}`,
    )
  }

  if (event.sourceMediaId) {
    return shrinkKey(
      `${event.platform}:${event.businessAccountId}:media:${event.sourceMediaId}`,
    )
  }

  return shrinkKey(
    `${event.platform}:${event.businessAccountId}:anon:${shortHash(
      safeJsonStringify(event.payload) || event.text || event.eventType,
    )}`,
  )
}

function buildDedupKey(event: SocialEventInput) {
  if (event.externalMessageId) {
    return shrinkKey(
      `${event.platform}:${event.eventType}:message:${event.externalMessageId}`,
    )
  }

  if (event.sourceCommentId) {
    return shrinkKey(
      `${event.platform}:${event.eventType}:comment:${event.sourceCommentId}:${event.direction}`,
    )
  }

  if (event.sourceMediaId && event.customerScopedId) {
    return shrinkKey(
      `${event.platform}:${event.eventType}:media:${event.sourceMediaId}:user:${event.customerScopedId}:${event.direction}`,
    )
  }

  return shrinkKey(
    `${event.platform}:${event.eventType}:hash:${shortHash(
      [
        event.direction,
        event.entrypoint,
        event.customerScopedId,
        event.sourcePostId,
        event.sourceMediaId,
        event.text,
        safeJsonStringify(event.payload),
      ]
        .filter(Boolean)
        .join("|"),
    )}`,
  )
}

async function getConversationIdByKey(
  client: DbClient,
  conversationKey: string,
) {
  const [rows] = await client.query<SocialConversationRow[]>(
    `
    SELECT id
    FROM social_conversations
    WHERE conversation_key = ?
    LIMIT 1
    `,
    [conversationKey],
  )

  return Number(rows[0]?.id ?? 0) || null
}

export async function recordSocialEvent(
  event: SocialEventInput,
  client: DbClient = db,
) {
  await ensureSocialTables(client)

  const conversationKey = buildConversationKey(event)
  const dedupKey = buildDedupKey(event)
  const occurredAt = normalizeOccurredAt(event.occurredAt)
  const payloadJson = safeJsonStringify(event.payload)

  await client.query(
    `
    INSERT INTO social_conversations (
      conversation_key,
      platform,
      business_account_id,
      business_username,
      customer_scoped_id,
      customer_username,
      lead_id,
      status,
      entrypoint,
      entry_keyword,
      source_media_id,
      source_comment_id,
      source_post_id,
      last_event_type,
      last_message_text,
      last_event_at,
      metadata
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON DUPLICATE KEY UPDATE
      business_username = COALESCE(VALUES(business_username), business_username),
      customer_username = COALESCE(VALUES(customer_username), customer_username),
      lead_id = COALESCE(lead_id, VALUES(lead_id)),
      status = CASE
        WHEN status IN ('registered', 'closed') THEN status
        ELSE COALESCE(VALUES(status), status)
      END,
      entrypoint = COALESCE(entrypoint, VALUES(entrypoint)),
      entry_keyword = COALESCE(VALUES(entry_keyword), entry_keyword),
      source_media_id = COALESCE(VALUES(source_media_id), source_media_id),
      source_comment_id = COALESCE(VALUES(source_comment_id), source_comment_id),
      source_post_id = COALESCE(VALUES(source_post_id), source_post_id),
      last_event_type = VALUES(last_event_type),
      last_message_text = COALESCE(VALUES(last_message_text), last_message_text),
      last_event_at = COALESCE(VALUES(last_event_at), last_event_at),
      metadata = COALESCE(VALUES(metadata), metadata)
    `,
    [
      conversationKey,
      event.platform,
      event.businessAccountId,
      normalizeOptionalString(event.businessUsername),
      normalizeOptionalString(event.customerScopedId),
      normalizeOptionalString(event.customerUsername),
      event.leadId ?? null,
      normalizeOptionalString(event.status) || "new",
      normalizeOptionalString(event.entrypoint),
      normalizeOptionalString(event.entryKeyword),
      normalizeOptionalString(event.sourceMediaId),
      normalizeOptionalString(event.sourceCommentId),
      normalizeOptionalString(event.sourcePostId),
      event.eventType,
      normalizeOptionalString(event.text),
      occurredAt,
      payloadJson,
    ],
  )

  const conversationId = await getConversationIdByKey(client, conversationKey)

  if (!conversationId) {
    return {
      inserted: false,
      conversationId: null,
      conversationKey,
      dedupKey,
    }
  }

  const [insertResult] = await client.query<ResultSetHeader>(
    `
    INSERT IGNORE INTO social_messages (
      conversation_id,
      dedup_key,
      platform,
      direction,
      entrypoint,
      event_type,
      external_message_id,
      customer_scoped_id,
      customer_username,
      source_media_id,
      source_comment_id,
      source_post_id,
      text,
      payload,
      occurred_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    [
      conversationId,
      dedupKey,
      event.platform,
      event.direction,
      normalizeOptionalString(event.entrypoint),
      event.eventType,
      normalizeOptionalString(event.externalMessageId),
      normalizeOptionalString(event.customerScopedId),
      normalizeOptionalString(event.customerUsername),
      normalizeOptionalString(event.sourceMediaId),
      normalizeOptionalString(event.sourceCommentId),
      normalizeOptionalString(event.sourcePostId),
      normalizeOptionalString(event.text),
      payloadJson,
      occurredAt,
    ],
  )

  return {
    inserted: insertResult.affectedRows > 0,
    conversationId,
    conversationKey,
    dedupKey,
  }
}

export async function linkSocialConversationToLead(
  conversationId: number,
  leadId: number,
  client: DbClient = db,
) {
  await ensureSocialTables(client)

  await client.query(
    `
    UPDATE social_conversations
    SET lead_id = ?
    WHERE id = ?
    `,
    [leadId, conversationId],
  )
}

export async function updateSocialConversationStatus(
  conversationId: number,
  status: SocialConversationStatus,
  client: DbClient = db,
) {
  await ensureSocialTables(client)

  await client.query(
    `
    UPDATE social_conversations
    SET status = ?
    WHERE id = ?
    `,
    [status, conversationId],
  )
}
