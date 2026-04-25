/**
 * @jest-environment node
 */
import {
  emailLogsQuerySchema,
  enrichLeadMagnetSchema,
  parseJson,
  parseQuery,
  sendEmailSchema,
} from '../schemas';

describe('emailLogsQuerySchema', () => {
  it('defaults limit to 50 when missing', () => {
    const result = emailLogsQuerySchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.limit).toBe(50);
  });

  it('coerces numeric strings into numbers', () => {
    const result = emailLogsQuerySchema.safeParse({ limit: '100' });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.limit).toBe(100);
  });

  it('rejects non-numeric limit (the previous Math.min(NaN, 200) bug)', () => {
    const result = emailLogsQuerySchema.safeParse({ limit: 'abc' });
    expect(result.success).toBe(false);
  });

  it('clamps via .max(200)', () => {
    const result = emailLogsQuerySchema.safeParse({ limit: '500' });
    expect(result.success).toBe(false);
  });

  it('rejects limit < 1', () => {
    const result = emailLogsQuerySchema.safeParse({ limit: '0' });
    expect(result.success).toBe(false);
  });
});

describe('sendEmailSchema', () => {
  it('rejects an invalid email', () => {
    const result = sendEmailSchema.safeParse({
      to_email: 'not-an-email',
      subject: 'hi',
      body_html: '<p>hi</p>',
    });
    expect(result.success).toBe(false);
  });

  it('accepts a minimal valid payload', () => {
    const result = sendEmailSchema.safeParse({
      to_email: 'a@b.test',
      subject: 'hi',
      body_html: '<p>hi</p>',
    });
    expect(result.success).toBe(true);
  });

  it('rejects empty subject', () => {
    const result = sendEmailSchema.safeParse({
      to_email: 'a@b.test',
      subject: '',
      body_html: '<p>hi</p>',
    });
    expect(result.success).toBe(false);
  });
});

describe('enrichLeadMagnetSchema', () => {
  it('rejects non-UUID project_id', () => {
    const result = enrichLeadMagnetSchema.safeParse({ project_id: 'abc' });
    expect(result.success).toBe(false);
  });

  it('accepts a UUID project_id', () => {
    const result = enrichLeadMagnetSchema.safeParse({
      project_id: '00000000-0000-4000-8000-000000000000',
    });
    expect(result.success).toBe(true);
  });
});

describe('parseJson', () => {
  it('returns 400 invalid_json when the body is not JSON', async () => {
    const req = new Request('http://localhost', {
      method: 'POST',
      body: 'not json',
      headers: { 'content-type': 'application/json' },
    });
    const result = await parseJson(req, sendEmailSchema);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.response.status).toBe(400);
      expect((await result.response.json()).error).toBe('invalid_json');
    }
  });

  it('returns 400 invalid_body with issues when validation fails', async () => {
    const req = new Request('http://localhost', {
      method: 'POST',
      body: JSON.stringify({ to_email: 'bad' }),
      headers: { 'content-type': 'application/json' },
    });
    const result = await parseJson(req, sendEmailSchema);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.response.status).toBe(400);
      const body = await result.response.json();
      expect(body.error).toBe('invalid_body');
      expect(body.issues).toBeDefined();
    }
  });

  it('returns parsed data on success', async () => {
    const req = new Request('http://localhost', {
      method: 'POST',
      body: JSON.stringify({
        to_email: 'a@b.test',
        subject: 'hi',
        body_html: '<p>hi</p>',
      }),
      headers: { 'content-type': 'application/json' },
    });
    const result = await parseJson(req, sendEmailSchema);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.to_email).toBe('a@b.test');
  });
});

describe('parseQuery', () => {
  it('returns 400 invalid_query when validation fails', () => {
    const url = new URL('http://localhost?limit=abc');
    const result = parseQuery(url, emailLogsQuerySchema);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.response.status).toBe(400);
  });

  it('returns parsed data on success and applies defaults', () => {
    const url = new URL('http://localhost');
    const result = parseQuery(url, emailLogsQuerySchema);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.limit).toBe(50);
  });
});
