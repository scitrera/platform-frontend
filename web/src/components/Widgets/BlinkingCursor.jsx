// adapted from: https://github.com/Chainlit/chainlit/blob/main/frontend/src/components/BlinkingCursor.tsx
// Apache 2.0 License
// Retrieved: 2025-05-19
//
import {cn} from "../../lib/utils";

export const CURSOR_PLACEHOLDER = '\u200B';

export default function BlinkingCursor({whitespace}) {
    return (
        <span
            className={cn(
                'inline-block h-3.5 w-3.5 bg-foreground rounded-full animate-pulse',
                whitespace && 'ml-2'
            )}
        />
    );
}