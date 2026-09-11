import React from 'react';
import {Streamdown} from 'streamdown';
import {code} from '@streamdown/code';
import {math} from '@streamdown/math';
import {mermaid} from '@streamdown/mermaid';

type StreamdownComponents = React.ComponentProps<typeof Streamdown>['components'];

const defaultComponents = {
    inlineCode: ({children, ...props}: React.HTMLAttributes<HTMLElement>) => (
        <code className="bg-gray-200 dark:bg-gray-700 px-1.5 py-0.5 rounded text-sm font-mono" {...props}>
            {children}
        </code>
    ),
} as StreamdownComponents;

interface SciMarkdownProps {
    children: React.ReactNode;
    /** Extra element renderers merged over the defaults (e.g. a custom `a`). */
    components?: StreamdownComponents;
}

export const SciMarkdown = ({children, components}: SciMarkdownProps) => {
    // flatten all child nodes into one string
    const text = React.Children
        .toArray(children)
        .map(node => {
            if (typeof node === 'string') return node;
            const props = (node as {props?: {children?: unknown}})?.props;
            if (typeof props?.children === 'string') return props.children;
            return '';
        }).join('').trim();

    return (
        <Streamdown
            className="prose prose-slate dark:prose-invert max-w-none"
            plugins={{code, math, mermaid}}
            components={{...defaultComponents, ...components}}
        >
            {text}
        </Streamdown>
    );
};
