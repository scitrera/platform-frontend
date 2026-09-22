import React from 'react';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {cleanup, fireEvent, render, screen} from '@testing-library/react';
import PoweredByScitrera from './PoweredByScitrera.jsx';

const backend = vi.hoisted(() => ({version: '1234567890abcdef', date: '2026-09-22T12:34:00-05:00'}));
vi.mock('../../hooks/useWebSocket.jsx', () => ({useWebSocket: () => ({backendVersion: backend.version, backendBuildDate: backend.date})}));

beforeEach(() => {
    vi.stubEnv('MODE', 'production');
    vi.stubGlobal('__GIT_COMMIT_HASH__', 'abcdef0123456789abcdef0123456789abcdef0123');
    vi.stubGlobal('__BUILD_TIMESTAMP__', '2026-09-22T17:30:00Z');
    backend.version = '1234567890abcdef';
    backend.date = '2026-09-22T12:34:00-05:00';
});
afterEach(() => {cleanup(); vi.unstubAllGlobals(); vi.unstubAllEnvs();});
const open = () => {
    render(<PoweredByScitrera/>);
    fireEvent.click(screen.getByRole('button', {name: /scitrera.ai/}));
};

describe('version dialog', () => {
    it('shows short hashes and UTC build times without exposing a full hash', () => {
        open();
        expect(screen.getByText('abcdef01', {exact: false})).toBeInTheDocument();
        expect(screen.getByText('12345678', {exact: false})).toBeInTheDocument();
        expect(screen.getByText('Built: 2026-09-22 17:30 UTC')).toBeInTheDocument();
        expect(screen.getByText('Built: 2026-09-22 17:34 UTC')).toBeInTheDocument();
        expect(document.body.textContent).not.toContain('1234567890abcdef');
        expect(document.body.textContent).not.toContain('abcdef0123456789');
    });
    it('keeps development labels readable and does not invent unavailable dates', () => {
        backend.version = 'Development';
        backend.date = null;
        vi.stubEnv('MODE', 'development');
        open();
        expect(screen.getAllByText('Development', {exact: false})).toHaveLength(2);
        expect(screen.getAllByText('Built: Unavailable')).toHaveLength(2);
    });
    it('does not display an invalid date from an older server', () => {
        backend.date = 'unknown';
        open();
        expect(screen.getByText('Built: Unavailable')).toBeInTheDocument();
        expect(document.body.textContent).not.toContain('Invalid Date');
    });
});
