import { db } from "@/lib/db";
import type { DbClient, TaskConfig } from "@/types/agent";
import { crawlFacebookComments } from "./sources/facebook_comments";
import { crawlFacebook } from "./sources/facebook_public";
import { crawlGoogle } from "./sources/google";
import { crawlInstagram } from "./sources/instagram";
import { logTaskEvent } from "./taskLogs";

type SourceRunner = (
  db: DbClient,
  config: TaskConfig,
  taskId: string,
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

  try {
    await updateTaskStatus(taskId, "running");
    await logTaskEvent(taskId, "Task uruchomiony", {
      details: {
        sources: config.sources,
        keywords: config.industry?.keywords ?? [],
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
          const count = await runner(db, config, taskId);

          await logTaskEvent(taskId, `Koniec źródła: ${source}`, {
            level: "success",
            details: { saved: count },
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
    await logTaskEvent(taskId, "Task zakończony", {
      level: "success",
      details: { leadsFound },
    });
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
