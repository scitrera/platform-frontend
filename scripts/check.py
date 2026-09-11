#!/usr/bin/env python3
"""Independent client checks; every failure is reported and returns nonzero."""
import argparse
from pathlib import Path
import subprocess

ROOT = Path(__file__).resolve().parents[1]
p = argparse.ArgumentParser()
p.add_argument('component', choices=['web', 'office-addin', 'local-agent', 'spec'])
p.add_argument('--install', action='store_true', help='Clean npm install from locks before checking')
p.add_argument('--checks', default='lint,typecheck,test,build', help='Explicit npm checks (comma separated)')
a = p.parse_args()
failed = []

def run(path, command):
    print(f'[{path}] {" ".join(command)}', flush=True)
    result = subprocess.run(command, cwd=ROOT / path)
    if result.returncode:
        failed.append(f'{path}: {" ".join(command)}')
    return result.returncode == 0

if a.component == 'local-agent':
    run('local-agent', ['cargo', 'test', '--workspace', '--locked'])
    run('local-agent', ['cargo', 'build', '--workspace', '--locked'])
else:
    spec = 'vendor/messaging-spec/typescript'
    if a.install and not run(spec, ['npm', 'ci']):
        raise SystemExit(1)
    if not run(spec, ['npm', 'run', 'build']):
        raise SystemExit(1)
    if a.component == 'spec':
        run(spec, ['npm', 'run', 'typecheck'])
        run(spec, ['npm', 'test'])
    else:
        if a.install and not run(a.component, ['npm', 'ci']):
            raise SystemExit(1)
        for check in a.checks.split(','):
            if check not in {'lint', 'typecheck', 'test', 'build', 'test:e2e', 'build:manifests'}:
                p.error(f'Unknown check {check}')
            run(a.component, ['npm', 'run', check])
if failed:
    print('FAILED:\n' + '\n'.join(failed))
raise SystemExit(bool(failed))
