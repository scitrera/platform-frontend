import React, {useState} from 'react';
import {act, fireEvent, render, screen, waitFor, within} from '@testing-library/react';
import {beforeEach, expect, it, vi} from 'vitest';
import FileBrowser from './LibraryFileBrowser.jsx';

const state = vi.hoisted(() => ({requests: [], notify: vi.fn(), upload: vi.fn(), register: vi.fn(() => () => {})}));
vi.mock('../../utils/FileUploadFunctions.jsx', () => ({useFileUploader: () => ({uploadFile: state.upload, notifyUploadComplete: state.notify})}));
vi.mock('../../hooks/useChatState', () => ({useChatState: () => ({addDocument: vi.fn(), clearDocuments: vi.fn()})}));
vi.mock('../../hooks/useWebSocketApi.js', () => ({useWebSocketApi: () => ({sendRpcRequest: vi.fn(), registerAppListener: state.register})}));
const file = new File(['synthetic'], 'sample.pdf', {type: 'application/pdf'});
const row = {name: file.name, path: 'Bids/example', vfs_ref: 'vfs_pending', uploading: true};
beforeEach(() => {
    state.requests = [];
    state.notify.mockReset();
    state.upload.mockReset().mockImplementation(request => { state.requests.push(request); request.onStart(); request.onPrepared?.('vfs_pending'); });
});
function setup(remove = vi.fn().mockResolvedValue(undefined), {startUpload = true, rows = [row]} = {}) {
    const completion = vi.fn(), refresh = vi.fn();
    function Browser() {
        const [data, setData] = useState(rows);
        return <FileBrowser data={data} workspaceId="workspace" initialPath="/Bids/example"
            onUploadCompletion={completion} refreshFunction={refresh} showReferenceInChat={false}
            onDelete={async keys => { await remove(keys); setData(previous => previous.filter(item => !keys.includes(item.vfs_ref))); }}/>;
    }
    const view = render(<Browser/>);
    const input = view.container.querySelector('input[type=file]');
    if (startUpload) fireEvent.change(input, {target: {files: [file]}});
    return {...view, input, completion, remove, refresh};
}
it('removes a failed upload placeholder and leaves a visible retryable error', async () => {
    const view = setup();
    expect(screen.getByText('Uploading...')).toBeVisible();
    await act(async () => state.requests[0].onFinish('vfs_pending', new Error('Upload failed with status 403')));
    expect(view.remove).toHaveBeenCalledExactlyOnceWith(['vfs_pending']);
    expect(screen.queryByText('Uploading...')).not.toBeInTheDocument();
    expect(within(screen.getByRole('table')).queryByText(file.name)).not.toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('403');
    expect(screen.getByRole('button', {name: 'Retry upload sample.pdf'})).toBeVisible();
    expect(state.notify).not.toHaveBeenCalled();
    expect(view.completion).not.toHaveBeenCalled();
    expect(view.refresh).toHaveBeenCalled();
});
it('keeps failed rows actionable when cleanup fails, even after dismissing the tray', async () => {
    const remove = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(undefined);
    setup(remove);
    await act(async () => state.requests[0].onFinish('vfs_pending', new Error('Upload failed')));
    expect(screen.queryByText('Uploading...')).not.toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('Could not remove the unfinished file');
    fireEvent.click(screen.getByRole('button', {name: 'Dismiss upload sample.pdf'}));
    expect(within(screen.getByRole('table')).getByText('Upload failed')).toBeVisible();
    fireEvent.click(within(screen.getByRole('table')).getByText(file.name));
    fireEvent.click(screen.getByRole('button', {name: 'Delete Files'}));
    await waitFor(() => expect(within(screen.getByRole('table')).queryByText(file.name)).not.toBeInTheDocument());
    expect(remove).toHaveBeenCalledTimes(2);
});
it('retries the same file as a fresh upload and only finalizes the successful ref', async () => {
    const view = setup();
    await act(async () => state.requests[0].onFinish('vfs_pending', new Error('Upload failed')));
    fireEvent.click(screen.getByRole('button', {name: 'Retry upload sample.pdf'}));
    expect(state.requests[1].file).toBe(file);
    expect(state.requests[1].sourcePath).toBe('/Bids/example/sample.pdf');
    await act(async () => state.requests[1].onFinish('vfs_retry', null));
    expect(state.notify).toHaveBeenCalledExactlyOnceWith(['vfs_retry'], {visibility: 'workspace'});
    expect(view.completion).toHaveBeenCalledExactlyOnceWith(['vfs_retry'], [{name: file.name, size: file.size}]);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(view.remove).toHaveBeenCalledTimes(1);
});
it('does not delete any file if initiation failed before a ref was minted', async () => {
    const view = setup();
    await act(async () => state.requests[0].onFinish(null, new Error('Initiation failed')));
    expect(view.remove).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent('Initiation failed');
});

it('makes persisted unfinished uploads removable after reload and preserves a successful duplicate', async () => {
    const completed = {...row, vfs_ref: 'vfs_success', uploading: false, modified: '2026-01-01T00:00:00Z', size: 9};
    const view = setup(undefined, {startUpload: false, rows: [row, completed]});
    expect(screen.queryByText('Uploading...')).not.toBeInTheDocument();
    expect(screen.getByText('Upload unfinished')).toBeVisible();
    fireEvent.click(screen.getByRole('button', {name: 'Remove unfinished upload sample.pdf'}));
    await waitFor(() => expect(screen.queryByText('Upload unfinished')).not.toBeInTheDocument());
    expect(view.remove).toHaveBeenCalledExactlyOnceWith(['vfs_pending']);
    await waitFor(() => expect(within(screen.getByRole('table')).getAllByText(file.name)).toHaveLength(1));
    expect(state.notify).not.toHaveBeenCalled();
});
it('allows selecting several old pending entries for bulk deletion', async () => {
    const view = setup(undefined, {startUpload: false, rows: [row, {...row, vfs_ref: 'vfs_other', name: 'other.pdf'}]});
    const table = within(screen.getByRole('table'));
    fireEvent.click(table.getAllByRole('checkbox')[0]);
    fireEvent.click(screen.getByRole('button', {name: 'Delete Files'}));
    await waitFor(() => expect(table.queryByText(file.name)).not.toBeInTheDocument());
    expect(view.remove).toHaveBeenCalledExactlyOnceWith(['vfs_other', 'vfs_pending']);
});
it('shows deletion errors and keeps persisted placeholders available for retry', async () => {
    const remove = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(undefined);
    setup(remove, {startUpload: false});
    fireEvent.click(screen.getByRole('button', {name: 'Remove unfinished upload sample.pdf'}));
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Could not delete'));
    fireEvent.click(screen.getByRole('button', {name: 'Remove unfinished upload sample.pdf'}));
    await waitFor(() => expect(screen.queryByText('Upload unfinished')).not.toBeInTheDocument());
    expect(remove).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
});
it('excludes a local active upload from row actions and select-all deletion', () => {
    setup();
    expect(screen.getByText('Uploading...')).toBeVisible();
    expect(screen.queryByRole('button', {name: 'Remove unfinished upload sample.pdf'})).not.toBeInTheDocument();
    fireEvent.click(within(screen.getByRole('table')).getAllByRole('checkbox')[0]);
    expect(screen.getByRole('button', {name: 'Delete Files'})).toBeDisabled();
});
