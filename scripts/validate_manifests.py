#!/usr/bin/env python3
"""Local XML/origin/resource checks. Does not upload manifests or certify Office hosts."""
from pathlib import Path
from urllib.parse import urlparse
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]
assets = ROOT / 'office-addin/dist'
ids = set()
for host in ['word', 'excel', 'powerpoint']:
    path = assets / f'manifests/manifest-{host}.xml'
    text = path.read_text()
    assert '{{' not in text, f'Unsubstituted template: {host}'
    root = ET.fromstring(text)
    ns = {'o': 'http://schemas.microsoft.com/office/appforoffice/1.1'}
    identity = root.findtext('o:Id', namespaces=ns)
    assert identity and identity not in ids, 'Manifest IDs must be distinct'
    ids.add(identity)
    for element in root.iter():
        if element.tag.endswith('AppDomain'):
            url = urlparse(element.text or '')
            assert url.scheme in {'http', 'https'} and url.hostname and not url.path, f'Invalid AppDomain: {element.text}'
        value = element.attrib.get('DefaultValue', '')
        if value.startswith(('http://', 'https://')):
            url = urlparse(value)
            if element.tag.endswith(('SourceLocation', 'Url', 'IconUrl', 'HighResolutionIconUrl', 'Image')):
                assert (assets / url.path.lstrip('/')).is_file(), f'Missing {host} asset: {url.path}'
    print(host, 'XML, IDs, origins and referenced assets verified')
assert (assets / 'auth-dialog.html').is_file()
