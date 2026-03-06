import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function POST() {
  try {

    await db.execute(
      "UPDATE video_views SET views = views + 1 WHERE id = 1"
    );

    const [rows]: any = await db.execute(
      "SELECT views FROM video_views WHERE id = 1"
    );

    return NextResponse.json({
      views: rows[0].views
    });

  } catch (error) {

    console.error(error);

    return NextResponse.json(
      { error: "Błąd licznika" },
      { status: 500 }
    );
  }
}