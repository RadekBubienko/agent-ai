import * as cheerio from "cheerio"
import type { DbClient, TaskConfig } from "@/types/agent"
import { saveLead } from "../saveLead"
import { logTaskEvent } from "../taskLogs"

export async function crawlFacebook(
  db: DbClient,
  config: TaskConfig,
  taskId: string,
) {
  console.log("Facebook crawler started")

  const keywords = config.industry?.keywords || []
  let leadsSaved = 0

  await logTaskEvent(taskId, "Facebook: start crawlera", {
    details: { keywords },
  })

  for (const keyword of keywords) {
    try {
      await logTaskEvent(taskId, `Facebook: wyszukiwanie "${keyword}"`)

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

      await logTaskEvent(taskId, "Facebook: znalezione posty", {
        details: {
          keyword,
          posts: posts.length,
        },
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
          await logTaskEvent(taskId, `Facebook: zapisano lead dla "${keyword}"`, {
            level: "success",
            details: {
              website: lead.website,
              email: lead.email,
            },
          })
        }
      }

      await new Promise((resolve) => setTimeout(resolve, 3000))
    } catch (err) {
      console.error("facebook crawler error:", err)
      await logTaskEvent(taskId, `Facebook: błąd dla "${keyword}"`, {
        level: "error",
        details: {
          message: err instanceof Error ? err.message : String(err),
        },
      })
    }
  }

  console.log("Facebook crawler finished")
  await logTaskEvent(taskId, "Facebook: koniec crawlera", {
    level: "success",
    details: { leadsSaved },
  })

  return leadsSaved
}
