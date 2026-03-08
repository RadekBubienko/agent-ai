import { TaskConfig } from "@/types/agent"
import { crawlGoogle } from "./sources/google"
//import { crawlLinkedIn } from "./sources/linkedin"

export async function startAgentJob(
  taskId: string,
  config: TaskConfig
) {

  console.log("Agent started", taskId)

  if (config.sources.includes("google")) {
    await crawlGoogle(config)
  }

  //if (config.sources.includes("linkedin")) {
   // await crawlLinkedIn(config)
 // }

}