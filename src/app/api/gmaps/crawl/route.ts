import { ensureServiceRunning, getCurrentIP } from "@/lib/aws/gmaps-ip";
import { GMAPS_API_TOKEN } from "@/env";

export const runtime = "nodejs";

export async function POST(req: Request) {
  await ensureServiceRunning();
  const base = await getCurrentIP();
  const url = new URL("/crawl", base);
  const res = await fetch(url, {
    method: "POST",
    headers: {
      ...(req.headers.get("authorization")
        ? { Authorization: req.headers.get("authorization") as string }
        : {}),
      "x-api-token": `Bearer ${GMAPS_API_TOKEN}`,
      "Content-Type": req.headers.get("content-type") || "application/json",
    },
    body: req.body,
  });
  const headers = new Headers(res.headers);
  headers.delete("authorization");
  headers.delete("x-api-token");
  return new Response(res.body, { status: res.status, headers });
}
