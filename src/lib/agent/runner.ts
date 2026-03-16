import { TaskConfig } from "@/types/agent"
import { crawlGoogle } from "./sources/google"
import { crawlInstagram } from "./sources/instagram"
import { crawlFacebook } from "./sources/facebook"

// przyszłe źródła
// import { crawlLinkedIn } from "./sources/linkedin"
// import { crawlMaps } from "./sources/maps"

import { db } from "@/lib/db"

export async function startAgentJob(
  taskId: string,
  config: TaskConfig
) {

  console.log("Agent started:", taskId)

  try {

    await db.query(
      `UPDATE agent_tasks
       SET status='running'
       WHERE id=?`,
      [taskId]
    )

    const jobs: Promise<any>[] = []

    if (config.sources.includes("google")) {
      jobs.push(crawlGoogle(db, config))
    }

    // przyszłe źródła

    if (config.sources.includes("instagram")) {
       jobs.push(crawlInstagram(db, config))
     }

    if (config.sources.includes("facebook")) {
      jobs.push(crawlFacebook(db, config))
    }

    // if (config.sources.includes("linkedin")) {
    //   jobs.push(crawlLinkedIn(db, config))
    // }

    // if (config.sources.includes("maps")) {
    //   jobs.push(crawlMaps(db, config))
    // }

    await Promise.all(jobs)

    await db.query(
      `UPDATE agent_tasks
       SET status='finished'
       WHERE id=?`,
      [taskId]
    )

  } catch (err) {

    console.error("Agent error:", err)

    await db.query(
      `UPDATE agent_tasks
       SET status='error'
       WHERE id=?`,
      [taskId]
    )

  }

}