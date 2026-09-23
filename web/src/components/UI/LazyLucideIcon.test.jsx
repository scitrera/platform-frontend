import React from 'react';
import {afterEach, describe, expect, it} from 'vitest';
import {cleanup, render, waitFor} from '@testing-library/react';
import LazyLucideIcon from './LazyLucideIcon.jsx';

afterEach(cleanup);

const expectIcon = (container, name) => waitFor(() => {
    expect(container.querySelector('svg')).toHaveClass(`lucide-${name}`);
});

describe('LazyLucideIcon', () => {
    it('replaces an already loaded icon when application metadata changes', async () => {
        const {container, rerender} = render(<LazyLucideIcon iconName="NotebookPen" size={18}/>);
        await expectIcon(container, 'notebook-pen');
        rerender(<LazyLucideIcon iconName="Scale" size={24}/>);
        await expectIcon(container, 'scale');
        expect(container.querySelector('svg')).toHaveAttribute('width', '24');
        rerender(<LazyLucideIcon iconName="ClipboardList"/>);
        await expectIcon(container, 'clipboard-list');
        rerender(<LazyLucideIcon iconName="NotebookPen"/>);
        await expectIcon(container, 'notebook-pen');
    });

    it('recovers from an unknown icon when valid metadata arrives', async () => {
        const {container, rerender} = render(<LazyLucideIcon iconName="UnknownExampleIcon"/>);
        await expectIcon(container, 'circle-alert');
        rerender(<LazyLucideIcon iconName="Library"/>);
        await expectIcon(container, 'library');
    });
});
