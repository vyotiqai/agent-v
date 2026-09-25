"""Writes the design system's index, ds/project/design-system.json, from ds-assets.json (the ids the Design System
artifact gave each uploaded icon and logo). Run after ds_build.py, and publish the index last.

Run: python3 ds_index.py
"""
import datetime
import json
import os

ROOT = os.path.dirname(os.path.abspath(__file__))


def main():
    with open(os.path.join(ROOT, 'ds-assets.json')) as f:
        assets = json.load(f)  # "Group/file.svg": [blob id, stored size in bytes]
    on_disk = {f'{g}/{n}' for g in ('Icons', 'Logos') for n in os.listdir(os.path.join(ROOT, 'ds', 'project', 'assets', g)) if n.endswith('.svg')}
    missing = on_disk - set(assets)
    if missing:
        raise SystemExit(f'Upload these first and add their ids to ds-assets.json: {sorted(missing)}')
    now = datetime.datetime.now(datetime.timezone.utc).replace(microsecond=0).isoformat().replace('+00:00', 'Z')
    groups = {}
    for key, (blob, size) in sorted(assets.items()):
        group, name = key.split('/', 1)
        g = groups.setdefault(group, {'name': group, 'tile': 's' if group == 'Icons' else 'm', 'order': [], 'files': {}})
        g['order'].append(name)
        g['files'][name] = {'name': name, 'blob': blob, 'size': size, 'type': 'image/svg+xml'}
    index = {
        'v': 3, 'layout': 'files', 'createdOnFiles': {'v': 1, 'at': now}, 'title': 'Agent V', 'namespace': 'AgentV',
        'libraries': [{'name': 'react', 'version': '18'}, {'name': 'react-dom', 'version': '18'}],
        'sections': {}, 'groups': ['Logos', 'Icons'], 'assetGroups': {'Logos': groups['Logos'], 'Icons': groups['Icons']},
        'blobs': {}, 'docs': {'sections': []},
        'lastChange': {'by': 'Claude', 'at': now, 'via': 'Claude Code', 'note': 'Built from docs/design/prototype'},
    }
    with open(os.path.join(ROOT, 'ds', 'project', 'design-system.json'), 'w') as f:
        json.dump(index, f, indent=2, ensure_ascii=False)
    print('wrote ds/project/design-system.json with', len(assets), 'assets')


if __name__ == '__main__':
    main()
