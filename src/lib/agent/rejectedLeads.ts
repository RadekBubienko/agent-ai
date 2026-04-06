import type { ResultSetHeader, RowDataPacket } from "mysql2/promise";
import { db } from "@/lib/db";
import type { DbClient, LeadInput } from "@/types/agent";
import {
  normalizeEmail,
  normalizeLeadName,
  resolveLeadDomain,
} from "./leadIdentity";

type RejectedLeadRow = RowDataPacket & {
  id: number;
};

type RejectedLeadListRow = RowDataPacket & {
  id: number;
  name: string | null;
  email: string | null;
  website: string | null;
  domain: string | null;
  source: string | null;
  platform: string | null;
  reason: string | null;
  rejected_at: string;
  original_created_at: string | null;
};

type RejectedLeadRestoreRow = RejectedLeadListRow & {
  lead_id: number | null;
  normalized_name: string | null;
  task_id: string | null;
  lead_type: string | null;
  segment: string | null;
  status: string | null;
  total_score: number | null;
  fit_score: number | null;
  intent_score: number | null;
  engagement_score: number | null;
};

type CountRow = RowDataPacket & {
  count: number;
};

type ExistingLeadRow = RowDataPacket & {
  id: number;
};

type LeadRow = RowDataPacket & {
  id: number;
  name: string | null;
  email: string | null;
  website: string | null;
  domain: string | null;
  source: string | null;
  platform: string | null;
  task_id: string | null;
  lead_type: string | null;
  segment: string | null;
  status: string | null;
  total_score: number | null;
  fit_score: number | null;
  intent_score: number | null;
  engagement_score: number | null;
  created_at: string | null;
};

let ensureRejectedLeadsTablePromise: Promise<void> | null = null;

export async function ensureRejectedLeadsTable(client: DbClient = db) {
  if (!ensureRejectedLeadsTablePromise) {
    ensureRejectedLeadsTablePromise = client
      .query(`
        CREATE TABLE IF NOT EXISTS rejected_leads (
          id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
          lead_id BIGINT NULL,
          name VARCHAR(255) NULL,
          normalized_name VARCHAR(255) NULL,
          email VARCHAR(255) NULL,
          website TEXT NULL,
          domain VARCHAR(255) NULL,
          source VARCHAR(255) NULL,
          platform VARCHAR(255) NULL,
          task_id VARCHAR(64) NULL,
          lead_type VARCHAR(64) NULL,
          segment VARCHAR(64) NULL,
          status VARCHAR(64) NULL,
          total_score INT NULL,
          fit_score INT NULL,
          intent_score INT NULL,
          engagement_score INT NULL,
          reason VARCHAR(255) NULL,
          rejected_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          original_created_at DATETIME NULL,
          INDEX idx_rejected_leads_email (email),
          INDEX idx_rejected_leads_domain (domain),
          INDEX idx_rejected_leads_normalized_name (normalized_name)
        )
      `)
      .then(() => undefined)
      .catch((error) => {
        ensureRejectedLeadsTablePromise = null;
        throw error;
      });
  }

  await ensureRejectedLeadsTablePromise;
}

export async function findRejectedLead(
  client: DbClient,
  lead: LeadInput,
): Promise<number | null> {
  await ensureRejectedLeadsTable(client);

  const email = normalizeEmail(lead.email);
  if (email) {
    const [rows] = await client.query<RejectedLeadRow[]>(
      "SELECT id FROM rejected_leads WHERE email = ? LIMIT 1",
      [email],
    );

    if (rows.length) return rows[0].id;
  }

  const domain = resolveLeadDomain(lead);
  if (domain) {
    const [rows] = await client.query<RejectedLeadRow[]>(
      "SELECT id FROM rejected_leads WHERE domain = ? LIMIT 1",
      [domain],
    );

    if (rows.length) return rows[0].id;
  }

  const normalizedName = normalizeLeadName(lead.name);
  if (normalizedName) {
    const [rows] = await client.query<RejectedLeadRow[]>(
      `
      SELECT id FROM rejected_leads
      WHERE normalized_name = ?
      LIMIT 1
      `,
      [normalizedName],
    );

    if (rows.length) return rows[0].id;
  }

  return null;
}

export async function rejectLeadById(
  leadId: number,
  reason = "manual_reject",
): Promise<boolean> {
  const connection = await db.getConnection();

  try {
    await connection.beginTransaction();
    await ensureRejectedLeadsTable(connection);

    const [rows] = await connection.query<LeadRow[]>(
      `
      SELECT
        id,
        name,
        email,
        website,
        domain,
        source,
        platform,
        task_id,
        lead_type,
        segment,
        status,
        total_score,
        fit_score,
        intent_score,
        engagement_score,
        created_at
      FROM leads
      WHERE id = ?
      LIMIT 1
      `,
      [leadId],
    );

    const lead = rows[0];

    if (!lead) {
      await connection.rollback();
      return false;
    }

    const normalizedName = normalizeLeadName(lead.name);
    const email = normalizeEmail(lead.email);
    const domain = lead.domain || resolveLeadDomain(lead);

    const existingRejectedId = await findRejectedLead(connection, {
      name: lead.name,
      email,
      website: lead.website,
    });

    if (!existingRejectedId) {
      await connection.query<ResultSetHeader>(
        `
        INSERT INTO rejected_leads (
          lead_id,
          name,
          normalized_name,
          email,
          website,
          domain,
          source,
          platform,
          task_id,
          lead_type,
          segment,
          status,
          total_score,
          fit_score,
          intent_score,
          engagement_score,
          reason,
          rejected_at,
          original_created_at
        )
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
        `,
        [
          lead.id,
          lead.name,
          normalizedName,
          email,
          lead.website,
          domain,
          lead.source,
          lead.platform,
          lead.task_id,
          lead.lead_type,
          lead.segment,
          lead.status,
          lead.total_score,
          lead.fit_score,
          lead.intent_score,
          lead.engagement_score,
          reason,
          new Date(),
          lead.created_at ? new Date(lead.created_at) : null,
        ],
      );
    }

    await connection.query("DELETE FROM lead_events WHERE lead_id = ?", [lead.id]);
    await connection.query("DELETE FROM email_sequences WHERE lead_id = ?", [
      lead.id,
    ]);
    await connection.query("DELETE FROM leads WHERE id = ?", [lead.id]);

    if (lead.task_id) {
      await connection.query(
        `
        UPDATE agent_tasks
        SET leads_found = GREATEST(COALESCE(leads_found, 0) - 1, 0)
        WHERE id = ?
        `,
        [lead.task_id],
      );
    }

    await connection.commit();
    return true;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

type RestoreRejectedLeadResult =
  | {
      success: true;
      leadId: number;
      reusedExisting: boolean;
    }
  | {
      success: false;
      reason: "not_found";
    };

async function findExistingLeadId(
  client: DbClient,
  lead: {
    email?: string | null;
    domain?: string | null;
    name?: string | null;
  },
): Promise<number | null> {
  const email = normalizeEmail(lead.email);

  if (email) {
    const [rows] = await client.query<ExistingLeadRow[]>(
      "SELECT id FROM leads WHERE email = ? LIMIT 1",
      [email],
    );

    if (rows.length) {
      return rows[0].id;
    }
  }

  const domain = lead.domain?.trim().toLowerCase() || null;

  if (domain) {
    const [rows] = await client.query<ExistingLeadRow[]>(
      "SELECT id FROM leads WHERE domain = ? LIMIT 1",
      [domain],
    );

    if (rows.length) {
      return rows[0].id;
    }
  }

  const normalizedName = normalizeLeadName(lead.name);

  if (normalizedName) {
    const [rows] = await client.query<ExistingLeadRow[]>(
      `
      SELECT id
      FROM leads
      WHERE name = ?
      LIMIT 1
      `,
      [lead.name],
    );

    if (rows.length) {
      return rows[0].id;
    }
  }

  return null;
}

export async function restoreRejectedLeadById(
  rejectedLeadId: number,
): Promise<RestoreRejectedLeadResult> {
  const connection = await db.getConnection();

  try {
    await connection.beginTransaction();
    await ensureRejectedLeadsTable(connection);

    const [rows] = await connection.query<RejectedLeadRestoreRow[]>(
      `
      SELECT
        id,
        lead_id,
        name,
        normalized_name,
        email,
        website,
        domain,
        source,
        platform,
        task_id,
        lead_type,
        segment,
        status,
        total_score,
        fit_score,
        intent_score,
        engagement_score,
        reason,
        rejected_at,
        original_created_at
      FROM rejected_leads
      WHERE id = ?
      LIMIT 1
      `,
      [rejectedLeadId],
    );

    const rejectedLead = rows[0];

    if (!rejectedLead) {
      await connection.rollback();
      return {
        success: false,
        reason: "not_found",
      };
    }

    const existingLeadId = await findExistingLeadId(connection, {
      email: rejectedLead.email,
      domain: rejectedLead.domain,
      name: rejectedLead.name,
    });

    if (existingLeadId) {
      await connection.query("DELETE FROM rejected_leads WHERE id = ?", [
        rejectedLead.id,
      ]);
      await connection.commit();

      return {
        success: true,
        leadId: existingLeadId,
        reusedExisting: true,
      };
    }

    const [result] = await connection.query<ResultSetHeader>(
      `
      INSERT INTO leads (
        name,
        email,
        website,
        domain,
        source,
        platform,
        task_id,
        lead_type,
        fit_score,
        intent_score,
        engagement_score,
        total_score,
        segment,
        status,
        created_at
      )
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
      `,
      [
        rejectedLead.name,
        rejectedLead.email,
        rejectedLead.website,
        rejectedLead.domain,
        rejectedLead.source ?? "agent",
        rejectedLead.platform,
        rejectedLead.task_id,
        rejectedLead.lead_type ?? "agent",
        rejectedLead.fit_score ?? 0,
        rejectedLead.intent_score ?? 0,
        rejectedLead.engagement_score ?? 0,
        rejectedLead.total_score ?? 0,
        rejectedLead.segment ?? "cold",
        rejectedLead.status ?? "new",
        rejectedLead.original_created_at
          ? new Date(rejectedLead.original_created_at)
          : new Date(),
      ],
    );

    if (rejectedLead.task_id) {
      await connection.query(
        `
        UPDATE agent_tasks
        SET leads_found = COALESCE(leads_found, 0) + 1
        WHERE id = ?
        `,
        [rejectedLead.task_id],
      );
    }

    await connection.query("DELETE FROM rejected_leads WHERE id = ?", [
      rejectedLead.id,
    ]);

    await connection.commit();

    return {
      success: true,
      leadId: result.insertId,
      reusedExisting: false,
    };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

export type RejectedLeadPageSize = number | "all";
export type RejectedLeadSort = "newest" | "oldest";

export type RejectedLeadListFilters = {
  page?: number;
  pageSize?: RejectedLeadPageSize;
  sort?: RejectedLeadSort;
};

export type RejectedLeadPage = {
  leads: RejectedLeadListRow[];
  total: number;
  page: number;
  totalPages: number;
  pageSize: RejectedLeadPageSize;
  sort: RejectedLeadSort;
};

export async function getRejectedLeads(
  filters: RejectedLeadListFilters = {},
): Promise<RejectedLeadPage> {
  await ensureRejectedLeadsTable();

  const pageSize =
    filters.pageSize === "all"
      ? "all"
      : [10, 25, 50, 100].includes(Number(filters.pageSize))
        ? Number(filters.pageSize)
        : 25;
  const sort = filters.sort === "oldest" ? "oldest" : "newest";
  const orderDirection = sort === "oldest" ? "ASC" : "DESC";
  const requestedPage = Math.max(1, filters.page ?? 1);

  const [countRows] = await db.query<CountRow[]>(
    `
    SELECT COUNT(*) AS count
    FROM rejected_leads
    `,
  );

  const total = Number(countRows[0]?.count ?? 0);
  const totalPages =
    pageSize === "all" ? 1 : Math.max(1, Math.ceil(total / pageSize));
  const page = pageSize === "all" ? 1 : Math.min(requestedPage, totalPages);
  const params: Array<string | number> = [];

  let query = `
    SELECT
      id,
      name,
      email,
      website,
      domain,
      source,
      platform,
      reason,
      rejected_at,
      original_created_at
    FROM rejected_leads
    ORDER BY rejected_at ${orderDirection}, id ${orderDirection}
  `;

  if (pageSize !== "all") {
    query += " LIMIT ? OFFSET ?";
    params.push(pageSize, (page - 1) * pageSize);
  }

  const [rows] = await db.query<RejectedLeadListRow[]>(query, params);

  return {
    leads: rows,
    total,
    page,
    totalPages,
    pageSize,
    sort,
  };
}
