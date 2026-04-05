import { db } from "@/lib/db";
import type { DbClient, TaskConfig } from "@/types/agent";
import { crawlFacebookComments } from "./sources/facebook_comments";
import { crawlFacebook } from "./sources/facebook_public";
import { crawlGoogle } from "./sources/google";
import { crawlInstagram } from "./sources/instagram";

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

    const jobs = config.sources
      .map((source) => sourceRunners[source])
      .filter((runner): runner is SourceRunner => Boolean(runner))
      .map((runner) => runner(db, config, taskId));

    const results = await Promise.all(jobs);
    const leadsFound = results.reduce((total, count) => total + count, 0);

    await updateTaskStatus(taskId, "finished", leadsFound);
  } catch (err) {
    console.error("Agent error:", err);
    await updateTaskStatus(taskId, "error");
  }
}
