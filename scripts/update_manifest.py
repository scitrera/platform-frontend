#!/usr/bin/env python3
"""Record staged public source paths; run after git add of reviewed changes."""
import hashlib
import json
from pathlib import Path
import subprocess
ROOT = Path(__file__).resolve().parents[1]
paths = subprocess.check_output(['git', 'ls-files', '-z'], cwd=ROOT).decode().split('\0')
files = []
for name in sorted(p for p in paths if p and p != 'source-manifest.json'):
    path = ROOT / name
    if path.is_symlink() or not path.is_file():
        raise SystemExit(f'Expected regular file: {name}')
    files.append({'path': name, 'sha256': hashlib.sha256(path.read_bytes()).hexdigest()})
(ROOT / 'source-manifest.json').write_text(json.dumps({'files': files}, indent=2) + '\n')
print(len(files), 'source files recorded')
