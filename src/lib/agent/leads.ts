import type { RowDataPacket } from "mysql2/promise";
import { db } from "@/lib/db";

type AgentLeadRow = RowDataPacket & {
  id: number;
  name: string;
  email: string | null;
  website: string | null;
  source: string;
  platform: string | null;
  segment: string;
  total_score: number;
  created_at: string;
  status: string;
};

type CountRow = RowDataPacket & {
  count: number;
};

export type AgentLeadPageSize = number | "all";
export type AgentLeadSort = "newest" | "oldest";

export type AgentLeadFilters = {
  platform?: string | null;
  segment?: string | null;
  page?: number;
  pageSize?: AgentLeadPageSize;
  sort?: AgentLeadSort;
};

export type AgentLeadPage = {
  leads: AgentLeadRow[];
  total: number;
  page: number;
  totalPages: number;
  pageSize: AgentLeadPageSize;
  sort: AgentLeadSort;
};

export async function getAgentLeads(segment?: string | null) {
  const result = await getAgentLeadsByFilters({ segment });

  return result.leads;
}

export async function getAgentLeadsByFilters(
  filters: AgentLeadFilters = {},
): Promise<AgentLeadPage> {
  const whereClauses = [
    `(
      source = 'agent'
      OR source = 'facebook'
      OR lead_type = 'agent'
      OR task_id IS NOT NULL
    )`,
  ];

  const params: string[] = [];
  const platform = filters.platform?.trim();
  const segment = filters.segment?.trim();
  const sort = filters.sort === "oldest" ? "oldest" : "newest";
  const orderDirection = sort === "oldest" ? "ASC" : "DESC";
  const requestedPage = Math.max(1, filters.page ?? 1);
  const pageSize =
    filters.pageSize === "all"
      ? "all"
      : [10, 25, 50, 100].includes(Number(filters.pageSize))
        ? Number(filters.pageSize)
        : 25;

  if (platform) {
    whereClauses.push("platform = ?");
    params.push(platform);
  }

  if (segment) {
    whereClauses.push("segment = ?");
    params.push(segment);
  }

  const whereSql = `WHERE ${whereClauses.join(" AND ")}`;

  const [countRows] = await db.query<CountRow[]>(
    `
      SELECT COUNT(*) AS count
      FROM leads
      ${whereSql}
    `,
    params,
  );

  const total = Number(countRows[0]?.count ?? 0);
  const totalPages =
    pageSize === "all" ? 1 : Math.max(1, Math.ceil(total / pageSize));
  const page = pageSize === "all" ? 1 : Math.min(requestedPage, totalPages);

  const queryParams: Array<string | number> = [...params];
  let query = `
    SELECT
      id,
      name,
      email,
      website,
      source,
      platform,
      segment,
      total_score,
      created_at,
      status
    FROM leads
    ${whereSql}
    ORDER BY created_at ${orderDirection}, id ${orderDirection}
  `;

  if (pageSize !== "all") {
    query += " LIMIT ? OFFSET ?";
    queryParams.push(pageSize, (page - 1) * pageSize);
  }

  const [leads] = await db.query<AgentLeadRow[]>(query, queryParams);

  return {
    leads,
    total,
    page,
    totalPages,
    pageSize,
    sort,
  };
}
