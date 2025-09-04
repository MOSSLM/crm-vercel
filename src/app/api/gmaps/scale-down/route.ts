import { ensureServiceRunning, getCurrentIP, scaleDown } from "@/lib/aws/gmaps";
import { GMAPS_API_TOKEN } from "@/env";

export const runtime = "nodejs";

export async function POST() {
  await ensureServiceRunning();
  const base = await getCurrentIP();
  const url = new URL("/scale-down", base);
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${GMAPS_API_TOKEN}`,
    },
  });
  await scaleDown();
  const headers = new Headers(res.headers);
  return new Response(res.body, { status: res.status, headers });
}
