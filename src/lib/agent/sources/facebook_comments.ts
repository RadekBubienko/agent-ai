import * as cheerio from "cheerio"
import type { DbClient, JobRunContext, TaskConfig } from "@/types/agent"
import { saveLead } from "../saveLead"
import { hasTimeBudgetExpired, markStoppedEarly } from "../runtime"
import { logTaskEvent } from "../taskLogs"
import {
  fetchFacebookDocument,
  getFacebookInterRequestDelayMs,
  sleep,
} from "./facebookCommon"

export async function crawlFacebookComments(
  db: DbClient,
  config: TaskConfig,
  taskId: string,
  context: JobRunContext,
) {
  console.log("Facebook COMMENTS crawler started")

  const keywords = config.industry?.keywords || []
  const limit = config.limit || 50
  let leadsSaved = 0

  await logTaskEvent(taskId, "Facebook Comments: start crawlera", {
    details: {
      keywords,
      limit,
      speed: config.speed,
      qualityFilters: config.quality_filters,
    },
  })

  for (const keyword of keywords) {
    if (leadsSaved >= limit) {
      return leadsSaved
    }

    if (hasTimeBudgetExpired(context, 20_000)) {
      markStoppedEarly(context)
      await logTaskEvent(taskId, "Facebook Comments: zatrzymano przez limit czasu", {
        level: "warn",
        details: { leadsSaved, keyword },
      })
      return leadsSaved
    }

    try {
      await logTaskEvent(taskId, `Facebook Comments: wyszukiwanie "${keyword}"`)

      const searchUrl =
        "https://mbasic.facebook.com/search/posts/?q=" +
        encodeURIComponent(keyword)

      const res = await fetchFacebookDocument(searchUrl)

      if (!res.ok || !res.html) {
        await logTaskEvent(
          taskId,
          "Facebook Comments: search niedostepny lub zablokowany",
          {
            level: "warn",
            details: {
              keyword,
              blockedReason: res.blockedReason,
              status: res.status,
              finalUrl: res.finalUrl,
            },
          },
        )
        continue
      }

      const html = res.html
      const $ = cheerio.load(html)
      const postLinks: string[] = []

      $("a").each((_, el) => {
        const href = $(el).attr("href")

        if (!href) return

        if (href.includes("/story.php") || href.includes("/posts/")) {
          postLinks.push("https://mbasic.facebook.com" + href)
        }
      })

      await logTaskEvent(taskId, "Facebook Comments: znalezione posty", {
        details: {
          keyword,
          posts: postLinks.length,
        },
      })

      for (const postUrl of postLinks.slice(0, 5)) {
        if (leadsSaved >= limit) {
          return leadsSaved
        }

        if (hasTimeBudgetExpired(context, 15_000)) {
          markStoppedEarly(context)
          await logTaskEvent(
            taskId,
            "Facebook Comments: zatrzymano przed kolejnym postem",
            {
              level: "warn",
              details: { leadsSaved, keyword },
            },
          )
          return leadsSaved
        }

        try {
          const resPost = await fetchFacebookDocument(postUrl)

          if (!resPost.ok || !resPost.html) {
            await logTaskEvent(taskId, "Facebook Comments: post zablokowany", {
              level: "warn",
              details: {
                keyword,
                postUrl,
                blockedReason: resPost.blockedReason,
                status: resPost.status,
                finalUrl: resPost.finalUrl,
              },
            })
            continue
          }

          const postHtml = resPost.html
          const $$ = cheerio.load(postHtml)
          const comments: string[] = []

          $$("div").each((_, el) => {
            const text = $$(el).text()

            if (text.length > 20 && text.length < 500) {
              comments.push(text)
            }
          })

          for (const comment of comments) {
            if (hasTimeBudgetExpired(context, 10_000)) {
              markStoppedEarly(context)
              await logTaskEvent(
                taskId,
                "Facebook Comments: zatrzymano przed kolejnym komentarzem",
                {
                  level: "warn",
                  details: { leadsSaved, keyword, postUrl },
                },
              )
              return leadsSaved
            }

            const emailMatch =
              comment.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)
            const websiteMatch = comment.match(/https?:\/\/[^\s]+/)

            if (!emailMatch && !websiteMatch) continue

            if (config.quality_filters.email_required && !emailMatch) continue

            if (config.quality_filters.website_required && !websiteMatch) continue

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
              await logTaskEvent(
                taskId,
                `Facebook Comments: zapisano lead dla "${keyword}"`,
                {
                  level: "success",
                  details: {
                    website: lead.website,
                    email: lead.email,
                  },
                },
              )
            }

            if (leadsSaved >= limit) {
              return leadsSaved
            }
          }

          await sleep(getFacebookInterRequestDelayMs(config.speed))
        } catch (err) {
          console.error("post crawl error:", err)
          await logTaskEvent(taskId, "Facebook Comments: blad postu", {
            level: "error",
            details: {
              keyword,
              postUrl,
              message: err instanceof Error ? err.message : String(err),
            },
          })
        }
      }

      await sleep(getFacebookInterRequestDelayMs(config.speed))
    } catch (err) {
      console.error("facebook comments crawler error:", err)
      await logTaskEvent(taskId, `Facebook Comments: blad dla "${keyword}"`, {
        level: "error",
        details: {
          message: err instanceof Error ? err.message : String(err),
        },
      })
    }
  }

  console.log("Facebook COMMENTS crawler finished")
  await logTaskEvent(taskId, "Facebook Comments: koniec crawlera", {
    level: "success",
    details: { leadsSaved },
  })

  return leadsSaved
}
