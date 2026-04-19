import { NextResponse } from 'next/server';
import { SUPABASE_SERVICE_ROLE_KEY, SUPABASE_URL } from '@/env';

export const runtime = 'nodejs';
export const maxDuration = 300;

type EnrichRequestBody = {
  project_id?: unknown;
};

export async function POST(request: Request) {
  let projectId = '';
  try {
    const body = (await request.json()) as EnrichRequestBody;
    projectId = typeof body.project_id === 'string' ? body.project_id.trim() : '';
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }

  if (!projectId) {
    return NextResponse.json({ error: 'project_id is required' }, { status: 400 });
  }

  try {
    const response = await fetch(`${SUPABASE_URL}/functions/v1/enrich-lead-magnet`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        apikey: SUPABASE_SERVICE_ROLE_KEY,
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
          error: 'edge_function_request_failed',
          status: response.status,
          details: parsedBody,
        },
        { status: 502 },
      );
    }

    return NextResponse.json(parsedBody ?? {});
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unknown_error';
    return NextResponse.json(
      { error: 'edge_function_unreachable', details: message },
      { status: 502 },
    );
  }
}
