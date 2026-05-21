import { NextResponse } from "next/server";
import { setSessionCookie } from "../../../lib/auth";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const expectedPassword = process.env.WRH_APP_PASSWORD;

  if (!expectedPassword) {
    return NextResponse.json(
      { error: "Missing WRH_APP_PASSWORD environment variable." },
      { status: 500 },
    );
  }

  const body = (await request.json().catch(() => null)) as {
    password?: string;
  } | null;

  if (body?.password !== expectedPassword) {
    return NextResponse.json({ error: "Invalid password." }, { status: 401 });
  }

  await setSessionCookie();
  return NextResponse.json({ ok: true });
}
