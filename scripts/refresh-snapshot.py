"""Refresh packages/sync/data/hosting-snapshot.json.gz from nichedb.dev (slow: 30-90 s a page)."""
import gzip, json, os, time, urllib.request
out = []
before = None
base = 'https://nichedb.dev/api/v1/items?collection=hosting&limit=200&sort=id&order=desc'
while True:
    url = base + (f'&before={before}' if before else '')
    t = time.time()
    with urllib.request.urlopen(url, timeout=300) as r:
        items = json.load(r)['items']
    print(len(items), 'in', round(time.time() - t, 1), 's', flush=True)
    if not items:
        break
    out.extend(items)
    before = min(i['id'] for i in items)
    if len(items) < 200:
        break
path = os.path.join(os.path.dirname(__file__), '..', 'packages', 'sync', 'data', 'hosting-snapshot.json.gz')
with gzip.open(path, 'wt', compresslevel=9) as f:
    json.dump(out, f)
print('TOTAL', len(out), '->', path)
