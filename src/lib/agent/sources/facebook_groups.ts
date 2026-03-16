import * as cheerio from "cheerio"
import { saveLead } from "../saveLead"
import { TaskConfig } from "@/types/agent"

export async function crawlFacebook(db: any, config: TaskConfig) {

  console.log("Facebook crawler started")

  const keywords = config.industry?.keywords || []

  for (const keyword of keywords) {

    try {

      const searchUrl =
        "https://mbasic.facebook.com/search/posts/?q=" +
        encodeURIComponent(keyword)

      const res = await fetch(searchUrl, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"
        }
      })

      const html = await res.text()

      const $ = cheerio.load(html)

      // --------
      // 1. zbieramy posty
      // --------

      const posts: string[] = []

      $("article").each((_, el) => {

        const text = $(el).text()

        posts.push(text)

      })

      // --------
      // 2. przetwarzamy asynchronicznie
      // --------

      for (const post of posts) {

        const emailMatch =
          post.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)

        const websiteMatch =
          post.match(/https?:\/\/[^\s]+/)

        if (!emailMatch && !websiteMatch) continue

        const lead = {

          name: keyword + " lead",

          email: emailMatch
            ? emailMatch[0]
            : null,

          website: websiteMatch
            ? websiteMatch[0]
            : null,

          source: "facebook",

          platform: "facebook"

        }

        await saveLead(db, lead)

      }

      // mały delay żeby facebook nie blokował
      await new Promise(r => setTimeout(r, 3000))

    } catch (err) {

      console.error("facebook crawler error:", err)

    }

  }

  console.log("Facebook crawler finished")

}