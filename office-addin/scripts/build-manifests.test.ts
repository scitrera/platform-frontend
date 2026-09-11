/**
 * Unit tests for the manifest host-substitution helpers.
 * Exercises the pure render function without touching the filesystem.
 */
import { describe, it, expect } from 'vitest';
import {
  renderManifest,
  normalizeHost,
  hostToDomain,
  DEFAULT_ADDIN_HOST,
} from './build-manifests.mjs';

const TEMPLATE = [
  '<IconUrl DefaultValue="{{ADDIN_HOST}}/assets/icon-32.png"/>',
  '<AppDomain>{{ADDIN_DOMAIN}}</AppDomain>',
  '<SourceLocation DefaultValue="{{ADDIN_HOST}}/index.html"/>',
].join('\n');

describe('renderManifest', () => {
  it('substitutes ADDIN_HOST into the output', () => {
    const out = renderManifest(TEMPLATE, 'https://foo');
    expect(out).toContain('https://foo/assets/icon-32.png');
    expect(out).toContain('https://foo/index.html');
    expect(out).not.toContain('{{ADDIN_HOST}}');
  });

  it('substitutes the full origin into AppDomain', () => {
    const out = renderManifest(TEMPLATE, 'https://foo.example.com');
    expect(out).toContain('<AppDomain>https://foo.example.com</AppDomain>');
    expect(out).not.toContain('{{ADDIN_DOMAIN}}');
  });

  it('defaults to the dev host when given empty input', () => {
    const out = renderManifest(TEMPLATE, '');
    expect(out).toContain(`${DEFAULT_ADDIN_HOST}/index.html`);
  });

  it('strips trailing slashes from the host', () => {
    const out = renderManifest(TEMPLATE, 'https://foo.com/');
    expect(out).toContain('https://foo.com/index.html');
    expect(out).not.toContain('https://foo.com//index.html');
  });
});

describe('normalizeHost', () => {
  it('assumes https when scheme is omitted', () => {
    expect(normalizeHost('addin.example.test')).toBe('https://addin.example.test');
  });

  it('preserves an explicit scheme', () => {
    expect(normalizeHost('http://localhost:3000')).toBe('http://localhost:3000');
  });

  it('falls back to the default for empty/undefined', () => {
    expect(normalizeHost('')).toBe(DEFAULT_ADDIN_HOST);
    expect(normalizeHost(undefined)).toBe(DEFAULT_ADDIN_HOST);
  });

  it('throws on a host with embedded XML-breaking characters', () => {
    // A host containing `"` or `>` could break out of an XML attribute and
    // inject arbitrary markup into the rendered manifest.
    expect(() => normalizeHost('https://evil.com"/></OfficeApp><script>x</script><a b="')).toThrow(/invalid characters/i);
    expect(() => normalizeHost('https://evil.com"><injected/>')).toThrow(/invalid characters/i);
    expect(() => normalizeHost('https://evil.com&amp;')).toThrow(/invalid characters/i);
  });

  it('throws on a host with path components or spaces', () => {
    expect(() => normalizeHost('https://foo.com/extra/path')).toThrow(/invalid characters/i);
    expect(() => normalizeHost('https://foo.com bar')).toThrow(/invalid characters/i);
  });

  it('accepts a host with a numeric port', () => {
    expect(normalizeHost('https://127.0.0.1:3000')).toBe('https://127.0.0.1:3000');
  });
});

describe('hostToDomain', () => {
  it('strips the scheme', () => {
    expect(hostToDomain('https://foo.com')).toBe('foo.com');
    expect(hostToDomain('foo.com')).toBe('foo.com');
  });
});
