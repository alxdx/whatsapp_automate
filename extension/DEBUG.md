# WhatsApp Photo Downloader — Debug Guide

## Quick start

1. Open WhatsApp Web and navigate to a chat
2. Open DevTools (`F12`) → Console tab
3. Enable verbose logging:
   ```js
   localStorage.setItem('WA_DL_DEBUG', 'true')
   ```
   To disable:
   ```js
   localStorage.removeItem('WA_DL_DEBUG')
   ```
4. Click the 📸 button and start a download
5. Watch the console — every decision point is logged
6. After the run, click **"📋 Descargar log de diagnóstico"** in the panel to download the full log file

For development builds, set `DEV_MODE = true` at the top of `content.js` to enable verbose logging permanently without needing the console flag.

---

## Symptom → Where to look

| Symptom | Likely cause | How to diagnose |
|---|---|---|
| 📸 button never appears | Content script not running, or `#main` not detected | Check `chrome://extensions` for errors; run `document.getElementById('main')` in console |
| Toolbar icon click does nothing | `background.js` not loaded | Check `chrome://extensions` → service worker errors |
| "No se encontró el chat" | `findScrollContainer()` returned null | Run `document.querySelector('[data-testid="conversation-panel-messages"]')` in console |
| 0 images found after scrolling | Image selectors not matching | Enable `WA_DL_DEBUG`, look for `collectMedia` log lines; check `img[src^="blob:"]` in console |
| Date filter excludes everything | Date parsing failing | Log shows `image date: unknown` — `data-pre-plain-text` format may have changed |
| Viewer doesn't open | Click target not found or viewer selector stale | Log shows `"viewer NOT found"` — update `SEL.viewer` |
| Viewer opens but doesn't advance | ArrowRight not reaching viewer | Log shows `"did not advance"` — try focusing viewer manually: `document.querySelector('[data-testid="app-viewer"]').focus()` |
| Downloads start but files are corrupt | Blob URL was revoked before fetch | Log shows `"fetch failed"` — scroll to the image first so it stays in DOM |

---

## Checking selectors after a WhatsApp update

All selectors are in the `SEL` object at the top of `content.js`. Run these in the DevTools console to verify each one still matches:

```js
// Scroll container
document.querySelector('[data-testid="conversation-panel-messages"]')

// Date separators
document.querySelector('[data-testid="conv-info-daily-date-separator"]')
document.querySelector('[data-testid="msg-date-separator"]')

// Unloaded image download button
document.querySelector('[data-testid*="download"]')
document.querySelector('[aria-label="Descargar"]')

// Photo viewer
document.querySelector('[data-testid="app-viewer"]')
document.querySelector('[data-testid="media-viewer"]')
document.querySelector('[data-testid="media-lightbox"]')
```

Any that return `null` are broken. Find the new selector by inspecting the element in DevTools and update the corresponding entry in `SEL`.

---

## Reloading after changes

1. Edit `content.js`
2. Go to `chrome://extensions`
3. Click the **↺ refresh** icon on the extension
4. Reload the WhatsApp Web tab

Changes are live immediately — no rebuild step needed.

---

## Reading the log file

The log file downloaded via the panel button is a plain `.txt` file with this format:

```
[HH:MM:SS.mmm] LEVEL  message
```

Levels: `DEBUG` (verbose only) · `INFO` · `WARN` · `ERROR`

Errors and warnings always appear regardless of `DEV_MODE`. Look for `WARN` and `ERROR` lines first — they point directly to what failed.
