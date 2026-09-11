/**
 * Word tool catalog — wraps Word.run() calls exposed to platform agents.
 *
 * Registered tools: read_document_text, read_selection, insert_text_at_cursor,
 *                   replace_selection, list_headings
 */

import type { LocalToolDef } from './types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function requireWord(): void {
  if (typeof Word === 'undefined') {
    throw new Error('Word API is not available in this context');
  }
}

// ---------------------------------------------------------------------------
// Tool implementations
// ---------------------------------------------------------------------------

const readDocumentText: LocalToolDef = {
  name: 'word.read_document_text',
  description: 'Return the full plain text of the document body.',
  jsonSchema: {
    type: 'object',
    properties: {},
  },
  handler: async () => {
    requireWord();
    return Word.run(async (ctx) => {
      const body = ctx.document.body;
      body.load('text');
      await ctx.sync();
      return { text: body.text };
    });
  },
};

const readSelection: LocalToolDef = {
  name: 'word.read_selection',
  description: 'Return the text currently selected by the user.',
  jsonSchema: {
    type: 'object',
    properties: {},
  },
  handler: async () => {
    requireWord();
    return Word.run(async (ctx) => {
      const sel = ctx.document.getSelection();
      sel.load('text');
      await ctx.sync();
      return { text: sel.text };
    });
  },
};

const insertTextAtCursor: LocalToolDef = {
  name: 'word.insert_text_at_cursor',
  description: 'Insert text at the current cursor position (replaces selection if any).',
  jsonSchema: {
    type: 'object',
    properties: {
      text: { type: 'string', description: 'Text to insert.' },
      insertLocation: {
        type: 'string',
        description: "Where to insert relative to the selection: 'Replace', 'Start', 'End', 'Before', 'After'. Default: 'End'.",
        enum: ['Replace', 'Start', 'End', 'Before', 'After'],
      },
    },
    required: ['text'],
  },
  handler: async (args) => {
    requireWord();
    const { text, insertLocation = 'End' } = args as { text: string; insertLocation?: string };
    return Word.run(async (ctx) => {
      const sel = ctx.document.getSelection();
      // Word.InsertLocation enum values are strings at runtime
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      sel.insertText(text, insertLocation as any);
      await ctx.sync();
      return { inserted: true };
    });
  },
};

const replaceSelection: LocalToolDef = {
  name: 'word.replace_selection',
  description: 'Replace the current selection with the provided text.',
  jsonSchema: {
    type: 'object',
    properties: {
      text: { type: 'string', description: 'Replacement text.' },
    },
    required: ['text'],
  },
  handler: async (args) => {
    requireWord();
    const { text } = args as { text: string };
    return Word.run(async (ctx) => {
      const sel = ctx.document.getSelection();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      sel.insertText(text, 'Replace' as any);
      await ctx.sync();
      return { replaced: true };
    });
  },
};

const listHeadings: LocalToolDef = {
  name: 'word.list_headings',
  description: 'Return all heading paragraphs (H1–H6) in document order with their text and level.',
  jsonSchema: {
    type: 'object',
    properties: {},
  },
  handler: async () => {
    requireWord();
    return Word.run(async (ctx) => {
      const paras = ctx.document.body.paragraphs;
      paras.load('items/text,items/styleBuiltIn');
      await ctx.sync();

      const headingStyles = new Set([
        'Heading1', 'Heading2', 'Heading3',
        'Heading4', 'Heading5', 'Heading6',
      ]);

      const headings = paras.items
        .filter((p) => headingStyles.has(p.styleBuiltIn))
        .map((p) => ({
          text: p.text,
          style: p.styleBuiltIn,
        }));

      return { headings };
    });
  },
};

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

export const wordTools: LocalToolDef[] = [
  readDocumentText,
  readSelection,
  insertTextAtCursor,
  replaceSelection,
  listHeadings,
];
