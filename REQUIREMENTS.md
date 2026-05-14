# WhatsApp Web Image Downloader — Requirements

_Last updated: 2026-04-21 | Current version: v1.3.1_

---

## Platform
- Runs as a **browser console script** (paste into DevTools → Console) on https://web.whatsapp.com
- Uses the existing logged-in WhatsApp Web session — no installation or login required

---

## UI
- Floating panel overlaid on the page with a friendly, non-technical design
- Fields: **From date** and **To date** (both optional)
- **Start button** to trigger the download
- **Status area** showing live progress messages
- **Close button**
- Version number shown in the panel title (e.g. `v1.3.1`)
- All text in **Spanish**

---

## Date Filtering
- User selects a date range; only images from that range are downloaded
- If a date is left blank: no lower/upper bound on that side
- Images whose date cannot be determined are **included** conservatively
- Date is read from each message's `data-pre-plain-text` attribute (exact per-message timestamp)
- Fallback: nearest preceding date separator bubble ("Hoy", "Ayer", full dates — Spanish and English)
- Fallback: nearest `<time datetime="">` element inside the same message bubble

---

## Chat Scrolling
- WhatsApp Web uses **virtual scrolling** — messages outside view are removed from the DOM
- Script scrolls **page by page from bottom to top**, collecting images at each scroll position
- Stops scrolling early once it has passed the start date
- Deduplicates collected images across scroll positions

---

## Image Detection (3 types)
1. **Loaded images** — `<img src="blob:…">` with natural size > 60×60px
2. **CSS background images** — elements with `background-image: url(blob:…)` and rendered size > 60×60px
3. **Unloaded images** — messages where the image hasn't been downloaded yet; detected via `aria-label="download"` / `aria-label="descargar"` or `data-testid` containing "download"

---

## Album Handling (10+ images grouped by WhatsApp)
- WhatsApp groups multiple images into an album showing only 3–4 thumbnails with a `+N` overlay
- The hidden images are only accessible via WhatsApp's full-screen photo viewer
- Album thumbnails are **skipped** during normal collection — they are downloaded exclusively via the viewer

---

## Viewer-Based Download (main download flow)
- After collecting, opens WhatsApp's photo viewer by clicking the **earliest in-range image** found in the DOM
- If no in-range image is visible, scrolls to bottom and retries
- Navigates with **ArrowRight keyboard events** on `document` (button clicks avoided — they accidentally trigger "Reenviar mensaje")
- For each image shown in the viewer:
  - Reads position from `"X of N"` / `"X de N"` counter span
  - Reads date from viewer header (best effort)
  - Downloads if in date range
  - Skips if past end date
- **Stops** when: past the end date, counter reaches total, or same image seen twice (loop detected)
- Closes viewer with `Escape`

---

## Download Mechanism
- `fetch` the blob URL → create object URL → anchor `.click()` with `download` attribute
- Files named `whatsapp_YYYY-MM-DD_001.jpg`
- Falls back to clicking WhatsApp's own in-viewer download button if `fetch` fails

---

## Debugging
- `window.WA_DL_DEBUG = true` before running enables verbose `console.log` output
- All non-error logs go through a `dbg()` helper that respects the flag
- Errors always shown via `console.warn`

---

## Versioning
- Version in the file header comment and in the UI panel title
- Format: `MAJOR.MINOR.PATCH` — updated on every change
