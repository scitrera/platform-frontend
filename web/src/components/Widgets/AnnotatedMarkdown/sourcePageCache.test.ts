import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {SourcePageCache, IMAGE_LOAD_ERROR} from './sourcePageCache';

const page = (document_id = 'doc', page_number = 1) => ({document_id, page_number, text: 'Quoted text',
  image_url: '/storage/example/blob/page.png?cap=synthetic', image_sha256: 'a'.repeat(64)});
const response = (size = 100, type = 'image/png') => ({ok: true, headers: new Headers(),
  blob: async () => new Blob([new Uint8Array(size)], {type})});
const caches: SourcePageCache[] = [];
const cache = (limits?: {pages: number; bytes: number; ttlMs: number}, storageOrigin?: unknown) => {
  const c = new SourcePageCache(limits, storageOrigin);caches.push(c);return c;
};
beforeEach(() => {vi.stubGlobal('fetch', vi.fn(async () => response()));});
afterEach(() => {caches.splice(0).forEach(c => c.clear());vi.useRealTimers();vi.unstubAllGlobals();});

describe('private source page cache', () => {
  it('coalesces loads and reuses bytes without retaining the signed link', async () => {
    const c = cache(), loader = vi.fn(async () => page());
    const [a, b] = await Promise.all([c.get('doc', 1, loader), c.get('doc', 1, loader)]);
    expect(a).toBe(b);expect(a.image?.size).toBe(100);expect(a.page.image_url).toBeUndefined();
    expect(await c.get('doc', 1, loader)).toBe(a);
    expect(loader).toHaveBeenCalledOnce();expect(fetch).toHaveBeenCalledOnce();
    expect(fetch).toHaveBeenCalledWith(expect.stringMatching(/\/storage\/example\/blob\/page\.png$/), expect.objectContaining({
      credentials: 'same-origin', cache: 'no-store', headers: {'X-Blob-Capability': 'synthetic'}, redirect: 'error', referrerPolicy: 'no-referrer'}));
  });
  it('resolves tenant-relative images against configured storage with cookies and a private capability header', async () => {
    const c = cache(undefined, 'https://customer.example.test');
    expect((await c.get('doc', 1, async () => page())).image).toBeDefined();
    expect(fetch).toHaveBeenCalledWith('https://customer.example.test/storage/example/blob/page.png',
      expect.objectContaining({credentials: 'include', cache: 'no-store', redirect: 'error',
        referrerPolicy: 'no-referrer', headers: {'X-Blob-Capability': 'synthetic'}}));
  });
  it('allows absolute links only on the configured tenant storage origin', async () => {
    const c = cache(undefined, 'https://customer.example.test/');
    expect((await c.get('doc', 1, async () => ({...page(), image_url: 'https://customer.example.test' + page().image_url}))).image).toBeDefined();
    c.clear();vi.mocked(fetch).mockClear();
    for (const image_url of ['https://other.example.test' + page().image_url, '//other.example.test' + page().image_url,
      'https://user:password@customer.example.test' + page().image_url, '/api/other?cap=synthetic']) {
      expect((await c.get('doc', 1, async () => ({...page(), image_url}))).imageError).toBe(IMAGE_LOAD_ERROR);
    }
    expect(fetch).not.toHaveBeenCalled();
  });
  it.each(['*', 'https://*.example.test', 'https://customer.example.test/path', 'https://user:pass@customer.example.test',
    'https://customer.example.test?key=x', 'https://customer.example.test#fragment', ' https://customer.example.test',
    'javascript:alert(1)', true])('fails closed for invalid configured storage origin %s', async origin => {
    expect((await cache(undefined, origin).get('doc', 1, async () => page())).imageError).toBe(IMAGE_LOAD_ERROR);
    expect(fetch).not.toHaveBeenCalled();
  });
  it('does not downgrade an HTTPS frontend to HTTP storage', async () => {
    vi.stubGlobal('window', {location: {origin: 'https://app.example.test', protocol: 'https:'}});
    expect((await cache(undefined, 'http://customer.example.test').get('doc', 1, async () => page())).imageError).toBe(IMAGE_LOAD_ERROR);
    expect(fetch).not.toHaveBeenCalled();
  });
  it('expires idle entries and requests fresh authorization', async () => {
    vi.useFakeTimers();
    const c = cache({pages: 2, bytes: 1000, ttlMs: 50}), loader = vi.fn(async () => page());
    await c.get('doc', 1, loader);
    await vi.advanceTimersByTimeAsync(51);
    await c.get('doc', 1, loader);
    expect(loader).toHaveBeenCalledTimes(2);expect(fetch).toHaveBeenCalledTimes(2);
  });
  it.each([{pages: 1, bytes: 1000, ttlMs: 5000}, {pages: 8, bytes: 150, ttlMs: 5000}])(
    'bounds retained pages/bytes and refetches evicted pages: %j', async limits => {
      const c = cache(limits), loader = vi.fn(async (doc: string, n: number) => page(doc, n));
      await c.get('doc', 1, loader);await c.get('doc', 2, loader);await c.get('doc', 1, loader);
      expect(loader).toHaveBeenCalledTimes(3);
    });
  it('evicts the least recently used page', async () => {
    const c = cache({pages: 2, bytes: 1000, ttlMs: 5000}), loader = vi.fn(async (doc: string, n: number) => page(doc, n));
    await c.get('doc', 1, loader);await c.get('doc', 2, loader);await c.get('doc', 1, loader);
    await c.get('doc', 3, loader);await c.get('doc', 1, loader);await c.get('doc', 2, loader);
    expect(loader.mock.calls.map(([, n]) => n)).toEqual([1, 2, 3, 2]);
  });
  it('preserves transcript access after a failed image and does not cache the failure', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({...response(), ok: false} as Response);
    const c = cache(), loader = vi.fn(async () => page());
    const failed = await c.get('doc', 1, loader);
    expect(failed.page.text).toBe('Quoted text');expect(failed.imageError).toBe(IMAGE_LOAD_ERROR);
    expect((await c.get('doc', 1, loader)).image).toBeDefined();expect(loader).toHaveBeenCalledTimes(2);
  });
  it('does not fetch an unrelated origin or wrong page', async () => {
    const c = cache();
    expect((await c.get('doc', 1, async () => ({...page(), image_url: 'https://elsewhere.invalid/image'}))).imageError).toBe(IMAGE_LOAD_ERROR);
    await expect(c.get('doc', 1, async () => page('other'))).rejects.toThrow('does not match');
    expect(fetch).not.toHaveBeenCalled();
  });
  it.each([[100, 'text/html'], [5 * 1024 * 1024 + 1, 'image/png']] as const)('rejects non-images and oversized pages', async (size, type) => {
    vi.mocked(fetch).mockResolvedValue(response(size, type) as Response);
    expect((await cache().get('doc', 1, async () => page())).imageError).toBe(IMAGE_LOAD_ERROR);
  });
  it('invalidates a failed decode and clears data between review sessions', async () => {
    const c = cache(), loader = vi.fn(async () => page());
    await c.get('doc', 1, loader);c.invalidate('doc', 1);await c.get('doc', 1, loader);
    c.clear();await c.get('doc', 1, loader);expect(loader).toHaveBeenCalledTimes(3);
  });
  it('does not retain or fetch a descriptor arriving after the review was closed', async () => {
    let resolve!: (v: ReturnType<typeof page>) => void;
    const c = cache(), pending = c.get('doc', 1, () => new Promise(r => {resolve = r;}));
    c.clear();resolve(page());
    await expect(pending).rejects.toMatchObject({name: 'AbortError'});expect(fetch).not.toHaveBeenCalled();
  });
});
