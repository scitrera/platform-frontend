#!/usr/bin/env node
/**
 * Build-time manifest host substitution.
 *
 * Reads the three manifest templates (manifests/manifest-*.xml.template),
 * substitutes the add-in host placeholders, and writes concrete manifests.
 *
 * Placeholders:
 *   {{ADDIN_HOST}}    -> full origin incl. scheme, e.g. https://addin.example.test
 * AppDomain values use ADDIN_HOST, including scheme and optional port.
 *
 * Host source (in priority order):
 *   1. ADDIN_HOST env var
 *   2. VITE_ADDIN_HOST env var
 *   3. default https://localhost:3000
 *
 * Output dir (priority):
 *   1. --out=<dir> CLI arg
 *   2. MANIFEST_OUT_DIR env var
 *   3. dist/manifests/
 *
 * Usage:
 *   node scripts/build-manifests.mjs
 *   ADDIN_HOST=https://addin.example.test node scripts/build-manifests.mjs
 *   node scripts/build-manifests.mjs --out=manifests-build
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const DEFAULT_ADDIN_HOST = 'https://localhost:3000';

const HOSTS = ['word', 'excel', 'powerpoint'];

/**
 * Strict allowlist for valid host characters after normalisation.
 * Matches: optional scheme (added below if missing) + hostname labels
 * (alphanumeric + hyphens + dots) + optional port.
 * Anything outside this set (quotes, angle-brackets, slashes beyond the
 * scheme, etc.) is rejected to prevent XML attribute / element injection.
 */
const SAFE_HOST_RE = /^https?:\/\/[a-zA-Z0-9.-]+(:\d+)?$/;

/** Normalise a host value: ensure a scheme, strip any trailing slash, and
 *  validate the result against a strict allowlist to prevent XML injection. */
export function normalizeHost(rawHost) {
  let host = (rawHost ?? '').trim();
  if (!host) host = DEFAULT_ADDIN_HOST;
  if (!/^https?:\/\//i.test(host)) {
    // Office requires HTTPS; assume https when scheme omitted.
    host = `https://${host}`;
  }
  host = host.replace(/\/+$/, '');
  if (!SAFE_HOST_RE.test(host)) {
    throw new Error(
      `ADDIN_HOST "${host}" contains invalid characters. ` +
      `Expected format: https?://hostname[:port] (only a-z A-Z 0-9 . - allowed in the host).`,
    );
  }
  return host;
}

/** Bare host helper. Office AppDomain values must use the full origin instead. */
export function hostToDomain(host) {
  return normalizeHost(host).replace(/^https?:\/\//i, '');
}

/**
 * Substitute the host placeholders in a template string. Pure function — the
 * unit test exercises this directly so substitution stays correct without
 * touching the filesystem.
 */
export function renderManifest(template, rawHost) {
  const host = normalizeHost(rawHost);
  return template
    .replaceAll('{{ADDIN_HOST}}', host)
    .replaceAll('{{ADDIN_DOMAIN}}', host);
}

function parseOutDir(argv) {
  const arg = argv.find((a) => a.startsWith('--out='));
  if (arg) return arg.slice('--out='.length);
  return process.env.MANIFEST_OUT_DIR ?? path.join('dist', 'manifests');
}

function main() {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const root = path.resolve(here, '..');
  const manifestsDir = path.join(root, 'manifests');

  const rawHost = process.env.ADDIN_HOST ?? process.env.VITE_ADDIN_HOST ?? DEFAULT_ADDIN_HOST;
  const host = normalizeHost(rawHost);

  const outDir = path.resolve(root, parseOutDir(process.argv.slice(2)));
  fs.mkdirSync(outDir, { recursive: true });

  for (const h of HOSTS) {
    const templatePath = path.join(manifestsDir, `manifest-${h}.xml.template`);
    const template = fs.readFileSync(templatePath, 'utf8');
    const rendered = renderManifest(template, host);
    const outPath = path.join(outDir, `manifest-${h}.xml`);
    fs.writeFileSync(outPath, rendered, 'utf8');
    process.stdout.write(`  manifest-${h}.xml -> ${path.relative(root, outPath)}\n`);
  }
  process.stdout.write(`Manifests built for host ${host} into ${path.relative(root, outDir)}/\n`);
}

// Only run when invoked directly (not when imported by tests).
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
