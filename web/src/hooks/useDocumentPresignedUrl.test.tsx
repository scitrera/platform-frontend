import {act, renderHook, waitFor} from '@testing-library/react';
import {beforeEach, describe, expect, it, vi} from 'vitest';
import {useAuthStore} from '../stores/authStore';
import {CHAT} from '../constants/WebSocketConstants.jsx';
import {buildDownloadUrlFetcher, useDocumentMetadata, useDocumentPresignedUrl} from './useDocumentPresignedUrl.jsx';

const {sendRpcRequest} = vi.hoisted(() => ({sendRpcRequest: vi.fn()}));
vi.mock('./useWebSocket.jsx', () => ({useWebSocket: () => ({sendRpcRequest})}));
const deferred = () => {
    let resolve!: (value: any) => void;
    let reject!: (error: Error) => void;
    const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
    return {promise, resolve, reject};
};
let sequence = 0;
beforeEach(() => {
    sendRpcRequest.mockReset();
    useAuthStore.setState({tenantId: `synthetic-${++sequence}`});
});

describe('document selection isolation', () => {
    it('ignores late metadata from the previous workspace and clears missing selections', async () => {
        const first = deferred(), second = deferred();
        sendRpcRequest.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
        const {result, rerender} = renderHook(({workspace}) => useDocumentMetadata('doc', workspace), {
            initialProps: {workspace: 'one' as string | null},
        });
        rerender({workspace: 'two'});
        await act(async () => second.resolve({name: 'second.txt'}));
        await act(async () => first.resolve({name: 'first.txt'}));
        expect(result.current.metadata).toEqual({name: 'second.txt'});
        expect(sendRpcRequest).toHaveBeenLastCalledWith(CHAT.FILE_METADATA_GET, {workspaceId: 'two', docId: 'doc'});
        rerender({workspace: null});
        expect(result.current).toEqual({metadata: null, isLoading: false, error: null});
    });

    it('shares cached metadata only within the same tenant and workspace', async () => {
        sendRpcRequest.mockResolvedValueOnce({name: 'first.txt'}).mockResolvedValueOnce({name: 'other.txt'});
        const first = renderHook(() => useDocumentMetadata('doc', 'workspace'));
        await waitFor(() => expect(first.result.current.isLoading).toBe(false));
        first.unmount();
        const second = renderHook(() => useDocumentMetadata('doc', 'workspace'));
        expect(second.result.current.metadata).toEqual({name: 'first.txt'});
        expect(sendRpcRequest).toHaveBeenCalledTimes(1);
        act(() => useAuthStore.setState({tenantId: 'another-tenant'}));
        expect(second.result.current.metadata).toBeNull();
        await waitFor(() => expect(second.result.current.metadata).toEqual({name: 'other.txt'}));
        expect(sendRpcRequest).toHaveBeenCalledTimes(2);
    });

    it('shows metadata failures and resets them when selecting another document', async () => {
        sendRpcRequest.mockRejectedValueOnce(new Error('unavailable')).mockResolvedValueOnce({name: 'ok.txt'});
        const {result, rerender} = renderHook(({doc}) => useDocumentMetadata(doc, 'workspace'), {initialProps: {doc: 'bad'}});
        await waitFor(() => expect(result.current.error).toBe('Failed to load file information'));
        rerender({doc: 'good'});
        expect(result.current.error).toBeNull();
        expect(result.current.isLoading).toBe(true);
        await waitFor(() => expect(result.current.metadata).toEqual({name: 'ok.txt'}));
    });

    it('ignores late URLs across workspace switches and refreshes', async () => {
        const first = deferred(), second = deferred(), refresh = deferred();
        sendRpcRequest.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise).mockReturnValueOnce(refresh.promise);
        const {result, rerender} = renderHook(({workspace}) => useDocumentPresignedUrl('doc', workspace), {initialProps: {workspace: 'one'}});
        rerender({workspace: 'two'});
        act(() => result.current.refresh());
        await act(async () => refresh.resolve({url: '/fresh'}));
        await act(async () => second.resolve({url: '/stale'}));
        await act(async () => first.resolve({url: '/wrong-workspace'}));
        expect(result.current.url).toBe('/fresh');
        expect(result.current.isLoading).toBe(false);
        expect(sendRpcRequest).toHaveBeenLastCalledWith(CHAT.FILE_DOWNLOAD_GET, {workspaceId: 'two', docId: 'doc'});
    });

    it('does not retry an old request after its tenant changes', async () => {
        const old = deferred();
        sendRpcRequest.mockReturnValueOnce(old.promise).mockResolvedValueOnce({url: '/new-tenant'});
        const {result} = renderHook(() => useDocumentPresignedUrl('doc', 'workspace'));
        act(() => useAuthStore.setState({tenantId: 'changed-tenant'}));
        await waitFor(() => expect(result.current.url).toBe('/new-tenant'));
        await act(async () => old.reject(new Error('old connection closed')));
        expect(sendRpcRequest).toHaveBeenCalledTimes(2);
        expect(result.current.url).toBe('/new-tenant');
    });

    it('clears a loaded URL when the document is removed', async () => {
        sendRpcRequest.mockResolvedValue({url: '/file'});
        const {result, rerender} = renderHook(({doc}) => useDocumentPresignedUrl(doc, 'workspace'), {initialProps: {doc: 'doc' as string | null}});
        await waitFor(() => expect(result.current.url).toBe('/file'));
        rerender({doc: null});
        expect(result.current.url).toBeNull();
        expect(result.current.isLoading).toBe(false);
        expect(sendRpcRequest).toHaveBeenCalledTimes(1);
    });

    it('retries a transient URL error once and surfaces a persistent error', async () => {
        sendRpcRequest.mockRejectedValue(new Error('unavailable'));
        const {result} = renderHook(() => useDocumentPresignedUrl('doc', 'workspace'));
        await waitFor(() => expect(result.current.error).toBe('Failed to load file'));
        expect(sendRpcRequest).toHaveBeenCalledTimes(2);
        expect(result.current.url).toBeNull();
        expect(result.current.isLoading).toBe(false);
    });

    it('keeps the lazy download fetcher retry contract', async () => {
        sendRpcRequest.mockRejectedValueOnce(new Error('temporary')).mockResolvedValueOnce({url: '/retry'});
        await expect(buildDownloadUrlFetcher('workspace', sendRpcRequest)('doc', 1)).resolves.toEqual({url: '/retry'});
        expect(sendRpcRequest).toHaveBeenCalledTimes(2);
    });
});
