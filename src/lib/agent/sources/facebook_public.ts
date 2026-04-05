import * as cheerio from "cheerio"
import type { DbClient, TaskConfig } from "@/types/agent"
import { saveLead } from "../saveLead"

export async function crawlFacebook(
  db: DbClient,
  config: TaskConfig,
  taskId: string,
) {
  console.log("Facebook crawler started")

  const keywords = config.industry?.keywords || []
  let leadsSaved = 0

  for (const keyword of keywords) {
    try {
      const searchUrl =
        "https://mbasic.facebook.com/search/posts/?q=" +
        encodeURIComponent(keyword)

      const res = await fetch(searchUrl, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
        },
      })

      const html = await res.text()
      const $ = cheerio.load(html)
      const posts: string[] = []

      $("article").each((_, el) => {
        posts.push($(el).text())
      })

      for (const post of posts) {
        const emailMatch =
          post.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)
        const websiteMatch = post.match(/https?:\/\/[^\s]+/)

        if (!emailMatch && !websiteMatch) continue

        const lead = {
          name: keyword + " lead",
          email: emailMatch ? emailMatch[0] : null,
          website: websiteMatch ? websiteMatch[0] : null,
          source: "agent",
          platform: "facebook",
        }

        const result = await saveLead(db, lead, { taskId })

        if (result.created) {
          leadsSaved++
        }
      }

      await new Promise((resolve) => setTimeout(resolve, 3000))
    } catch (err) {
      console.error("facebook crawler error:", err)
    }
  }

  console.log("Facebook crawler finished")

  return leadsSaved
}
