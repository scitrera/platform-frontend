import {useEffect, useState} from 'react';
import {cn} from '@/lib/utils';

interface WelcomeGreetingProps {
    /** Heading text. Defaults to "Welcome to Scitrera!". */
    title?: string;
    /** Optional subtitle that types in after the title finishes. */
    subtitle?: string;
    /** Per-character delay for the title typewriter, in ms. Default 55. */
    charDelayMs?: number;
    /** Delay before subtitle begins typing, in ms. Default 350. */
    subtitleStartDelayMs?: number;
}

/**
 * Pretend "first message" rendered when the chat is empty. Stalls a beat
 * while the backend supervisor agent spins up, by streaming a friendly
 * greeting one character at a time (LLM-token-style). Once the supervisor
 * is live and pushes a real message into the chat, this is replaced by
 * normal message rendering.
 */
export default function WelcomeGreeting({
    title = 'Welcome to Scitrera!',
    subtitle,
    charDelayMs = 55,
    subtitleStartDelayMs = 350,
}: WelcomeGreetingProps) {
    const [titleChars, setTitleChars] = useState(0);
    const [subtitleChars, setSubtitleChars] = useState(0);
    const titleDone = titleChars >= title.length;
    const subtitleDone = !subtitle || subtitleChars >= subtitle.length;

    // Type out the title one character at a time.
    useEffect(() => {
        setTitleChars(0);
        let i = 0;
        const tick = () => {
            i += 1;
            setTitleChars(i);
            if (i < title.length) handle = window.setTimeout(tick, charDelayMs);
        };
        let handle = window.setTimeout(tick, charDelayMs);
        return () => window.clearTimeout(handle);
    }, [title, charDelayMs]);

    // Once the title is finished, type out the optional subtitle.
    useEffect(() => {
        if (!subtitle || !titleDone) return;
        setSubtitleChars(0);
        let i = 0;
        const startHandle = window.setTimeout(() => {
            const tick = () => {
                i += 1;
                setSubtitleChars(i);
                if (i < subtitle.length) handle = window.setTimeout(tick, charDelayMs);
            };
            let handle = window.setTimeout(tick, charDelayMs);
            // Stash on outer handle so the cleanup below can clear it too.
            outer = handle;
        }, subtitleStartDelayMs);
        let outer: number | undefined;
        return () => {
            window.clearTimeout(startHandle);
            if (outer !== undefined) window.clearTimeout(outer);
        };
    }, [subtitle, titleDone, charDelayMs, subtitleStartDelayMs]);

    const cursorVisible = !titleDone || !subtitleDone;

    return (
        <div className="w-full flex flex-col items-center justify-center py-12 px-6 text-center">
            <h2 className="text-2xl sm:text-3xl font-semibold text-gray-800 tracking-tight min-h-[2.25rem]">
                {title.slice(0, titleChars)}
                {!titleDone && <Cursor/>}
            </h2>
            {subtitle && (
                <p className="mt-3 text-sm sm:text-base text-gray-500 max-w-md min-h-[1.25rem]">
                    {titleDone ? subtitle.slice(0, subtitleChars) : ''}
                    {titleDone && !subtitleDone && <Cursor inline/>}
                </p>
            )}
            {!subtitle && titleDone && (
                <div className="mt-3">
                    <span className={cn('inline-block h-2 w-2 rounded-full bg-blue-500 animate-pulse')}/>
                </div>
            )}
            {/* Keep the cursor variable used so eslint stays quiet when subtitle is absent. */}
            <span className="sr-only">{cursorVisible ? 'typing' : 'ready'}</span>
        </div>
    );
}

function Cursor({inline = false}: {inline?: boolean}) {
    return (
        <span
            aria-hidden="true"
            className={cn(
                'inline-block bg-gray-700 align-baseline animate-pulse ml-0.5',
                inline ? 'h-3 w-1.5' : 'h-6 w-1',
            )}
        />
    );
}
