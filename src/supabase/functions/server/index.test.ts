/** @jest-environment node */
import { app } from './index';
import { createClient } from '@supabase/supabase-js';
import * as kv from './kv_store.tsx';

jest.mock('@supabase/supabase-js');
jest.mock('./kv_store.tsx');

const mockedCreateClient = createClient as unknown as jest.Mock;
const kvMock = kv as jest.Mocked<typeof kv>;

beforeEach(() => {
  jest.resetAllMocks();
  process.env.SUPABASE_URL = 'http://localhost';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-key';
});

test('rejects invalid contact payload', async () => {
  mockedCreateClient.mockReturnValue({ from: jest.fn() });
  const res = await app.request('/make-server-5c06d9e7/contacts', { method: 'POST', body: JSON.stringify({}) });
  expect(res.status).toBe(400);
});

test('creates contact with extended fields', async () => {
  const insert = jest.fn().mockReturnValue({
    select: jest.fn().mockReturnValue({
      single: jest.fn().mockResolvedValue({ data: { id: '1', first_name: 'A', last_name: 'B' }, error: null }),
    }),
  });
  const from = jest.fn().mockImplementation((table: string) => ({ insert }));
  mockedCreateClient.mockReturnValue({ from });
  kvMock.set.mockResolvedValue(undefined);

  const res = await app.request('/make-server-5c06d9e7/contacts', {
    method: 'POST',
    body: JSON.stringify({ entreprise_id: 1, first_name: 'A', last_name: 'B' }),
  });
  expect(res.status).toBe(200);
  const json = await res.json();
  expect(json.id).toBe('1');
  expect(kvMock.set).toHaveBeenCalled();
});

test('updates contact', async () => {
  const update = jest.fn().mockReturnValue({
    eq: jest.fn().mockReturnValue({
      select: jest.fn().mockReturnValue({
        single: jest.fn().mockResolvedValue({ data: { id: '1', first_name: 'A', last_name: 'B' }, error: null }),
      }),
    }),
  });
  const select = jest.fn().mockReturnValue({
    eq: jest.fn().mockReturnValue({
      single: jest.fn().mockResolvedValue({ data: { id: '1', first_name: 'A', last_name: 'B' }, error: null }),
    }),
  });
  const from = jest.fn().mockImplementation((table: string) => ({ update, select }));
  mockedCreateClient.mockReturnValue({ from });
  kvMock.get.mockResolvedValue({});
  kvMock.set.mockResolvedValue(undefined);

  const res = await app.request('/make-server-5c06d9e7/contacts/1', {
    method: 'PUT',
    body: JSON.stringify({ first_name: 'A' }),
  });
  expect(res.status).toBe(200);
});

test('creates contact note', async () => {
  mockedCreateClient.mockReturnValue({ from: jest.fn() });
  kvMock.get.mockResolvedValue([]);
  kvMock.set.mockResolvedValue(undefined);

  const res = await app.request('/make-server-5c06d9e7/contacts/1/notes', {
    method: 'POST',
    body: JSON.stringify({ note: 'hello' }),
  });
  const json = await res.json();
  expect(typeof json.id).toBe('string');
});

test('companies route error', async () => {
  mockedCreateClient.mockReturnValue({ from: jest.fn() });
  kvMock.getByPrefix.mockRejectedValue(new Error('fail'));
  const res = await app.request('/make-server-5c06d9e7/companies');
  expect(res.status).toBe(500);
});

test('companies route success', async () => {
  mockedCreateClient.mockReturnValue({ from: jest.fn() });
  kvMock.getByPrefix.mockResolvedValue([{ id: 1, name: 'Co' }]);
  const res = await app.request('/make-server-5c06d9e7/companies');
  const json = await res.json();
  expect(typeof json[0].id).toBe('string');
});
