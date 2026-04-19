import { NextResponse } from 'next/server';
import { SUPABASE_SERVICE_ROLE_KEY, SUPABASE_URL } from '@/env';

export const runtime = 'nodejs';

type EnrichRequestBody = {
  project_id?: unknown;
};

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as EnrichRequestBody;
    const projectId = typeof body.project_id === 'string' ? body.project_id.trim() : '';

    if (!projectId) {
      return NextResponse.json({ error: 'project_id is required' }, { status: 400 });
    }

    const response = await fetch(`${SUPABASE_URL}/functions/v1/enrich-lead-magnet`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ project_id: projectId }),
    });

    const responseText = await response.text();

    let parsedBody: unknown = null;
    if (responseText.length > 0) {
      try {
        parsedBody = JSON.parse(responseText);
      } catch {
        parsedBody = { raw: responseText };
      }
    }

    if (!response.ok) {
      return NextResponse.json(
        {
          error: 'Edge Function request failed',
          status: response.status,
          details: parsedBody,
        },
        { status: 502 },
      );
    }

    return NextResponse.json(parsedBody ?? {});
  } catch {
    return NextResponse.json({ error: 'Unexpected error while invoking enrichment function' }, { status: 500 });
  }
}
