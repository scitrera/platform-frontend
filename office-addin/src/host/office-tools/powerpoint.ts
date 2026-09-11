/**
 * PowerPoint tool catalog — wraps PowerPoint.run() calls exposed to platform agents.
 *
 * Registered tools: list_slides, get_active_slide, read_slide_text, get_slide_count
 */

import type { LocalToolDef } from './types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function requirePowerPoint(): void {
  if (typeof PowerPoint === 'undefined') {
    throw new Error('PowerPoint API is not available in this context');
  }
}

// ---------------------------------------------------------------------------
// Tool implementations
// ---------------------------------------------------------------------------

const listSlides: LocalToolDef = {
  name: 'powerpoint.list_slides',
  description: 'Return metadata for all slides in the presentation (index, id).',
  jsonSchema: {
    type: 'object',
    properties: {},
  },
  handler: async () => {
    requirePowerPoint();
    return PowerPoint.run(async (ctx) => {
      const slides = ctx.presentation.slides;
      slides.load('items/id');
      await ctx.sync();
      return {
        slides: slides.items.map((s, i) => ({ index: i, id: s.id })),
      };
    });
  },
};

const getSlideCount: LocalToolDef = {
  name: 'powerpoint.get_slide_count',
  description: 'Return the total number of slides in the presentation.',
  jsonSchema: {
    type: 'object',
    properties: {},
  },
  handler: async () => {
    requirePowerPoint();
    return PowerPoint.run(async (ctx) => {
      const slides = ctx.presentation.slides;
      slides.load('items/id');
      await ctx.sync();
      return { count: slides.items.length };
    });
  },
};

const getActiveSlide: LocalToolDef = {
  name: 'powerpoint.get_active_slide',
  description: 'Return the id and index of the currently selected (active) slide.',
  jsonSchema: {
    type: 'object',
    properties: {},
  },
  handler: async () => {
    requirePowerPoint();
    // PowerPoint API exposes the selected slides via presentation.getSelectedSlides (1.5+)
    return PowerPoint.run(async (ctx) => {
      const selected = ctx.presentation.getSelectedSlides();
      selected.load('items/id');
      await ctx.sync();
      const first = selected.items[0];
      if (!first) return { id: null, index: null };
      return { id: first.id };
    });
  },
};

const readSlideText: LocalToolDef = {
  name: 'powerpoint.read_slide_text',
  description: 'Return all text content from all text shapes on a slide.',
  jsonSchema: {
    type: 'object',
    properties: {
      slideIndex: { type: 'string', description: 'Zero-based slide index.' },
    },
    required: ['slideIndex'],
  },
  handler: async (args) => {
    requirePowerPoint();
    const { slideIndex } = args as { slideIndex: string | number };
    const idx = typeof slideIndex === 'string' ? parseInt(slideIndex, 10) : slideIndex;
    return PowerPoint.run(async (ctx) => {
      const slides = ctx.presentation.slides;
      slides.load('items/id');
      await ctx.sync();

      const slide = slides.items[idx];
      if (!slide) throw new Error(`No slide at index ${idx}`);

      const shapes = slide.shapes;
      shapes.load('items/textFrame/textRange/text');
      await ctx.sync();

      const texts = shapes.items
        .map((s) => {
          try {
            return s.textFrame?.textRange?.text ?? '';
          } catch {
            return '';
          }
        })
        .filter(Boolean);

      return { texts };
    });
  },
};

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

export const powerPointTools: LocalToolDef[] = [
  listSlides,
  getSlideCount,
  getActiveSlide,
  readSlideText,
];
