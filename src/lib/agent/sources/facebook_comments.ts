import * as cheerio from "cheerio"
import { saveLead } from "../saveLead"
import { TaskConfig } from "@/types/agent"

export async function crawlFacebookComments(db: any, config: TaskConfig) {

  console.log("Facebook COMMENTS crawler started")

  const keywords = config.industry?.keywords || []

  for (const keyword of keywords) {

    try {

      const searchUrl =
        "https://mbasic.facebook.com/search/posts/?q=" +
        encodeURIComponent(keyword)

      const res = await fetch(searchUrl, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; Win64)"
        }
      })

      const html = await res.text()
      const $ = cheerio.load(html)

      const postLinks: string[] = []

      // 🔹 zbieramy linki do postów
      $("a").each((_, el) => {
        const href = $(el).attr("href")

        if (!href) return

        if (href.includes("/story.php") || href.includes("/posts/")) {
          postLinks.push("https://mbasic.facebook.com" + href)
        }
      })

      // 🔹 przetwarzamy każdy post
      for (const postUrl of postLinks.slice(0, 5)) {

        try {

          const resPost = await fetch(postUrl, {
            headers: {
              "User-Agent":
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"
            }
          })

          const postHtml = await resPost.text()
          const $$ = cheerio.load(postHtml)

          const comments: string[] = []

          // 🔹 zbieramy komentarze
          $$("div").each((_, el) => {
            const text = $$(el).text()

            // prosta filtracja — komentarze są zwykle krótkie
            if (text.length > 20 && text.length < 500) {
              comments.push(text)
            }
          })

          // 🔹 ekstrakcja leadów z komentarzy
          for (const comment of comments) {

            const emailMatch =
              comment.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)

            const websiteMatch =
              comment.match(/https?:\/\/[^\s]+/)

            if (!emailMatch && !websiteMatch) continue

            const lead = {

              name: keyword + " comment lead",

              email: emailMatch?.[0] || null,

              website: websiteMatch?.[0] || null,

              source: "facebook_comments",

              platform: "facebook"

            }

            await saveLead(db, lead)

          }

          // delay między postami
          await new Promise(r => setTimeout(r, 2000))

        } catch (err) {
          console.error("post crawl error:", err)
        }

      }

      // delay między keywordami
      await new Promise(r => setTimeout(r, 3000))

    } catch (err) {

      console.error("facebook comments crawler error:", err)

    }

  }

  console.log("Facebook COMMENTS crawler finished")

}