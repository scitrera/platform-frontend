/**
 * Detect the current Office host application and capability flags.
 */

export type OfficeHost = 'WORD' | 'EXCEL' | 'POWERPOINT' | 'OUTLOOK' | 'UNKNOWN';

/**
 * Detect the current Office host.
 * Returns UNKNOWN when Office.js is not loaded or host is unrecognised.
 */
export function detectHost(): OfficeHost {
  if (typeof Office === 'undefined' || !Office?.context?.host) return 'UNKNOWN';
  const host = Office.context.host;
  switch (host) {
    case Office.HostType.Word:
      return 'WORD';
    case Office.HostType.Excel:
      return 'EXCEL';
    case Office.HostType.PowerPoint:
      return 'POWERPOINT';
    case Office.HostType.Outlook:
      return 'OUTLOOK';
    default:
      return 'UNKNOWN';
  }
}

/**
 * Check whether a requirement set is supported.
 * Safe to call even when Office is not loaded (returns false).
 *
 * Note: Office.requirements is typed as optional in @types/office-js;
 * we access it via bracket notation to avoid strict-mode property errors
 * in environments where the property may not be present at runtime.
 */
export function isSetSupported(name: string, minVersion: string): boolean {
  if (typeof Office === 'undefined') return false;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const req = (Office as any).requirements as
    | { isSetSupported: (n: string, v: string) => boolean }
    | undefined;
  if (!req?.isSetSupported) return false;
  try {
    return req.isSetSupported(name, minVersion);
  } catch {
    return false;
  }
}

export function isExcelSupported(): boolean {
  return isSetSupported('ExcelApi', '1.1');
}

export function isWordSupported(): boolean {
  return isSetSupported('WordApi', '1.1');
}

export function isPowerPointSupported(): boolean {
  return isSetSupported('PowerPointApi', '1.1');
}
