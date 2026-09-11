/**
 * Excel tool catalog — wraps Excel.run() calls exposed to platform agents.
 *
 * Each tool follows the LocalToolDef interface; the handler throws normally
 * on error and the ToolsWssClient request-handler wrapper converts thrown
 * errors into JSON-RPC -32001 (ToolExecutionFailed) responses automatically.
 *
 * Registered tools: read_range, write_range, list_sheets, get_active_sheet,
 *                   read_used_range, get_selection_address
 */

import type { LocalToolDef } from './types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function requireExcel(): void {
  if (typeof Excel === 'undefined') {
    throw new Error('Excel API is not available in this context');
  }
}

// ---------------------------------------------------------------------------
// Tool implementations
// ---------------------------------------------------------------------------

const readRange: LocalToolDef = {
  name: 'excel.read_range',
  description: 'Read a rectangular range of cells from a sheet and return their values.',
  jsonSchema: {
    type: 'object',
    properties: {
      sheet: { type: 'string', description: 'Sheet name; omit to use the active sheet.' },
      range: { type: 'string', description: "A1-notation range, e.g. 'A1:C10'." },
    },
    required: ['range'],
  },
  handler: async (args) => {
    requireExcel();
    const { sheet, range } = args as { sheet?: string; range: string };
    return Excel.run(async (ctx) => {
      const ws = sheet
        ? ctx.workbook.worksheets.getItem(sheet)
        : ctx.workbook.worksheets.getActiveWorksheet();
      const r = ws.getRange(range);
      r.load('values');
      await ctx.sync();
      return { values: r.values };
    });
  },
};

const writeRange: LocalToolDef = {
  name: 'excel.write_range',
  description: 'Write a 2-D array of values into a sheet range.',
  jsonSchema: {
    type: 'object',
    properties: {
      sheet: { type: 'string', description: 'Sheet name; omit to use the active sheet.' },
      range: { type: 'string', description: "Top-left cell or full range in A1 notation." },
      values: { type: 'string', description: 'JSON-encoded 2-D array of values.' },
    },
    required: ['range', 'values'],
  },
  handler: async (args) => {
    requireExcel();
    const { sheet, range, values } = args as { sheet?: string; range: string; values: unknown };
    // values may arrive as a pre-parsed array or as a JSON string
    const parsed: unknown[][] = typeof values === 'string'
      ? (JSON.parse(values) as unknown[][])
      : (values as unknown[][]);
    return Excel.run(async (ctx) => {
      const ws = sheet
        ? ctx.workbook.worksheets.getItem(sheet)
        : ctx.workbook.worksheets.getActiveWorksheet();
      const r = ws.getRange(range);
      r.values = parsed;
      await ctx.sync();
      return { written: parsed.length };
    });
  },
};

const listSheets: LocalToolDef = {
  name: 'excel.list_sheets',
  description: 'Return the names of all worksheets in the workbook.',
  jsonSchema: {
    type: 'object',
    properties: {},
  },
  handler: async () => {
    requireExcel();
    return Excel.run(async (ctx) => {
      const sheets = ctx.workbook.worksheets;
      sheets.load('items/name');
      await ctx.sync();
      return { sheets: sheets.items.map((s) => s.name) };
    });
  },
};

const getActiveSheet: LocalToolDef = {
  name: 'excel.get_active_sheet',
  description: 'Return the name and id of the currently active worksheet.',
  jsonSchema: {
    type: 'object',
    properties: {},
  },
  handler: async () => {
    requireExcel();
    return Excel.run(async (ctx) => {
      const ws = ctx.workbook.worksheets.getActiveWorksheet();
      ws.load('name,id');
      await ctx.sync();
      return { name: ws.name, id: ws.id };
    });
  },
};

const readUsedRange: LocalToolDef = {
  name: 'excel.read_used_range',
  description: 'Read all values in the used range of a sheet (the bounding box of non-empty cells).',
  jsonSchema: {
    type: 'object',
    properties: {
      sheet: { type: 'string', description: 'Sheet name; omit to use the active sheet.' },
    },
  },
  handler: async (args) => {
    requireExcel();
    const { sheet } = args as { sheet?: string };
    return Excel.run(async (ctx) => {
      const ws = sheet
        ? ctx.workbook.worksheets.getItem(sheet)
        : ctx.workbook.worksheets.getActiveWorksheet();
      const used = ws.getUsedRange();
      used.load('values,address');
      await ctx.sync();
      return { address: used.address, values: used.values };
    });
  },
};

const getSelectionAddress: LocalToolDef = {
  name: 'excel.get_selection_address',
  description: 'Return the A1-notation address of the current user selection.',
  jsonSchema: {
    type: 'object',
    properties: {},
  },
  handler: async () => {
    requireExcel();
    return Excel.run(async (ctx) => {
      const sel = ctx.workbook.getSelectedRange();
      sel.load('address');
      await ctx.sync();
      return { address: sel.address };
    });
  },
};

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

export const excelTools: LocalToolDef[] = [
  readRange,
  writeRange,
  listSheets,
  getActiveSheet,
  readUsedRange,
  getSelectionAddress,
];
