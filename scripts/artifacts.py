#!/usr/bin/env python3
"""Local asset/source archives only; never deploy or publish."""
import gzip
import hashlib
import io
import json
from pathlib import Path
import shutil
import sys
import tarfile
from check_release import ROOT, verify
from notices import collect

def archive(target, entries):
    with target.open('wb') as raw, gzip.GzipFile(filename='', mode='wb', fileobj=raw, mtime=0) as compressed, tarfile.open(fileobj=compressed, mode='w') as out:
        for name, path in entries:
            if path.is_symlink() or not path.is_file(): raise RuntimeError(f'Invalid archive file: {name}')
            data = path.read_bytes()
            info = tarfile.TarInfo(name)
            info.size = len(data); info.mode = 0o644; info.mtime = 0
            out.addfile(info, io.BytesIO(data))

if len(sys.argv) != 2 or sys.argv[1] not in {'web', 'office-addin', 'local-agent'}:
    raise SystemExit('Usage: python3 scripts/artifacts.py web|office-addin|local-agent')
component = sys.argv[1]
verify()
version = json.loads((ROOT / 'versions.yaml').read_text())['components'][component]['version']
output = ROOT / 'dist'; output.mkdir(exist_ok=True)
source = output / f'{component}-{version}-source.tar.gz'
items = json.loads((ROOT / 'source-manifest.json').read_text())['files']
archive(source, [(x['path'], ROOT / x['path']) for x in items] + [('source-manifest.json', ROOT / 'source-manifest.json')])
products = [source]
if component != 'local-agent':
    assets = ROOT / component / 'dist'
    if not (assets / 'index.html').is_file(): raise SystemExit(f'Build {component} first')
    collect(component)
    for name in ['LICENSE', 'NOTICE', 'THIRD_PARTY_NOTICES.md']:
        shutil.copyfile(ROOT / name, assets / name)
    shutil.copytree(ROOT / 'LICENSES', assets / 'LICENSES', dirs_exist_ok=True)
    shutil.copyfile(ROOT / 'vendor/messaging-spec/LICENSE', assets / 'LICENSES/messaging-spec-LICENSE')
    shutil.copyfile(source, assets / 'source.tar.gz')
    product = output / f'{component}-{version}-assets.tar.gz'
    archive(product, [(str(p.relative_to(assets)), p) for p in sorted(assets.rglob('*')) if p.is_file()])
    products.append(product)
for product in products:
    checksum = hashlib.sha256(product.read_bytes()).hexdigest()
    product.with_name(product.name + '.sha256').write_text(f'{checksum}  {product.name}\n')
    print(product.relative_to(ROOT), checksum)
