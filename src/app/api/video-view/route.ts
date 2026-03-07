import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { cookies } from "next/headers";

export async function POST() {
  try {

    const cookieStore = await cookies();
    const viewed = cookieStore.get("video_viewed");

    let views;

    if (!viewed) {

      await db.execute(
        "UPDATE video_views SET views = views + 1 WHERE id = 1"
      );

      const [rows]: any = await db.execute(
        "SELECT views FROM video_views WHERE id = 1"
      );

      views = rows[0].views;

      const response = NextResponse.json({ views });

      response.cookies.set("video_viewed", "true", {
        maxAge: 60 * 60 * 24 * 7, // 7 dni
        path: "/",
        sameSite: "lax"
      });

      return response;

    } else {

      const [rows]: any = await db.execute(
        "SELECT views FROM video_views WHERE id = 1"
      );

      views = rows[0].views;

      return NextResponse.json({ views });

    }

  } catch (error) {

    console.error(error);

    return NextResponse.json(
      { error: "Błąd licznika" },
      { status: 500 }
    );
  }
}