import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { z } from "zod";
import { db } from "@/lib/db";
import { sendWelcomeEmail } from "@/lib/mailer";

/* =========================
   RATE LIMIT CONFIG
========================= */

const LIMIT = 5;
const WINDOW = 60 * 1000; // 1 minuta

const rateLimitMap = new Map<string, { count: number; firstRequest: number }>();

/* =========================
   VALIDATION SCHEMA
========================= */

const leadSchema = z.object({
  name: z.string().min(2, { message: "Imię musi mieć min. 2 znaki" }).max(100),

  email: z.string().email({ message: "Nieprawidłowy email" }).max(255),
});

/* =========================
   API HANDLER
========================= */

export async function POST(request: Request) {
  try {
    /* ---------- RATE LIMIT ---------- */

    const headersList = await headers();

    const forwarded = headersList.get("x-forwarded-for");
    const ip = forwarded
      ? forwarded.split(",")[0].trim()
      : (headersList.get("x-real-ip") ?? "unknown");

    const now = Date.now();
    const record = rateLimitMap.get(ip);

    if (!record) {
      rateLimitMap.set(ip, {
        count: 1,
        firstRequest: now,
      });
    } else {
      if (now - record.firstRequest > WINDOW) {
        rateLimitMap.set(ip, {
          count: 1,
          firstRequest: now,
        });
      } else {
        if (record.count >= LIMIT) {
          return NextResponse.json(
            { error: "Za dużo prób. Spróbuj za minutę." },
            { status: 429 },
          );
        }

        record.count++;
      }
    }

    /* ---------- BODY ---------- */

    const body = await request.json();

    const parsed = leadSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const { name, email } = parsed.data;

    /* ---------- DB INSERT ---------- */

    try {
      const [result]: any = await db.execute(
        "INSERT INTO leads (name, email, ip_address) VALUES (?, ?, ?)",
        [name, email, ip],
      );

      const leadId = result.insertId;

      await db.execute(
        `INSERT INTO email_sequences (lead_id, type, send_at)
          VALUES (?, 'education', DATE_ADD(NOW(), INTERVAL 1 DAY))`,
        [leadId],
      );

      await db.execute(
        `INSERT INTO email_sequences (lead_id, type, send_at)
        VALUES (?, 'decision', DATE_ADD(NOW(), INTERVAL 3 DAY))`,
        [leadId],
      );
      
    } catch (error: any) {
      if (error.code === "ER_DUP_ENTRY") {
        return NextResponse.json(
          { error: { fieldErrors: { email: ["Ten email już istnieje"] } } },
          { status: 400 },
        );
      }

      throw error;
    }

    /* ---------- SEND EMAIL ---------- */
    try {
      const info = await sendWelcomeEmail(email, name);
      console.log("EMAIL SENT:", info.messageId);
    } catch (emailError) {
      console.error("EMAIL ERROR:", emailError);
    }

    return NextResponse.json({ message: "Lead przyjęty" }, { status: 200 });
  } catch (error) {
    console.error(error);

    return NextResponse.json({ error: "Błąd serwera" }, { status: 500 });
  }
}
