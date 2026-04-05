import { headers } from "next/headers";
import { NextResponse } from "next/server";
import type { ResultSetHeader } from "mysql2/promise";
import { z } from "zod";
import { db } from "@/lib/db";
import { sendWelcomeEmail } from "@/lib/mailer";

const LIMIT = 5;
const WINDOW = 60 * 1000;

const rateLimitMap = new Map<string, { count: number; firstRequest: number }>();

const leadSchema = z.object({
  name: z.string().min(2, { message: "Imię musi mieć min. 2 znaki" }).max(100),
  email: z.string().email({ message: "Nieprawidłowy email" }).max(255),
  path: z.enum(["product", "business", "education"]).optional(),
});

type DuplicateEntryError = {
  code?: string;
};

function getRequesterIp(headerStore: Headers) {
  const forwarded = headerStore.get("x-forwarded-for");

  return forwarded
    ? forwarded.split(",")[0].trim()
    : (headerStore.get("x-real-ip") ?? "unknown");
}

function isRateLimited(ip: string) {
  const now = Date.now();
  const record = rateLimitMap.get(ip);

  if (!record) {
    rateLimitMap.set(ip, {
      count: 1,
      firstRequest: now,
    });
    return false;
  }

  if (now - record.firstRequest > WINDOW) {
    rateLimitMap.set(ip, {
      count: 1,
      firstRequest: now,
    });
    return false;
  }

  if (record.count >= LIMIT) {
    return true;
  }

  record.count++;
  return false;
}

function isDuplicateEntryError(error: unknown): error is DuplicateEntryError {
  return Boolean(
    error &&
      typeof error === "object" &&
      "code" in error &&
      typeof error.code === "string",
  );
}

async function createLeadWithSequence(
  name: string,
  email: string,
  ip: string,
  segment: "product" | "business" | "education",
) {
  const [result] = await db.execute<ResultSetHeader>(
    "INSERT INTO leads (name, email, ip_address, segment, created_at) VALUES (?, ?, ?, ?, ?)",
    [name, email, ip, segment, new Date()],
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

  return leadId;
}

export async function POST(request: Request) {
  try {
    const headerStore = await headers();
    const ip = getRequesterIp(headerStore);

    if (isRateLimited(ip)) {
      return NextResponse.json(
        { error: "Za dużo prób. Spróbuj za minutę." },
        { status: 429 },
      );
    }

    const body = await request.json();
    const parsed = leadSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const { name, email, path } = parsed.data;
    const segment = path ?? "education";

    let leadId: number;

    try {
      leadId = await createLeadWithSequence(name, email, ip, segment);
    } catch (error) {
      if (isDuplicateEntryError(error) && error.code === "ER_DUP_ENTRY") {
        return NextResponse.json(
          { error: { fieldErrors: { email: ["Ten email już istnieje"] } } },
          { status: 400 },
        );
      }

      throw error;
    }

    try {
      const info = await sendWelcomeEmail(email, name, leadId);
      console.log("EMAIL SENT:", info.messageId);
    } catch (emailError) {
      console.error("EMAIL ERROR:", emailError);
    }

    const response = NextResponse.json(
      { message: "Lead przyjęty" },
      { status: 200 },
    );

    response.cookies.set("lead_access", "true", {
      httpOnly: false,
      secure: true,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24,
    });

    return response;
  } catch (error) {
    console.error(error);

    return NextResponse.json({ error: "Błąd serwera" }, { status: 500 });
  }
}
