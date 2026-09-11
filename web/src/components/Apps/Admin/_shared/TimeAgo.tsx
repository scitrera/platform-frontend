import {useEffect, useState} from 'react';

function formatRelative(ts: number): string {
    if (!ts) return '—';
    const ms = ts > 1e12 ? ts : ts * 1000;
    const diff = Date.now() - ms;
    if (diff < 0) return 'in the future';
    const sec = Math.floor(diff / 1000);
    if (sec < 60) return `${sec}s ago`;
    const min = Math.floor(sec / 60);
    if (min < 60) return `${min}m ago`;
    const hr = Math.floor(min / 60);
    if (hr < 24) return `${hr}h ago`;
    const day = Math.floor(hr / 24);
    return `${day}d ago`;
}

export function TimeAgo({ts}: {ts: number}) {
    const [, force] = useState(0);
    useEffect(() => {
        const t = setInterval(() => force(n => n + 1), 30_000);
        return () => clearInterval(t);
    }, []);
    return <span>{formatRelative(ts)}</span>;
}
