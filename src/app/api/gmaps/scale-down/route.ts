import { ensureServiceRunning, getCurrentIP, scaleDown } from "@/lib/aws/gmaps-ip";
import { GMAPS_API_TOKEN } from "@/env";

export const runtime = "nodejs";

export async function POST(req: Request) {
  await ensureServiceRunning();
  const base = await getCurrentIP();
  const url = new URL("/scale-down", base);
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${GMAPS_API_TOKEN}`,
      ...(req.headers.get("authorization")
        ? { "x-user-auth": req.headers.get("authorization") as string }
        : {}),
    },
  });
  await scaleDown();
  const headers = new Headers(res.headers);
  headers.delete("authorization");
  headers.delete("x-user-auth");
  return new Response(res.body, { status: res.status, headers });
}
