# Kids Activities — pilot mini web app

Static pilot app for richer review of `Activités en famille` recommendations.

## Generate the safelisted data export

```bash
node automation/export_web_data.js
```

Optional deterministic date override for tests:

```bash
node automation/export_web_data.js --today=2026-06-15
```

The export is written to `web/data/recommendations-index.json`. It is safelisted: raw artifacts, local file paths, private media paths, OCR evidence blobs and internal run directories are not served directly.

## Launch locally

```bash
cd web
python3 -m http.server 8123 --bind 127.0.0.1
# open http://127.0.0.1:8123/
```

A local HTTP server is required because the app fetches `data/recommendations-index.json`.

## Smoke checks run for V1

```bash
node automation/export_web_data.js
node --check automation/export_web_data.js
node --check web/app.js
python3 - <<'PY'
import json, pathlib
p = pathlib.Path('web/data/recommendations-index.json')
data = json.loads(p.read_text())
assert data['schemaVersion'] == '1.0'
assert data.get('upcoming') and data['upcoming']['activities']
text = p.read_text()
for bad in ['/home/', 'file://', '.openclaw/media']:
    assert bad not in text, bad
print('ok')
PY
```

HTTP asset check:

```bash
cd web
python3 -m http.server 8123 --bind 127.0.0.1
curl -fsS http://127.0.0.1:8123/ >/tmp/kids-web-index.html
curl -fsS http://127.0.0.1:8123/app.js >/tmp/kids-web-app.js
curl -fsS http://127.0.0.1:8123/styles.css >/tmp/kids-web-styles.css
curl -fsS http://127.0.0.1:8123/data/recommendations-index.json | python3 -m json.tool >/tmp/kids-web-data.json
```

## Pilot retro note

What worked well:
- Static app + safelisted JSON is enough for a useful first mini app; no server dependency beyond local static serving.
- Existing reviewed-run artifacts already contain the right product signals: verdict, source, score, caveats, window and Telegram summary lines.
- Keeping manual confirmed events as a separate “programme confirmé” section makes Johan’s manually shared sources visible without leaking private photos.

What was painful:
- Reviewed artifacts are rich but inconsistent; some useful fields live in review markdown, some in scored events, some in queue files.
- The app needs an HTTP server for `fetch`, so `file://` opening is not enough.
- Source quality/freshness exists in several files, so the export script must be conservative rather than passing raw structures through.

What seems reusable:
- Pattern: `automation/export_web_data.js` + `web/data/*.json` + static `web/index.html`/`app.js`/`styles.css`.
- Safelist discipline: copy known public fields only, mask local paths/private media, summarize provenance.
- UX sections: upcoming actionable items, historical reviewed digests, source/freshness panel, empty/error states.
