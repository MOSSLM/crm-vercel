import { ensureServiceRunning, getCurrentIP } from "@/lib/aws/gmaps";
import { GMAPS_API_TOKEN } from "@/env";

export const runtime = "nodejs";

export async function GET(
  _req: Request,
  { params }: { params: { jobId: string } }
) {
  await ensureServiceRunning();
  const base = await getCurrentIP();
  const url = new URL(`/job/${params.jobId}`, base);
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${GMAPS_API_TOKEN}`,
    },
  });
  const headers = new Headers(res.headers);
  return new Response(res.body, { status: res.status, headers });
}
