import type { DbClient, JobRunContext, TaskConfig } from "@/types/agent"
import { saveLead } from "../saveLead"
import { hasTimeBudgetExpired, markStoppedEarly } from "../runtime"
import { logTaskEvent } from "../taskLogs"

export async function crawlInstagram(
  db: DbClient,
  config: TaskConfig,
  taskId: string,
  context: JobRunContext,
) {
  console.log("Instagram crawler started")

  const limit = config.limit || 50
  let leadsSaved = 0

  const hashtags = buildHashtags(config)

  console.log("Hashtags:", hashtags)
  await logTaskEvent(taskId, "Instagram: start crawlera", {
    details: { hashtags },
  })

  for (const hashtag of hashtags) {
    if (hasTimeBudgetExpired(context, 20_000)) {
      markStoppedEarly(context)
      await logTaskEvent(taskId, "Instagram: zatrzymano przez limit czasu", {
        level: "warn",
        details: { leadsSaved, hashtag },
      })
      return leadsSaved
    }

    console.log("Searching hashtag:", hashtag)
    await logTaskEvent(taskId, `Instagram: hashtag #${hashtag}`)

    const url =
      "https://www.instagram.com/explore/tags/" +
      encodeURIComponent(hashtag) +
      "/"

    try {
      const res = await fetch(url, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
        },
      })

      const html = await res.text()
      const profiles = extractProfiles(html)

      console.log("Profiles found:", profiles.length)
      await logTaskEvent(taskId, "Instagram: znalezione profile", {
        details: {
          hashtag,
          profiles: profiles.length,
        },
      })

      for (const profile of profiles) {
        if (hasTimeBudgetExpired(context, 10_000)) {
          markStoppedEarly(context)
          await logTaskEvent(taskId, "Instagram: zatrzymano przed kolejnym profilem", {
            level: "warn",
            details: { leadsSaved, hashtag },
          })
          return leadsSaved
        }

        if (leadsSaved >= limit) {
          console.log("Instagram limit reached:", limit)
          return leadsSaved
        }

        const lead = {
          name: profile,
          website: `https://instagram.com/${profile}`,
          source: "agent",
          platform: "instagram",
          email: null,
        }

        console.log("Saving lead:", lead)

        const result = await saveLead(db, lead, { taskId })

        if (result.created) {
          leadsSaved++
          await logTaskEvent(taskId, `Instagram: zapisano profil ${profile}`, {
            level: "success",
            details: {
              website: lead.website,
            },
          })
        }
      }
    } catch {
      console.log("Instagram fetch failed:", hashtag)
      await logTaskEvent(taskId, `Instagram: błąd dla #${hashtag}`, {
        level: "error",
      })
    }
  }

  await logTaskEvent(taskId, "Instagram: koniec crawlera", {
    level: "success",
    details: { leadsSaved },
  })

  return leadsSaved
}

function buildHashtags(config: TaskConfig): string[] {
  const tags: string[] = []
  const keywords = config.industry?.keywords || []

  for (const keyword of keywords) {
    const clean = keyword.toLowerCase().replace(/\s+/g, "")
    tags.push(clean)
  }

  return tags
}

function extractProfiles(html: string): string[] {
  const profiles: string[] = []
  const regex = /"username":"([^"]+)"/g
  let match: RegExpExecArray | null

  while ((match = regex.exec(html)) !== null) {
    profiles.push(match[1])
  }

  return [...new Set(profiles)]
}
