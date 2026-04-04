import { db } from "@/lib/db";
import type { DbClient, TaskConfig } from "@/types/agent";
import { crawlFacebookComments } from "./sources/facebook_comments";
import { crawlFacebook } from "./sources/facebook_public";
import { crawlGoogle } from "./sources/google";
import { crawlInstagram } from "./sources/instagram";

type SourceRunner = (db: DbClient, config: TaskConfig) => Promise<void>;

const sourceRunners: Record<string, SourceRunner> = {
  google: crawlGoogle,
  instagram: crawlInstagram,
  facebook: crawlFacebook,
  facebook_comments: crawlFacebookComments,
};

async function updateTaskStatus(taskId: string, status: string) {
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
      .map((runner) => runner(db, config));

    await Promise.all(jobs);
    await updateTaskStatus(taskId, "finished");
  } catch (err) {
    console.error("Agent error:", err);
    await updateTaskStatus(taskId, "error");
  }
}
