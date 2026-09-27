// SPDX-License-Identifier: AGPL-3.0-only
/** The authenticated tenant profile selects the storage origin, never document content. */
export function resolveStorageURL(fileURL: string, configuredOrigin: unknown): URL {
  let origin = window.location.origin;
  if (configuredOrigin != null && configuredOrigin !== '') {
    if (typeof configuredOrigin !== 'string' || /[\\\s?#*]/.test(configuredOrigin)) {
      throw new Error('Invalid tenant storage origin');
    }
    const configured = new URL(configuredOrigin);
    if (!['https:', 'http:'].includes(configured.protocol) || configured.username || configured.password ||
        configured.pathname !== '/' || (window.location.protocol === 'https:' && configured.protocol !== 'https:')) {
      throw new Error('Invalid tenant storage origin');
    }
    origin = configured.origin;
  }
  if (/^[\s]|[\\\r\n\t]/.test(fileURL) || fileURL.startsWith('//')) {
    throw new Error('Invalid storage file URL');
  }
  const url = new URL(fileURL, origin + '/');
  if (url.origin !== origin || !url.pathname.startsWith('/storage/') || url.username || url.password || url.hash) {
    throw new Error('Unexpected storage file origin');
  }
  return url;
}

/** Blobgw capabilities travel in a private header, with the authenticated session. */
export async function fetchTenantBlob(fileURL: string, storageOrigin: unknown, signal?: AbortSignal): Promise<Response> {
  const url = resolveStorageURL(fileURL, storageOrigin);
  const capabilities = url.searchParams.getAll('cap');
  if (capabilities.length !== 1 || !capabilities[0]) throw new Error('Missing or invalid storage capability');
  url.searchParams.delete('cap');
  return fetch(url.href, {
    credentials: url.origin === window.location.origin ? 'same-origin' : 'include',
    cache: 'no-store', headers: {'X-Blob-Capability': capabilities[0]},
    referrerPolicy: 'no-referrer', redirect: 'error', signal,
  });
}

/** Other signed providers retain their existing direct-download path. */
export function isTenantBlobURL(fileURL: string): boolean {
  if (typeof fileURL !== 'string' || !fileURL) throw new Error('Missing download URL');
  const url = new URL(fileURL, window.location.href);
  return url.searchParams.has('cap') || /^\/storage\/[^/]+\/blob\//.test(url.pathname);
}

export function fetchDownloadURL(fileURL: string, storageOrigin: unknown, signal?: AbortSignal): Promise<Response> {
  if (isTenantBlobURL(fileURL)) return fetchTenantBlob(fileURL, storageOrigin, signal);
  return fetch(fileURL, {credentials: 'same-origin', cache: 'no-store', referrerPolicy: 'no-referrer', signal});
}
