#!/usr/bin/env python3
"""Validate source allowlist/provenance; scan first-party build artifacts separately."""
import hashlib
import json
from pathlib import Path
import re
import tomllib
import subprocess

ROOT = Path(__file__).resolve().parents[1]
FORBIDDEN_PARTS = {'.slop', '.omc', '.agents', '.codex', 'node_modules', 'target', 'dist',
                   'frontend-superadmin', 'test-results', 'playwright-report', '.git'}
PRIVATE = re.compile(rb'(?:auth[0-9]*|wss[0-9]*(?:-dev)?)\.scitrera\.ai|(?:tools-wss|addins(?:-dev)?)\.scitrera\.com|ingest\.us\.sentry\.io/[0-9]|BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY|/home/[^/]+/|/Users/[^/]+/')
failures = []

def verify():
    manifest = json.loads((ROOT / 'source-manifest.json').read_text())
    expected = {x['path'] for x in manifest['files']} | {'source-manifest.json'}
    if (ROOT / '.git').exists():
        actual = set(filter(None, subprocess.check_output(['git', 'ls-files', '--cached', '--others', '--exclude-standard', '-z'], cwd=ROOT).decode().split('\0')))
        if actual != expected:
            failures.append(f'Source inventory differs: {sorted(actual ^ expected)}')
    for item in manifest['files']:
        name = item['path']; path = ROOT / name
        if path.is_symlink() or not path.is_file() or Path(name).is_absolute() or '..' in Path(name).parts:
            failures.append(f'Invalid source path: {name}'); continue
        if set(Path(name).parts) & FORBIDDEN_PARTS or (Path(name).name.startswith('.env') and not name.endswith('.env.example')) or name.endswith(('.key', '.crt', '.pem', '.tsbuildinfo')):
            failures.append(f'Forbidden source path: {name}')
        data = path.read_bytes()
        if hashlib.sha256(data).hexdigest() != item['sha256']:
            failures.append(f'Source hash differs: {name}')
        # This checker necessarily contains its own deny patterns.
        if name != 'scripts/check_release.py' and PRIVATE.search(data):
            failures.append(f'Private material match: {name}')
    spec = ROOT / 'vendor/messaging-spec'
    provenance = json.loads((spec / 'provenance.json').read_text())
    for item in provenance['files']:
        expected_hash = provenance.get('patches', {}).get(item['path'], {}).get('sha256', item['sha256'])
        if hashlib.sha256((spec / item['path']).read_bytes()).hexdigest() != expected_hash:
            failures.append(f'Vendored upstream input changed: {item["path"]}')
    for component in ['web', 'office-addin']:
        package = json.loads((ROOT / component / 'package.json').read_text())
        if package.get('private') is not True or 'deploy' in package['scripts']:
            failures.append(f'Publication guard missing: {component}')
        lock = json.loads((ROOT / component / 'package-lock.json').read_text())
        versions = json.loads((ROOT / 'versions.yaml').read_text())['components']
        if package['version'] != versions[component]['version'] or lock['packages']['']['version'] != package['version']:
            failures.append(f'Version metadata mismatch: {component}')
        for location, entry in lock['packages'].items():
            if location and not location.startswith('node_modules/') and location != '../vendor/messaging-spec/typescript':
                failures.append(f'Unexpected lockfile source path: {component}:{location}')
            if entry.get('link') and entry.get('resolved') != '../vendor/messaging-spec/typescript':
                failures.append(f'Unexpected linked source: {component}:{location}')
            url = entry.get('resolved', '')
            if url.startswith(('http:', 'https:')) and not url.startswith('https://registry.npmjs.org/'):
                failures.append(f'Unexpected registry: {component}:{location}')
            if url.startswith('file:') and url != 'file:../vendor/messaging-spec/typescript':
                failures.append(f'Unexpected local input: {component}:{location}')
        for path in (ROOT / component / 'dist').rglob('*'):
            if not path.is_file(): continue
            if path.suffix == '.map': failures.append(f'Unexpected source map: {path.relative_to(ROOT)}')
            if path.suffix in {'.js', '.css', '.html', '.xml'} and PRIVATE.search(path.read_bytes()):
                failures.append(f'Private build material: {path.relative_to(ROOT)}')
    cargo = tomllib.loads((ROOT / 'local-agent/Cargo.toml').read_text())['workspace']['package']
    local_version = json.loads((ROOT / 'versions.yaml').read_text())['components']['local-agent']['version']
    if cargo['version'] != local_version or cargo['license'] != 'MIT':
        failures.append('Rust version/license mismatch')
    if failures:
        raise SystemExit('\n'.join(failures))
    print('Source hashes, public spec provenance, registry paths, exclusions and available bundles verified.')

if __name__ == '__main__': verify()
