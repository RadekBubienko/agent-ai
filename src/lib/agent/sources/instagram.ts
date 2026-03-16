import { saveLead } from "../saveLead"
import { TaskConfig } from "@/types/agent"

export async function crawlInstagram(db: any, config: TaskConfig) {

  console.log("Instagram crawler started")

  const limit = config.limit || 50
  let leadsSaved = 0

  const hashtags = buildHashtags(config)

  console.log("Hashtags:", hashtags)

  for (const hashtag of hashtags) {

    console.log("Searching hashtag:", hashtag)

    const url =
      "https://www.instagram.com/explore/tags/" +
      encodeURIComponent(hashtag) + "/"

    try {

      const res = await fetch(url, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"
        }
      })

      const html = await res.text()

      const profiles = extractProfiles(html)

      console.log("Profiles found:", profiles.length)

      for (const profile of profiles) {

        if (leadsSaved >= limit) {
          console.log("Instagram limit reached:", limit)
          return
        }

        const lead = {
          name: profile,
          website: `https://instagram.com/${profile}`,
          source: "agent",
          platform: "instagram",
          email: null
        }

        console.log("Saving lead:", lead)

        await saveLead(db, lead)

        leadsSaved++

      }

    } catch (err) {

      console.log("Instagram fetch failed:", hashtag)

    }

  }

}

/* ---------------- HELPERS ---------------- */

function buildHashtags(config: TaskConfig): string[] {

  const tags: string[] = []

  const keywords = config.industry?.keywords || []

  for (const keyword of keywords) {

    const clean = keyword
      .toLowerCase()
      .replace(/\s+/g, "")

    tags.push(clean)

  }

  return tags

}

function extractProfiles(html: string): string[] {

  const profiles: string[] = []

  const regex = /"username":"([^"]+)"/g

  let match

  while ((match = regex.exec(html)) !== null) {

    profiles.push(match[1])

  }

  return [...new Set(profiles)]

}