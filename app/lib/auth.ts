import { createHmac, timingSafeEqual } from "crypto";
import { cookies } from "next/headers";

export const AUTH_COOKIE = "wrh_money_tracker_session";

const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

function getAuthSecret() {
  return process.env.AUTH_SECRET || process.env.WRH_APP_PASSWORD || "";
}

function sign(value: string) {
  return createHmac("sha256", getAuthSecret()).update(value).digest("hex");
}

function safeEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);

  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return timingSafeEqual(leftBuffer, rightBuffer);
}

export function createSessionValue() {
  const expiresAt = Date.now() + SESSION_MAX_AGE_SECONDS * 1000;
  const payload = `${expiresAt}`;
  return `${payload}.${sign(payload)}`;
}

export function isValidSessionValue(value: string | undefined) {
  const secret = getAuthSecret();

  if (!secret || !value) {
    return false;
  }

  const [expiresAt, signature] = value.split(".");
  const expiresAtNumber = Number(expiresAt);

  if (!expiresAt || !signature || !Number.isFinite(expiresAtNumber)) {
    return false;
  }

  if (Date.now() > expiresAtNumber) {
    return false;
  }

  return safeEqual(signature, sign(expiresAt));
}

export async function isAuthenticated() {
  const cookieStore = await cookies();
  return isValidSessionValue(cookieStore.get(AUTH_COOKIE)?.value);
}

export async function setSessionCookie() {
  const cookieStore = await cookies();

  cookieStore.set(AUTH_COOKIE, createSessionValue(), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  });
}

export async function clearSessionCookie() {
  const cookieStore = await cookies();

  cookieStore.set(AUTH_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });
}
