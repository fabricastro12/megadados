import { afterEach, describe, expect, it, vi } from 'vitest';

const ensureSession = vi.fn();
vi.mock('@/lib/supabase', () => ({ ensureSession }));

const { api } = await import('@/lib/api');

afterEach(() => {
  vi.unstubAllGlobals();
  ensureSession.mockReset();
});

describe('api', () => {
  it('returns no_session instead of throwing when anonymous sign-in fails', async () => {
    ensureSession.mockRejectedValue(new Error('Anonymous sign-ins are disabled'));
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);

    await expect(api('/api/rooms', { body: {} })).resolves.toEqual({ ok: false, status: 401, error: 'no_session' });
    expect(fetch).not.toHaveBeenCalled();
  });

  it('returns offline when the request itself fails', async () => {
    ensureSession.mockResolvedValue({ access_token: 'token' });
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));

    await expect(api('/api/rooms', { body: {} })).resolves.toEqual({ ok: false, status: 0, error: 'offline' });
  });

  it('sends the session token and returns the body', async () => {
    ensureSession.mockResolvedValue({ access_token: 'token' });
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ code: 'MXQ7K' }), { status: 200 }));
    vi.stubGlobal('fetch', fetch);

    await expect(api('/api/rooms', { body: { name: 'Fabri' } })).resolves.toEqual({ ok: true, data: { code: 'MXQ7K' } });
    expect(fetch.mock.calls[0]![1].headers.authorization).toBe('Bearer token');
  });
});
