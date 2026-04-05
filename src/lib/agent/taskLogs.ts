import type { RowDataPacket } from "mysql2/promise";
import { db } from "@/lib/db";

type TaskLogLevel = "info" | "success" | "warn" | "error";

type TaskLogRow = RowDataPacket & {
  id: number;
  task_id: string;
  level: TaskLogLevel;
  message: string;
  details: string | null;
  created_at: string;
};

let ensureTaskLogsTablePromise: Promise<void> | null = null;

async function ensureTaskLogsTable() {
  if (!ensureTaskLogsTablePromise) {
    ensureTaskLogsTablePromise = db
      .query(`
        CREATE TABLE IF NOT EXISTS agent_task_logs (
          id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
          task_id VARCHAR(64) NOT NULL,
          level VARCHAR(16) NOT NULL DEFAULT 'info',
          message TEXT NOT NULL,
          details TEXT NULL,
          created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          INDEX idx_agent_task_logs_task_created_at (task_id, created_at, id)
        )
      `)
      .then(() => undefined)
      .catch((error) => {
        ensureTaskLogsTablePromise = null;
        throw error;
      });
  }

  await ensureTaskLogsTablePromise;
}

export async function logTaskEvent(
  taskId: string,
  message: string,
  options: {
    level?: TaskLogLevel;
    details?: unknown;
  } = {},
) {
  try {
    await ensureTaskLogsTable();

    await db.query(
      `
      INSERT INTO agent_task_logs (task_id, level, message, details, created_at)
      VALUES (?, ?, ?, ?, ?)
      `,
      [
        taskId,
        options.level ?? "info",
        message,
        options.details === undefined ? null : JSON.stringify(options.details),
        new Date(),
      ],
    );
  } catch (error) {
    console.error("Task log write failed:", error);
  }
}

export async function getTaskLogs(taskId: string, limit = 200) {
  await ensureTaskLogsTable();

  const safeLimit = Math.max(1, Math.min(limit, 500));

  const [rows] = await db.query<TaskLogRow[]>(
    `
    SELECT id, task_id, level, message, details, created_at
    FROM agent_task_logs
    WHERE task_id = ?
    ORDER BY created_at DESC, id DESC
    LIMIT ?
    `,
    [taskId, safeLimit],
  );

  return [...rows].reverse().map((row) => ({
    id: row.id,
    task_id: row.task_id,
    level: row.level,
    message: row.message,
    details: row.details,
    created_at: row.created_at,
  }));
}
