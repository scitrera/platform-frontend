import {fetchTenantBlob} from '../../../utils/storageFetch';
export {resolveStorageURL as resolveSourceImageURL} from '../../../utils/storageFetch';
export interface SourceRegion {region_id: string; image_sha256: string; bbox: number[]; origin: 'ocr' | 'review_crop'}
export interface SourcePage {
  document_id: string; page_number: number; text: string;
  image_url?: string; image_error?: string; image_sha256?: string;
  reference_regions?: Record<string, SourceRegion[]>;
}
export type SourcePageLoader = (document: string, page: number) => Promise<SourcePage>;
export interface LoadedSourcePage {page: SourcePage; image?: Blob; imageError?: string}

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
export const IMAGE_LOAD_ERROR = 'The page image could not be loaded. Retry for a fresh link, or use the transcript.';

/** Private to one open review/revision. Never writes browser or shared HTTP caches. */
export class SourcePageCache {
  private entries = new Map<string, {value: LoadedSourcePage; bytes: number; expiresAt: number; timer: ReturnType<typeof setTimeout>}>();
  private pending = new Map<string, {promise: Promise<LoadedSourcePage>; controller: AbortController}>();
  private bytes = 0;

  constructor(private limits = {pages: 16, bytes: 32 * 1024 * 1024, ttlMs: 5 * 60 * 1000},
              private storageOrigin: unknown = null) {}

  get(document: string, page: number, loader: SourcePageLoader): Promise<LoadedSourcePage> {
    const key = JSON.stringify([document, page]);
    if ((this.entries.get(key)?.expiresAt ?? Infinity) <= Date.now()) this.remove(key);
    const cached = this.entries.get(key);
    if (cached) {
      this.entries.delete(key);
      this.entries.set(key, cached);
      return Promise.resolve(cached.value);
    }
    const running = this.pending.get(key);
    if (running) return running.promise;
    const controller = new AbortController();
    const promise = this.load(document, page, loader, controller.signal).then(value => {
      controller.signal.throwIfAborted();
      // An image failure must retry with a freshly authorized descriptor.
      if (!value.imageError) {
        const bytes = (value.image?.size || 0) + JSON.stringify(value.page).length * 2;
        if (bytes <= this.limits.bytes && this.limits.pages > 0) {
          while (this.entries.size >= this.limits.pages || this.bytes + bytes > this.limits.bytes) {
            this.remove(this.entries.keys().next().value!);
          }
          const timer = setTimeout(() => this.remove(key), this.limits.ttlMs);
          this.entries.set(key, {value, bytes, timer, expiresAt: Date.now() + this.limits.ttlMs});
          this.bytes += bytes;
        }
      }
      return value;
    }).finally(() => {
      if (this.pending.get(key)?.controller === controller) this.pending.delete(key);
    });
    this.pending.set(key, {promise, controller});
    return promise;
  }

  invalidate(document: string, page: number) {
    const key = JSON.stringify([document, page]);
    this.remove(key);
    this.pending.get(key)?.controller.abort();
    this.pending.delete(key);
  }

  clear() {
    for (const key of this.entries.keys()) this.remove(key);
    for (const {controller} of this.pending.values()) controller.abort();
    this.pending.clear();
  }

  private remove(key: string) {
    const entry = this.entries.get(key);
    if (!entry) return;
    clearTimeout(entry.timer);
    this.bytes -= entry.bytes;
    this.entries.delete(key);
  }

  private async load(document: string, pageNumber: number, loader: SourcePageLoader, signal: AbortSignal): Promise<LoadedSourcePage> {
    const source = await loader(document, pageNumber);
    signal.throwIfAborted();
    if (source.document_id !== document || source.page_number !== pageNumber) {
      throw new Error('Source page does not match this selection.');
    }
    // Retain rendered content, not expiring capability URLs.
    const {image_url: imageURL, ...page} = source;
    if (!imageURL) return {page};
    try {
      const response = await fetchTenantBlob(imageURL, this.storageOrigin, signal);
      if (!response.ok || Number(response.headers.get('Content-Length')) > MAX_IMAGE_BYTES) {
        throw new Error('Source image request failed');
      }
      const image = await response.blob();
      if (!['image/png', 'image/jpeg'].includes(image.type) || !image.size || image.size > MAX_IMAGE_BYTES) {
        throw new Error('Invalid source image');
      }
      return {page, image};
    } catch {
      signal.throwIfAborted();
      return {page, imageError: IMAGE_LOAD_ERROR};
    }
  }
}
