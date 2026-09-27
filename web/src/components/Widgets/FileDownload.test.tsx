// SPDX-License-Identifier: AGPL-3.0-only
import {act, fireEvent, render, screen, waitFor} from '@testing-library/react';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {useAuthStore} from '../../stores/authStore';
import {useWorkspaceStore} from '../../stores/workspaceStore';
import {CHAT} from '../../constants/WebSocketConstants.jsx';
import {FileDownload} from './FileDownload';

const {sendRpcRequest} = vi.hoisted(() => ({sendRpcRequest: vi.fn()}));
vi.mock('../../hooks/useWebSocket.jsx', () => ({useWebSocket: () => ({sendRpcRequest})}));
const origin = 'https://customer.example.test';
const path = '/storage/demo/blob/report.docx';
const bytes = new Blob(['synthetic document'], {type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'});
const response = () => ({ok: true, blob: async () => bytes}) as Response;
let sequence = 0;
let downloads: {href: string; name: string}[];
let createObjectURL: ReturnType<typeof vi.fn<(obj: Blob | MediaSource) => string>>;
let revokeObjectURL: ReturnType<typeof vi.fn<(url: string) => void>>;
const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(yes => {resolve = yes;});
  return {promise, resolve};
};
beforeEach(() => {
  useAuthStore.setState({tenantId: `synthetic-download-${++sequence}`, uiConfig: {storageOrigin: origin}});
  useWorkspaceStore.setState({currentWorkspaceId: 'project'});
  let mint = 0;
  sendRpcRequest.mockReset().mockImplementation(async type => {
    if (type === CHAT.FILE_METADATA_GET) return {name: 'report.docx', size: bytes.size};
    if (type === CHAT.FILE_DOWNLOAD_GET) return {url: origin + path + '?cap=synthetic-' + (++mint)};
    throw new Error('Unexpected RPC');
  });
  vi.stubGlobal('fetch', vi.fn(async () => response()));
  downloads = [];
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
    downloads.push({href: this.href, name: this.download});
  });
  createObjectURL = vi.fn(() => 'blob:synthetic');
  revokeObjectURL = vi.fn();
  vi.stubGlobal('URL', class extends URL {static createObjectURL = createObjectURL; static revokeObjectURL = revokeObjectURL;});
});
afterEach(() => {vi.restoreAllMocks(); vi.unstubAllGlobals();});

async function clickDownload() {fireEvent.click(await screen.findByRole('button', {name: 'Download file'}));}

describe('file download widget', () => {
  it.each([null, 'Summary.docx'])('downloads authenticated bytes with filename %s', async altDownloadName => {
    const complete = vi.fn();
    render(<FileDownload docId="document" altDownloadName={altDownloadName} onDownloadComplete={complete}/>);
    await clickDownload();
    await waitFor(() => expect(complete).toHaveBeenCalledOnce());
    expect(fetch).toHaveBeenCalledWith(origin + path, expect.objectContaining({
      credentials: 'include', headers: {'X-Blob-Capability': 'synthetic-1'}, redirect: 'error',
    }));
    expect(createObjectURL).toHaveBeenCalledWith(bytes);
    expect(downloads).toEqual([{href: 'blob:synthetic', name: altDownloadName || 'report.docx'}]);
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:synthetic');
    expect(sendRpcRequest).toHaveBeenCalledWith(CHAT.FILE_DOWNLOAD_GET, {workspaceId: 'project', docId: 'document'});
  });

  it('keeps the widget retryable and obtains fresh authority after HTTP failure', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({ok: false, status: 401} as Response);
    const complete = vi.fn(), error = vi.fn();
    render(<FileDownload docId="document" onDownloadComplete={complete} onError={error}/>);
    await clickDownload();
    expect(await screen.findByRole('alert')).toHaveTextContent('Failed to download file. Try again.');
    expect(screen.getByText('report.docx')).toBeVisible();
    expect(screen.getByRole('button', {name: 'Download file'})).toBeEnabled();
    expect(downloads).toEqual([]); expect(complete).not.toHaveBeenCalled(); expect(error).toHaveBeenCalledOnce();
    await clickDownload();
    await waitFor(() => expect(complete).toHaveBeenCalledOnce());
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(fetch).toHaveBeenLastCalledWith(origin + path, expect.objectContaining({headers: {'X-Blob-Capability': 'synthetic-2'}}));
  });

  it.each(['document', 'workspace', 'tenant', 'origin', 'unmount'])('ignores an old URL after a %s change', async change => {
    const pending = deferred<{url: string}>(), complete = vi.fn(), error = vi.fn();
    sendRpcRequest.mockImplementation(async type => type === CHAT.FILE_DOWNLOAD_GET ? pending.promise : {name: 'report.docx', size: 20});
    const view = render(<FileDownload docId="document" onDownloadComplete={complete} onError={error}/>);
    await clickDownload();
    if (change === 'document') view.rerender(<FileDownload docId="another" onDownloadComplete={complete} onError={error}/>);
    if (change === 'workspace') act(() => useWorkspaceStore.setState({currentWorkspaceId: 'another'}));
    if (change === 'tenant') act(() => useAuthStore.setState({tenantId: 'another'}));
    if (change === 'origin') act(() => useAuthStore.setState({uiConfig: {storageOrigin: 'https://another.example.test'}}));
    if (change === 'unmount') view.unmount();
    await act(async () => pending.resolve({url: origin + path + '?cap=synthetic-stale'}));
    expect(fetch).not.toHaveBeenCalled(); expect(downloads).toEqual([]);
    expect(complete).not.toHaveBeenCalled(); expect(error).not.toHaveBeenCalled();
  });

  it('aborts the byte request and ignores its late response on unmount', async () => {
    const pending = deferred<Response>(), complete = vi.fn();
    vi.mocked(fetch).mockReturnValue(pending.promise);
    const view = render(<FileDownload docId="document" onDownloadComplete={complete}/>);
    await clickDownload();
    await waitFor(() => expect(fetch).toHaveBeenCalledOnce());
    const signal = vi.mocked(fetch).mock.calls[0][1]!.signal!;
    view.unmount(); expect(signal.aborted).toBe(true);
    await act(async () => pending.resolve(response()));
    expect(downloads).toEqual([]); expect(createObjectURL).not.toHaveBeenCalled(); expect(complete).not.toHaveBeenCalled();
  });

  it('does not start a duplicate download while one is active', async () => {
    const pending = deferred<Response>(); vi.mocked(fetch).mockReturnValue(pending.promise);
    render(<FileDownload docId="document"/>);
    await clickDownload(); await clickDownload();
    await waitFor(() => expect(fetch).toHaveBeenCalledOnce());
    await act(async () => pending.resolve(response()));
    expect(downloads).toHaveLength(1);
  });

  it.each([null, 'Renamed.docx'])('retains independent presigned provider downloads: %s', async altDownloadName => {
    const url = 'https://objects.example.test/report.docx?X-Amz-Signature=synthetic';
    sendRpcRequest.mockImplementation(async type => type === CHAT.FILE_DOWNLOAD_GET ? {url} : {name: 'report.docx', size: 20});
    render(<FileDownload docId="document" altDownloadName={altDownloadName}/>);
    await clickDownload();
    await waitFor(() => expect(downloads).toHaveLength(1));
    expect(downloads[0]).toEqual({href: altDownloadName ? 'blob:synthetic' : url, name: altDownloadName || 'report.docx'});
    if (altDownloadName) expect(fetch).toHaveBeenCalledWith(url, expect.objectContaining({credentials: 'same-origin'}));
    else expect(fetch).not.toHaveBeenCalled();
  });
});
