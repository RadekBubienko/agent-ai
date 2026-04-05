import type { DbClient, TaskConfig } from "@/types/agent";
import { saveLead } from "../saveLead";

const PAGE_ID = process.env.FACEBOOK_PAGE_ID;
const TOKEN = process.env.FACEBOOK_TOKEN;

export async function crawlFacebook(
  db: DbClient,
  config: TaskConfig,
  taskId: string,
) {
  void config;

  console.log("Facebook crawler started");
  let leadsSaved = 0;

  if (!PAGE_ID || !TOKEN) {
    console.log("Missing FACEBOOK_PAGE_ID or FACEBOOK_TOKEN");
    return;
  }

  try {
    const postsUrl = `https://graph.facebook.com/v19.0/${PAGE_ID}/posts?limit=10&access_token=${TOKEN}`;

    const postsRes = await fetch(postsUrl);
    const postsData = (await postsRes.json()) as {
      data?: Array<{ id: string }>;
    };

    if (!postsData.data) {
      console.log("No posts found");
      return;
    }

    for (const post of postsData.data) {
      const commentsUrl = `https://graph.facebook.com/v19.0/${post.id}/comments?limit=50&access_token=${TOKEN}`;

      const commentsRes = await fetch(commentsUrl);
      const commentsData = (await commentsRes.json()) as {
        data?: Array<{ from?: { id: string; name: string } }>;
      };

      if (!commentsData.data) continue;

      for (const comment of commentsData.data) {
        if (!comment.from) continue;

        const lead = {
          name: comment.from.name,
          website: `https://facebook.com/${comment.from.id}`,
          email: null,
          source: "agent",
          platform: "facebook",
        };

        console.log("Saving Facebook lead:", lead);

        const result = await saveLead(db, lead, { taskId });

        if (result.created) {
          leadsSaved++;
        }
      }
    }
  } catch (err) {
    console.error("Facebook crawler error:", err);
  }

  return leadsSaved;
}
