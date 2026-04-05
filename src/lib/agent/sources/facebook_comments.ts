import * as cheerio from "cheerio"
import type { DbClient, TaskConfig } from "@/types/agent"
import { saveLead } from "../saveLead"

export async function crawlFacebookComments(
  db: DbClient,
  config: TaskConfig,
  taskId: string,
) {
  console.log("Facebook COMMENTS crawler started")

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
      const postLinks: string[] = []

      $("a").each((_, el) => {
        const href = $(el).attr("href")

        if (!href) return

        if (href.includes("/story.php") || href.includes("/posts/")) {
          postLinks.push("https://mbasic.facebook.com" + href)
        }
      })

      for (const postUrl of postLinks.slice(0, 5)) {
        try {
          const resPost = await fetch(postUrl, {
            headers: {
              "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
            },
          })

          const postHtml = await resPost.text()
          const $$ = cheerio.load(postHtml)
          const comments: string[] = []

          $$("div").each((_, el) => {
            const text = $$(el).text()

            if (text.length > 20 && text.length < 500) {
              comments.push(text)
            }
          })

          for (const comment of comments) {
            const emailMatch =
              comment.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)
            const websiteMatch = comment.match(/https?:\/\/[^\s]+/)

            if (!emailMatch && !websiteMatch) continue

            const lead = {
              name: keyword + " comment lead",
              email: emailMatch?.[0] || null,
              website: websiteMatch?.[0] || null,
              source: "agent",
              platform: "facebook_comments",
            }

            const result = await saveLead(db, lead, { taskId })

            if (result.created) {
              leadsSaved++
            }
          }

          await new Promise((resolve) => setTimeout(resolve, 2000))
        } catch (err) {
          console.error("post crawl error:", err)
        }
      }

      await new Promise((resolve) => setTimeout(resolve, 3000))
    } catch (err) {
      console.error("facebook comments crawler error:", err)
    }
  }

  console.log("Facebook COMMENTS crawler finished")

  return leadsSaved
}
