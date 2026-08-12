import { afterEach, describe, expect, it, vi } from 'vitest';
import { hubWorkspaceFetch, setSelectedHubId } from './hubWorkspaceState';

afterEach(() => {
  setSelectedHubId(null);
  vi.unstubAllGlobals();
});

describe('hub workspace REST scoping', () => {
  it('adds the selected hub to scoped reads', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    setSelectedHubId('a1000000-0000-4000-8000-000000000001');

    await hubWorkspaceFetch('https://example.supabase.co/rest/v1/riders?select=*');

    expect(fetchMock).toHaveBeenCalledOnce();
    const calledUrl = new URL(String(fetchMock.mock.calls[0][0]));
    expect(calledUrl.searchParams.get('hub_id')).toBe('eq.a1000000-0000-4000-8000-000000000001');
  });

  it('leaves All Hubs and non-scoped resources unchanged', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await hubWorkspaceFetch('https://example.supabase.co/rest/v1/riders?select=*');
    await hubWorkspaceFetch('https://example.supabase.co/rest/v1/users?select=*');

    expect(String(fetchMock.mock.calls[0][0])).not.toContain('hub_id=');
    expect(String(fetchMock.mock.calls[1][0])).not.toContain('hub_id=');
  });

  it('does not override an explicit hub constraint', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    setSelectedHubId('a1000000-0000-4000-8000-000000000001');

    await hubWorkspaceFetch('https://example.supabase.co/rest/v1/zones?hub_id=eq.a1000000-0000-4000-8000-000000000002');

    expect(new URL(String(fetchMock.mock.calls[0][0])).searchParams.getAll('hub_id')).toEqual([
      'eq.a1000000-0000-4000-8000-000000000002',
    ]);
  });
});
