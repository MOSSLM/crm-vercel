import { ensureServiceRunning, getCurrentIP } from "@/lib/aws/gmaps-ip";
import { GMAPS_API_TOKEN } from "@/env";

export const runtime = "nodejs";

export async function GET(
  req: Request,
  { params }: { params: { jobId: string } }
) {
  await ensureServiceRunning();
  const base = await getCurrentIP();
  const url = new URL(`/job/${params.jobId}`, base);
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${GMAPS_API_TOKEN}`,
      ...(req.headers.get("authorization")
        ? { "x-user-auth": req.headers.get("authorization") as string }
        : {}),
    },
  });
  const headers = new Headers(res.headers);
  headers.delete("authorization");
  headers.delete("x-user-auth");
  return new Response(res.body, { status: res.status, headers });
}
