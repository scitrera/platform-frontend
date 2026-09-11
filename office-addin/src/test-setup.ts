import '@testing-library/jest-dom';

// Stub the Office global so imports that reference it don't throw in jsdom.
// Individual tests can override properties as needed.
(globalThis as Record<string, unknown>)['Office'] = {
  onReady: (cb: () => void) => cb(),
  context: {
    host: null,
    ui: { displayDialogAsync: undefined },
  },
  HostType: {
    Word: 'Word',
    Excel: 'Excel',
    PowerPoint: 'PowerPoint',
    Outlook: 'Outlook',
  },
  requirements: {
    isSetSupported: () => false,
  },
  actions: {
    associate: () => undefined,
  },
  auth: {
    getAccessToken: async () => { throw new Error('Not in Office context'); },
  },
};
