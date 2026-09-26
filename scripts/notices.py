#!/usr/bin/env python3
"""Collect installed npm notices, preserving upstream and declared-license sources."""
import hashlib
import json
import shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SUPPLEMENTS = ROOT / 'LICENSES/dependencies/provenance.json'


def license_texts(package):
    return [f'{f.name}\n{f.read_text(errors="replace")}' for f in sorted(package.iterdir())
            if f.is_file() and f.name.lower().startswith(
                ('license', 'licence', 'copying', 'notice', 'third-party-license'))]


def checked_supplement(item):
    path = ROOT / item['file']
    data = path.read_bytes()
    if hashlib.sha256(data).hexdigest() != item['sha256']:
        raise RuntimeError(f'License provenance mismatch: {item["file"]}')
    return f'{item["source"]}\n{data.decode()}'


def collect(component):
    root = ROOT / component
    lock = json.loads((root / 'package-lock.json').read_text())
    supplements = json.loads(SUPPLEMENTS.read_text())
    standard = json.loads((ROOT / 'LICENSES/dependencies/standard-provenance.json').read_text())
    records, sections, installed = [], [], []
    for location, entry in sorted(lock['packages'].items()):
        if not location.startswith('node_modules/'):
            continue
        package = root / location
        manifest = package / 'package.json'
        if not manifest.is_file():
            if entry.get('optional'):
                continue
            raise RuntimeError(f'Missing installed package: {location}')
        installed.append((package, json.loads(manifest.read_text())))
    for package, data in installed:
        name, version = data['name'], data['version']
        declared = data.get('license') or ' OR '.join(x['type'] for x in data.get('licenses', []))
        texts = license_texts(package)
        sources = ['package files'] if texts else []
        supplement = supplements.get(f'{name}@{version}')
        if supplement:
            texts.append(checked_supplement(supplement))
            sources.append(supplement['source'])
        has_terms = bool(texts) and not (supplement and supplement.get('supplemental_only'))
        # Platform-specific build bindings share their parent project's exact version.
        parent = next((parent for prefix, parent in [('@esbuild/', 'esbuild'),
                       ('@rollup/', 'rollup'), ('@rolldown/', 'rolldown')]
                       if name.startswith(prefix)), None)
        if not has_terms and parent:
            for other, meta in installed:
                if meta['name'] == parent and meta['version'] == version:
                    extra = license_texts(other)
                    if extra:
                        texts.extend(extra); sources.append(f'{parent}@{version} package license'); has_terms = True
                        break
        if not has_terms and name == '@scitrera/messaging-spec':
            texts.append((ROOT / 'vendor/messaging-spec/LICENSE').read_text())
            sources.append('pinned messaging-spec LICENSE'); has_terms = True
        if not has_terms and declared in {'MIT', 'Apache-2.0'}:
            # Some pinned upstream packages declare a license without providing its
            # text. Identify this explicitly; do not invent a copyright statement.
            if declared == 'MIT':
                texts.append(checked_supplement(standard))
            else:
                texts.append((ROOT / 'LICENSES/Apache-2.0.txt').read_text())
            sources.append('standard terms for package-declared license; no standalone upstream notice supplied')
            has_terms = True
        if not has_terms:
            raise RuntimeError(f'No reviewed license terms for {name}@{version}')
        record = {'name': name, 'version': version, 'license': declared or 'See included license file',
                  'author': data.get('author'), 'contributors': data.get('contributors'),
                  'license_files': len(texts), 'notice_sources': sources}
        records.append(record)
        sections.append(f'{name}@{version}\nDeclared license: {record["license"]}\n'
                        f'Author/contributor metadata (not a substituted copyright notice): '
                        f'{json.dumps({"author": record["author"], "contributors": record["contributors"]})}\n'
                        f'Notice sources: {json.dumps(sources)}\n' + '\n\n'.join(texts))
    out = root / 'dist'
    out.mkdir(exist_ok=True)
    (out / 'dependency-licenses.json').write_text(json.dumps(records, indent=2) + '\n')
    (out / 'dependency-notices.txt').write_text('\n\n'.join(sections) + '\n')
    return records


def prepare_assets(component):
    """Stage license disclosures beside built assets without generating archives."""
    records = collect(component)
    assets = ROOT / component / 'dist'
    for name in ['LICENSE', 'NOTICE', 'THIRD_PARTY_NOTICES.md']:
        shutil.copyfile(ROOT / name, assets / name)
    shutil.copytree(ROOT / 'LICENSES', assets / 'LICENSES', dirs_exist_ok=True)
    shutil.copyfile(ROOT / 'vendor/messaging-spec/LICENSE', assets / 'LICENSES/messaging-spec-LICENSE')
    if component == 'web':
        # Remove source bundles left by the former web packaging workflow.
        (assets / 'source.tar.gz').unlink(missing_ok=True)
    return records


if __name__ == '__main__':
    import sys
    for component in sys.argv[1:] or ['web', 'office-addin']:
        if component not in {'web', 'office-addin'}:
            raise SystemExit('Expected web or office-addin')
        records = prepare_assets(component)
        print(component, len(records), 'installed package notices collected')
