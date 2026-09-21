import {act, renderHook} from '@testing-library/react';
import {afterEach, beforeEach, expect, it, vi} from 'vitest';
import {useFileUploader} from './FileUploadFunctions.jsx';

const {sendRpcRequest, sendMessage} = vi.hoisted(() => ({sendRpcRequest: vi.fn(), sendMessage: vi.fn()}));
vi.mock('../hooks/useWebSocket.jsx', () => ({useWebSocket: () => ({sendRpcRequest, sendMessage})}));
class XHR {
    static instances = [];
    upload = {};
    status = 0;
    open = vi.fn();
    send = vi.fn();
    setRequestHeader = vi.fn();
    abort = vi.fn(() => this.onabort?.());
    constructor() { XHR.instances.push(this); }
}
const file = new File(['synthetic'], 'sample.pdf', {type: 'application/pdf'});
beforeEach(() => {
    XHR.instances = [];
    sendRpcRequest.mockReset().mockResolvedValue({key: 'vfs_new', method: 'PUT', url: '/synthetic-upload'});
    vi.stubGlobal('XMLHttpRequest', XHR);
});
afterEach(() => vi.unstubAllGlobals());

it.each(['load', 'error', 'timeout', 'abort'])('reports the minted ref once on %s failure', async event => {
    const finish = vi.fn();
    const {result} = renderHook(() => useFileUploader('workspace'));
    await act(async () => result.current.uploadFile({file, onFinish: finish}));
    const xhr = XHR.instances[0]; xhr.status = 403;
    act(() => { xhr['on' + event](); xhr.onerror(); });
    expect(finish).toHaveBeenCalledExactlyOnceWith('vfs_new', expect.any(Error));
});
it('preserves the ref when XMLHttpRequest setup fails', async () => {
    vi.stubGlobal('XMLHttpRequest', class extends XHR { open = () => { throw new Error('setup failed'); }; });
    const finish = vi.fn();
    const {result} = renderHook(() => useFileUploader('workspace'));
    await act(async () => result.current.uploadFile({file, onFinish: finish}));
    expect(finish).toHaveBeenCalledExactlyOnceWith('vfs_new', expect.objectContaining({message: 'setup failed'}));
});
it('cancels the real request and ignores late success', async () => {
    const controller = new AbortController(), finish = vi.fn();
    const {result} = renderHook(() => useFileUploader('workspace'));
    await act(async () => result.current.uploadFile({file, signal: controller.signal, onFinish: finish}));
    act(() => { controller.abort(); XHR.instances[0].status = 200; XHR.instances[0].onload(); });
    expect(XHR.instances[0].abort).toHaveBeenCalledOnce();
    expect(finish).toHaveBeenCalledExactlyOnceWith('vfs_new', expect.objectContaining({message: 'Upload cancelled.'}));
});
it('returns a late-minted ref for cleanup when cancelled during initiation', async () => {
    let resolve;
    sendRpcRequest.mockReturnValue(new Promise(yes => { resolve = yes; }));
    const controller = new AbortController(), finish = vi.fn();
    const {result} = renderHook(() => useFileUploader('workspace'));
    let pending;
    act(() => { pending = result.current.uploadFile({file, signal: controller.signal, onFinish: finish}); controller.abort(); });
    await act(async () => { resolve({key: 'vfs_late'}); await pending; });
    expect(XHR.instances).toHaveLength(0);
    expect(finish).toHaveBeenCalledExactlyOnceWith('vfs_late', expect.any(Error));
});
it('accepts signed PUT and POST success without reporting a failure', async () => {
    const {result} = renderHook(() => useFileUploader('workspace'));
    for (const [method, status] of [['PUT', 200], ['POST', 204]]) {
        sendRpcRequest.mockResolvedValueOnce({key: 'vfs_success', method, url: '/synthetic-upload', fields: {key: 'synthetic'}});
        const finish = vi.fn();
        await act(async () => result.current.uploadFile({file, onFinish: finish}));
        const xhr = XHR.instances.at(-1); xhr.status = status;
        act(() => xhr.onload());
        expect(xhr.open).toHaveBeenCalledWith(method, '/synthetic-upload');
        expect(xhr.send).toHaveBeenCalledWith(method === 'PUT' ? file : expect.any(FormData));
        expect(finish).toHaveBeenCalledExactlyOnceWith('vfs_success', null);
    }
});
