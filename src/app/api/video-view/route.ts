import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import type { RowDataPacket } from "mysql2/promise";
import { db } from "@/lib/db";

type VideoViewRow = RowDataPacket & {
  views: number;
};

export async function POST() {
  try {
    const cookieStore = await cookies();
    const viewed = cookieStore.get("video_viewed");

    if (!viewed) {
      await db.execute("UPDATE video_views SET views = views + 1 WHERE id = 1");

      const [rows] = await db.execute<VideoViewRow[]>(
        "SELECT views FROM video_views WHERE id = 1",
      );
      const views = rows[0]?.views ?? 0;

      const response = NextResponse.json({ views });

      response.cookies.set("video_viewed", "true", {
        maxAge: 60 * 60 * 24 * 7,
        path: "/",
        sameSite: "lax",
      });

      return response;
    }

    const [rows] = await db.execute<VideoViewRow[]>(
      "SELECT views FROM video_views WHERE id = 1",
    );
    const views = rows[0]?.views ?? 0;

    return NextResponse.json({ views });
  } catch (error) {
    console.error(error);

    return NextResponse.json({ error: "Błąd licznika" }, { status: 500 });
  }
}
