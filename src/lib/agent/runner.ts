import { db } from "@/lib/db";
import type { DbClient, JobRunContext, TaskConfig } from "@/types/agent";
import { crawlFacebookComments } from "./sources/facebook_comments";
import { crawlFacebook } from "./sources/facebook";
import { crawlGoogle } from "./sources/google";
import { crawlInstagram } from "./sources/instagram";
import { logTaskEvent } from "./taskLogs";

const SOFT_RUNTIME_BUDGET_MS = 210_000;

type SourceRunner = (
  db: DbClient,
  config: TaskConfig,
  taskId: string,
  context: JobRunContext,
) => Promise<number>;

const sourceRunners: Record<string, SourceRunner> = {
  google: crawlGoogle,
  instagram: crawlInstagram,
  facebook: crawlFacebook,
  facebook_comments: crawlFacebookComments,
};

async function updateTaskStatus(
  taskId: string,
  status: string,
  leadsFound?: number,
) {
  if (typeof leadsFound === "number") {
    await db.query(
      `UPDATE agent_tasks
       SET status=?, leads_found=?
       WHERE id=?`,
      [status, leadsFound, taskId],
    );

    return;
  }

  await db.query(
    `UPDATE agent_tasks
     SET status=?
     WHERE id=?`,
    [status, taskId],
  );
}

export async function startAgentJob(taskId: string, config: TaskConfig) {
  console.log("Agent started:", taskId);

  const context: JobRunContext = {
    startedAt: Date.now(),
    softDeadlineAt: Date.now() + SOFT_RUNTIME_BUDGET_MS,
    stoppedEarly: false,
  };

  try {
    await updateTaskStatus(taskId, "running");
    await logTaskEvent(taskId, "Task uruchomiony", {
      details: {
        sources: config.sources,
        keywords: config.industry?.keywords ?? [],
        softRuntimeBudgetMs: SOFT_RUNTIME_BUDGET_MS,
      },
    });

    const jobs = config.sources
      .map((source) => ({
        source,
        runner: sourceRunners[source],
      }))
      .filter(
        (entry): entry is { source: string; runner: SourceRunner } =>
          Boolean(entry.runner),
      )
      .map(async ({ source, runner }) => {
        await logTaskEvent(taskId, `Start źródła: ${source}`);

        try {
          const count = await runner(db, config, taskId, context);

          await logTaskEvent(taskId, `Koniec źródła: ${source}`, {
            level: context.stoppedEarly ? "warn" : "success",
            details: {
              saved: count,
              stoppedEarly: context.stoppedEarly,
            },
          });

          return count;
        } catch (error) {
          await logTaskEvent(taskId, `Błąd źródła: ${source}`, {
            level: "error",
            details: {
              message: error instanceof Error ? error.message : String(error),
            },
          });

          throw error;
        }
      });

    const results = await Promise.all(jobs);
    const leadsFound = results.reduce((total, count) => total + count, 0);

    await updateTaskStatus(taskId, "finished", leadsFound);
    await logTaskEvent(
      taskId,
      context.stoppedEarly
        ? "Task zakończony wcześniej przez limit czasu"
        : "Task zakończony",
      {
        level: context.stoppedEarly ? "warn" : "success",
        details: {
          leadsFound,
          stoppedEarly: context.stoppedEarly,
        },
      },
    );
  } catch (err) {
    console.error("Agent error:", err);
    await updateTaskStatus(taskId, "error");
    await logTaskEvent(taskId, "Task zakończony błędem", {
      level: "error",
      details: {
        message: err instanceof Error ? err.message : String(err),
      },
    });
  }
}
