// SPDX-License-Identifier: AGPL-3.0-only
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {fetchDownloadURL, fetchTenantBlob} from './storageFetch';

const origin = 'https://customer.example.test';
const path = '/storage/demo/blob/report.docx';
beforeEach(() => vi.stubGlobal('fetch', vi.fn(async () => new Response('synthetic document'))));
afterEach(() => vi.unstubAllGlobals());

describe('authenticated storage transport', () => {
  it.each([undefined, origin])('uses the configured origin and carries capability outside the URL: %s', async configured => {
    const controller = new AbortController();
    await fetchDownloadURL(path + '?cap=synthetic&download=1', configured, controller.signal);
    expect(fetch).toHaveBeenCalledWith((configured || window.location.origin) + path + '?download=1', {
      credentials: configured ? 'include' : 'same-origin', cache: 'no-store',
      headers: {'X-Blob-Capability': 'synthetic'}, referrerPolicy: 'no-referrer', redirect: 'error', signal: controller.signal,
    });
  });
  it.each(['', '?cap=', '?cap=one&cap=two'])('rejects missing or ambiguous capabilities: %s', async query => {
    await expect(fetchDownloadURL(path + query, origin)).rejects.toThrow('capability');
    expect(fetch).not.toHaveBeenCalled();
  });
  it.each(['https://elsewhere.example.test' + path + '?cap=synthetic',
    '//elsewhere.example.test' + path + '?cap=synthetic', '/other?cap=synthetic'])('never forwards a capability to an unexpected endpoint: %s', async url => {
    await expect(fetchTenantBlob(url, origin)).rejects.toThrow();
    expect(fetch).not.toHaveBeenCalled();
  });
  it('preserves independent presigned providers without adding credentials or a capability header', async () => {
    const url = 'https://objects.example.test/report.docx?X-Amz-Signature=synthetic';
    await fetchDownloadURL(url, origin);
    expect(fetch).toHaveBeenCalledWith(url, {credentials: 'same-origin', cache: 'no-store', referrerPolicy: 'no-referrer', signal: undefined});
  });
});
