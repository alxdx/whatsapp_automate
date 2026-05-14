// WhatsApp Photo Downloader — Extension Content Script
// Version: 2.1.0

'use strict';

(function () {
  const VERSION  = '2.2.0';
  const PANEL_ID = 'wa-photo-dl-panel';
  const BTN_ID   = 'wa-photo-dl-btn';

  // ── Dev flag ──────────────────────────────────────────────────────────────
  // Set to true in development builds only.
  // Users can also enable at runtime: window.WA_DL_DEBUG = true
  const DEV_MODE = false;

  // ── Selector config ───────────────────────────────────────────────────────
  // All WhatsApp DOM selectors live here. When a WhatsApp update breaks the
  // extension, this is the first place to check and patch.
  const SEL = {
    // Scrollable message pane
    scrollContainer: '[data-testid="conversation-panel-messages"]',
    scrollFallback:  '[tabindex="-1"]',

    // Date separator bubbles between messages (tried in order until one matches).
    // As of 2026-04, WhatsApp removed data-testid from these elements entirely.
    // All 3 selectors below are kept as future-proofing in case they return.
    // Active detection is the text-based fallback in buildSeparators().
    dateSeparators: [
      '[data-testid="conv-info-daily-date-separator"]',
      '[data-testid="msg-date-separator"]',
      '[data-testid="date-separator"]',
    ],

    // Individual message bubble — carries data-id
    messageBubble: '[data-id]',

    // Overlay button on images not yet downloaded to this device
    unloadedDownload: [
      '[data-testid="media-state-download"]',
      '[data-testid*="download"]',
      '[aria-label="download"]',
      '[aria-label="Descargar"]',
    ],

    // Photo viewer container (tried in order)
    viewer: [
      '[data-testid="media-viewer-modal"]',
      '[data-testid="app-viewer"]',
      '[data-testid="media-viewer"]',
      '[data-testid="media-lightbox"]',
      '[data-testid="photo-viewer"]',
    ],
    viewerFallback: ['[role="dialog"]', '[aria-modal="true"]'],

    // Download button inside the viewer toolbar
    viewerDownloadAriaLabels: ['descargar', 'download'],
    viewerDownloadTestIds:    ['download'],

    // WhatsApp's attachment/media button in the compose footer (tried in order)
    attachBtn: [
      '[data-testid="attach-btn"]',
      '[data-testid="clip"]',
      '[aria-label="Adjuntar"]',
      '[aria-label="Attach"]',
    ],

    // First action button in the chat header (confirmed via diagnostic).
    // Header right-side flex row: Video call → Catalog → Search → Menu
    // Insert before the first one to appear at the start of that row.
    headerBtn: [
      '[data-testid="call-dropdown-button"]',
      '[aria-label="Search"]',
      '[aria-label="Menu"]',
    ],

    // Image containers (confirmed via diagnostic: data-testid="media-url-provider" x4)
    imageThumb:        '[data-testid="image-thumb"]',
    mediaUrlProvider:  '[data-testid="media-url-provider"]',
    stickerContainer:  '[data-testid="sticker-container"]',

    // Clickable wrapper on loaded images (confirmed via console: data-testid="image-thumb", role="button")
    imageClickTarget:  '[data-testid="image-thumb"]',
  };

  // ── Logger ────────────────────────────────────────────────────────────────
  // In production (DEV_MODE = false), only WARN/ERROR reach the console.
  // All levels are always written to the in-memory log for the downloadable file.
  // Enable full console output at runtime: window.WA_DL_DEBUG = true

  function isVerbose() { return DEV_MODE || localStorage.getItem('WA_DL_DEBUG') === 'true'; }

  const log = (() => {
    const entries = [];

    function write(level, args) {
      const ts  = new Date().toISOString().slice(11, 23); // HH:MM:SS.mmm
      const msg = args.map(a =>
        a instanceof Error        ? `${a.message}` :
        typeof a === 'object'     ? JSON.stringify(a) :
        String(a)
      ).join(' ');
      entries.push(`[${ts}] ${level.padEnd(5)} ${msg}`);

      if (level === 'ERROR') { console.error('[WA-DL]', ...args); return; }
      if (level === 'WARN')  { console.warn ('[WA-DL]', ...args); return; }
      if (isVerbose())        { console.log  ('[WA-DL]', ...args); }
    }

    return {
      info:  (...a) => write('INFO',  a),
      warn:  (...a) => write('WARN',  a),
      error: (...a) => write('ERROR', a),
      debug: (...a) => { if (isVerbose()) write('DEBUG', a); },
      reset:   ()   => { entries.length = 0; },
      getText: ()   => entries.join('\n'),
      print:   ()   => { console.log('[WA-DL] === LOG DUMP ===\n' + entries.join('\n')); },

      download() {
        const header = [
          `WhatsApp Photo Downloader v${VERSION} — Debug Log`,
          `Date    : ${new Date().toISOString()}`,
          `Page URL: ${location.href}`,
          `DEV_MODE: ${DEV_MODE} | WA_DL_DEBUG: ${localStorage.getItem('WA_DL_DEBUG') === 'true'}`,
          '─'.repeat(64),
          '',
        ].join('\n');

        const blob = new Blob([header + entries.join('\n')], { type: 'text/plain' });
        const url  = URL.createObjectURL(blob);
        const ts   = new Date().toISOString().slice(0, 19).replace(/[T:]/g, '-');
        const a    = Object.assign(document.createElement('a'), {
          href: url, download: `wa-dl-log-${ts}.txt`,
        });
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
      },
    };
  })();

  // ── Utilities ─────────────────────────────────────────────────────────────

  const sleep = ms => new Promise(r => setTimeout(r, ms));

  function setStatus(html, color = '#444') {
    const el = document.getElementById('wa-dl-status');
    if (!el) return;
    el.style.color = color;
    el.innerHTML   = html;
  }

  function showLogButton() {
    if (!isVerbose()) return;
    const existing = document.getElementById('wa-dl-log-btn');
    if (existing) return;
    const panel = document.getElementById(PANEL_ID);
    if (!panel) return;

    const btn = document.createElement('button');
    btn.id = 'wa-dl-log-btn';
    Object.assign(btn.style, {
      width: '100%', marginTop: '8px', padding: '8px',
      background: '#f0f0f0', border: '1px solid #ddd',
      borderRadius: '8px', fontSize: '12px', cursor: 'pointer', color: '#555',
    });
    btn.textContent = '📋 Descargar log de diagnóstico';
    btn.onclick     = () => log.download();
    panel.querySelector('#wa-dl-close').parentElement.before(btn);
  }

  // ── Bug reporter ──────────────────────────────────────────────────────────

  function collectDiagnosticSnapshot() {
    const testSel = (sel) => ({ selector: sel, matches: document.querySelectorAll(sel).length });
    return {
      version:   VERSION,
      timestamp: new Date().toISOString(),
      url:       location.href,
      userAgent: navigator.userAgent,
      viewport:  { w: window.innerWidth, h: window.innerHeight },
      selectors: {
        scrollContainer:  SEL.scrollContainer,
        scrollResult:     testSel(SEL.scrollContainer),
        messageBubble:    testSel(SEL.messageBubble),
        viewer:           SEL.viewer.map(testSel),
        imageThumb:       testSel(SEL.imageThumb),
        mediaUrlProvider: testSel(SEL.mediaUrlProvider),
        unloadedDownload: SEL.unloadedDownload.map(testSel),
        imageClickTarget: testSel(SEL.imageClickTarget),
      },
    };
  }

  async function uploadBugReport(statusEl) {
    statusEl.textContent = '⏳ Subiendo reporte…';
    let logText, diagnostic;
    try {
      logText    = log.getText() || '(sin log — ejecuta una descarga primero)';
      diagnostic = collectDiagnosticSnapshot();
    } catch (e) {
      logText = '(error al recopilar datos: ' + e.message + ')';
      diagnostic = {};
    }

    const header = [
      `WhatsApp Photo Downloader v${VERSION} — Bug Report`,
      `Date: ${new Date().toISOString()}`,
      `UA: ${navigator.userAgent}`,
      '─'.repeat(60), '',
    ].join('\n');

    // Route through background worker to avoid CORS restrictions on content scripts
    try {
      const combined = [
        header + logText,
        '─'.repeat(60),
        'DIAGNOSTIC SNAPSHOT',
        '─'.repeat(60),
        JSON.stringify(diagnostic, null, 2),
      ].join('\n');

      const result = await new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({
          type: 'FETCH_PROXY',
          url:  'https://paste.rs',
          options: { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: combined },
        }, r => {
          if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
          else resolve(r);
        });
      });

      if (!result.success || !result.ok) throw new Error(`paste.rs ${result.status ?? result.error}`);
      const url = result.body.trim();

      statusEl.innerHTML =
        `✅ Reporte subido. Copia este enlace y envíalo al desarrollador:<br>` +
        `<a href="${url}" target="_blank" style="font-size:11px;word-break:break-all;">${url}</a>`;
      log.info('bug report uploaded:', url);
    } catch (e) {
      statusEl.textContent = '❌ Error al subir: ' + e.message;
      log.error('uploadBugReport failed:', e.message);
    }
  }

  function showReportButton() {
    if (document.getElementById('wa-dl-report-btn')) return;
    const panel = document.getElementById(PANEL_ID);
    if (!panel) return;

    const wrapper = document.createElement('div');
    wrapper.id = 'wa-dl-report-btn';
    Object.assign(wrapper.style, { marginTop: '8px' });

    const btn = document.createElement('button');
    Object.assign(btn.style, {
      width: '100%', padding: '8px',
      background: '#fff3cd', border: '1px solid #f0c040',
      borderRadius: '8px', fontSize: '12px', cursor: 'pointer', color: '#555',
    });
    btn.textContent = '🐛 Reportar error al desarrollador';

    const statusEl = document.createElement('div');
    Object.assign(statusEl.style, {
      marginTop: '6px', fontSize: '11px', color: '#555', lineHeight: '1.5',
    });

    btn.onclick = () => { btn.disabled = true; uploadBugReport(statusEl).finally(() => { btn.disabled = false; }); };
    wrapper.appendChild(btn);
    wrapper.appendChild(statusEl);
    panel.querySelector('#wa-dl-close').parentElement.before(wrapper);
  }

  // ── Date parsing ──────────────────────────────────────────────────────────

  function parsePlainTextDate(ppt) {
    if (!ppt) return null;
    const m = ppt.match(/\[[^\]]*[,،]\s*(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2,4})/);
    if (!m) return null;
    const year = m[3].length === 2 ? 2000 + +m[3] : +m[3];
    let day, month;
    if      (+m[1] > 12) { day = +m[1]; month = +m[2]; }
    else if (+m[2] > 12) { day = +m[2]; month = +m[1]; }
    else                  { day = +m[1]; month = +m[2]; }
    const d = new Date(year, month - 1, day);
    d.setHours(0, 0, 0, 0);
    return isNaN(d.getTime()) ? null : d;
  }

  // Day-of-week index (0=Sun … 6=Sat) for labels WhatsApp shows within the last ~7 days
  const DAY_NAMES = {
    'domingo': 0, 'sunday': 0,
    'lunes': 1, 'monday': 1,
    'martes': 2, 'tuesday': 2,
    'miércoles': 3, 'miercoles': 3, 'wednesday': 3,
    'jueves': 4, 'thursday': 4,
    'viernes': 5, 'friday': 5,
    'sábado': 6, 'sabado': 6, 'saturday': 6,
  };

  function parseSeparatorText(text) {
    const t = text.trim();
    const today = new Date(); today.setHours(0, 0, 0, 0);

    if (/^(hoy|today)$/i.test(t)) return today;
    if (/^(ayer|yesterday)$/i.test(t)) {
      const d = new Date(today); d.setDate(d.getDate() - 1); return d;
    }

    // Day-of-week label → calculate most recent occurrence of that day
    const dayIdx = DAY_NAMES[t.toLowerCase()];
    if (dayIdx !== undefined) {
      const currentDay = today.getDay();
      let daysBack = (currentDay - dayIdx + 7) % 7;
      if (daysBack === 0) daysBack = 7; // same weekday = last week (today is "Hoy", not a day name)
      const d = new Date(today);
      d.setDate(d.getDate() - daysBack);
      return d;
    }

    // M/DD/YYYY or MM/DD/YYYY — WhatsApp Web confirmed format (e.g. "1/14/2026")
    const mdy = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (mdy) {
      const d = new Date(+mdy[3], +mdy[1] - 1, +mdy[2]);
      d.setHours(0, 0, 0, 0);
      if (!isNaN(d.getTime())) return d;
    }
    // DD/MM/YYYY or DD.MM.YYYY fallback
    const dmy = t.match(/^(\d{1,2})[\/\.](\d{1,2})[\/\.](\d{4})$/);
    if (dmy) {
      const d = new Date(+dmy[3], +dmy[2] - 1, +dmy[1]);
      d.setHours(0, 0, 0, 0);
      if (!isNaN(d.getTime())) return d;
    }
    return null;
  }

  // ── DOM helpers ───────────────────────────────────────────────────────────

  function findScrollContainer() {
    const main = document.getElementById('main');
    if (!main) { log.warn('findScrollContainer: #main not found'); return null; }

    const byTestId = main.querySelector(SEL.scrollContainer);
    if (byTestId) { log.debug('scroll container: by testid'); return byTestId; }

    let best = null, bestExtra = 0;
    for (const el of main.querySelectorAll('div')) {
      const cs    = getComputedStyle(el);
      const extra = el.scrollHeight - el.clientHeight;
      if ((cs.overflowY === 'scroll' || cs.overflowY === 'auto') && extra > bestExtra) {
        bestExtra = extra; best = el;
      }
    }
    if (best) { log.debug('scroll container: by overflow heuristic'); return best; }

    const fallback = main.querySelector(SEL.scrollFallback);
    log.debug('scroll container:', fallback ? 'by fallback selector' : 'NOT FOUND');
    return fallback;
  }

  function buildSeparators(chatPane) {
    const separators = [];
    for (const sel of SEL.dateSeparators) {
      for (const el of chatPane.querySelectorAll(sel)) {
        const d = parseSeparatorText(el.textContent);
        if (d) separators.push({ el, date: d });
      }
      if (separators.length) {
        log.debug(`separators: ${separators.length} found via "${sel}"`);
        break;
      }
    }
    if (!separators.length) {
      // Last resort: short leaf text that looks like a date
      for (const el of chatPane.querySelectorAll('div, span')) {
        if (el.children.length > 2) continue;
        const t = el.textContent.trim();
        if (t && t.length < 32) {
          const d = parseSeparatorText(t);
          if (d) separators.push({ el, date: d });
        }
      }
      log.debug(`separators: fallback scan found ${separators.length}`);
    }
    return separators;
  }

  function getElementDate(el, separators) {
    // 1. data-pre-plain-text on any ancestor (walks up the full tree)
    let node = el;
    while (node && node !== document.body) {
      if (node.hasAttribute('data-pre-plain-text')) {
        const d = parsePlainTextDate(node.getAttribute('data-pre-plain-text'));
        if (d) return d;
      }
      node = node.parentElement;
    }

    // 2. data-pre-plain-text anywhere inside the message bubble
    const bubble = el.closest('[data-id]');
    if (bubble) {
      const pptEl = bubble.querySelector('[data-pre-plain-text]');
      if (pptEl) {
        const d = parsePlainTextDate(pptEl.getAttribute('data-pre-plain-text'));
        if (d) return d;
      }
      // 3. <time datetime="…"> inside the bubble (msg-meta area)
      const timeEl = bubble.querySelector('time[datetime]');
      if (timeEl) {
        const d = new Date(timeEl.getAttribute('datetime'));
        if (!isNaN(d.getTime())) { d.setHours(0, 0, 0, 0); return d; }
      }
    }

    // 4. Nearest preceding date separator
    for (let i = separators.length - 1; i >= 0; i--) {
      const { el: sep, date } = separators[i];
      if (sep.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING) return date;
    }
    return null;
  }

  // ── Media collection ──────────────────────────────────────────────────────

  function collectMedia(chatPane, seenSrcs, seenBubbles) {
    const found      = [];
    const separators = buildSeparators(chatPane);
    const unloadedSel = SEL.unloadedDownload.join(', ');

    for (const bubble of chatPane.querySelectorAll(SEL.messageBubble)) {
      const bubbleId = bubble.getAttribute('data-id');

      // Skip sticker messages — they open a non-navigable viewer
      if (bubble.querySelector(SEL.stickerContainer)) continue;

      // Albums: +N overlay → handle exclusively via viewer.
      // Must be checked BEFORE the video skip below — albums can contain videos
      // and must still be collected (the viewer handles mixed photo/video albums).
      const albumOverlay = [...bubble.querySelectorAll('*')]
        .find(el => /^\+\d+$/.test(el.textContent?.trim()) && !el.querySelector('*'));
      if (albumOverlay && !seenBubbles.has(bubbleId)) {
        seenBubbles.add(bubbleId);
        const trigger = bubble.querySelector('img[src^="blob:"]') || albumOverlay;
        found.push({ type: 'album', trigger, date: getElementDate(albumOverlay, separators), bubbleId });
        log.debug('album found:', bubbleId);
        continue;
      }

      // Skip standalone video messages — their thumbnail blob img would become a click
      // target that opens the video viewer, causing navigation to start at the wrong
      // position and miss earlier images. Only applies to non-album bubbles.
      if (bubble.querySelector('video')) continue;

      // Loaded images — direct blob img tags
      for (const img of bubble.querySelectorAll('img[src^="blob:"]')) {
        if (seenSrcs.has(img.src)) continue;
        const w = img.naturalWidth  || img.width;
        const h = img.naturalHeight || img.height;
        if (w < 60 || h < 60) continue;
        seenSrcs.add(img.src);
        found.push({ type: 'loaded', src: img.src, date: getElementDate(img, separators) });
      }

      // Loaded images — inside media-url-provider containers (confirmed via diagnostic)
      for (const provider of bubble.querySelectorAll('[data-testid="media-url-provider"], [data-testid="image-thumb"]')) {
        const img = provider.querySelector('img[src^="blob:"]');
        if (!img || seenSrcs.has(img.src)) continue;
        const w = img.naturalWidth  || img.width;
        const h = img.naturalHeight || img.height;
        if (w < 60 || h < 60) continue;
        seenSrcs.add(img.src);
        found.push({ type: 'loaded', src: img.src, date: getElementDate(img, separators) });
      }

      // CSS background blobs
      for (const el of bubble.querySelectorAll('[style*="blob:"]')) {
        if (el.tagName === 'IMG') continue;
        const m = (el.style.backgroundImage || '').match(/url\(["']?(blob:[^"')]+)["']?\)/);
        if (!m || seenSrcs.has(m[1])) continue;
        const r = el.getBoundingClientRect();
        if (r.width < 60 || r.height < 60) continue;
        seenSrcs.add(m[1]);
        found.push({ type: 'loaded', src: m[1], date: getElementDate(el, separators) });
      }

      // Unloaded images
      if (!seenBubbles.has(bubbleId)) {
        const dlBtn = bubble.querySelector(unloadedSel);
        if (dlBtn) {
          seenBubbles.add(bubbleId);
          found.push({ type: 'unloaded', btn: dlBtn, date: getElementDate(dlBtn, separators), bubble });
          log.debug('unloaded image found:', bubbleId);
        }
      }
    }

    return found;
  }

  // ── Download helpers ──────────────────────────────────────────────────────

  async function downloadBlob(src, filename) {
    try {
      const resp = await fetch(src);
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const blob = await resp.blob();
      const url  = URL.createObjectURL(blob);
      const a    = Object.assign(document.createElement('a'), { href: url, download: filename });
      document.body.appendChild(a);
      a.click();
      await sleep(300);
      a.remove();
      URL.revokeObjectURL(url);
      log.debug('downloaded:', filename);
      return true;
    } catch (e) {
      log.warn('downloadBlob failed:', src.slice(0, 60), e.message);
      return false;
    }
  }

  async function loadUnloadedImage(btn) {
    const bubble = btn.closest('[data-id]');
    const before = new Set([...(bubble?.querySelectorAll('img[src^="blob:"]') || [])].map(i => i.src));
    btn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    await sleep(300);
    btn.click();
    for (let t = 0; t < 20; t++) {
      await sleep(500);
      const newImg = [...(bubble?.querySelectorAll('img[src^="blob:"]') || [])]
        .find(i => !before.has(i.src) && (i.naturalWidth || i.width) > 60);
      if (newImg) { log.debug('unloaded image resolved'); return newImg.src; }
    }
    log.warn('loadUnloadedImage: timed out waiting for blob');
    return null;
  }

  // ── Viewer helpers ────────────────────────────────────────────────────────

  function findViewer() {
    for (const sel of SEL.viewer) {
      const el = document.querySelector(sel);
      if (el) { log.debug('viewer found via:', sel); return el; }
    }
    for (const sel of SEL.viewerFallback) {
      for (const el of document.querySelectorAll(sel)) {
        if (el.querySelector('img[src^="blob:"]')) { log.debug('viewer found via fallback:', sel); return el; }
      }
    }
    // Last resort: large fixed overlay with a blob image
    for (const el of document.querySelectorAll('body > div')) {
      const cs = getComputedStyle(el);
      const r  = el.getBoundingClientRect();
      if (
        (cs.position === 'fixed' || cs.position === 'absolute') &&
        +cs.zIndex > 100 &&
        r.width > window.innerWidth * 0.7 &&
        el.querySelector('img[src^="blob:"]')
      ) { log.debug('viewer found via position heuristic'); return el; }
    }
    log.warn('findViewer: viewer NOT found — SEL.viewer selectors may need updating');
    return null;
  }

  function getViewerImage(viewer) {
    return [...viewer.querySelectorAll('img[src^="blob:"]')]
      .filter(i => i.complete && (i.naturalWidth || i.width) > 80)
      .sort((a, b) => (b.naturalWidth || b.width) - (a.naturalWidth || a.width))[0] || null;
  }

  function getViewerVideoSrc(viewer) {
    const vid = viewer.querySelector('video[src^="blob:"]');
    if (vid) return vid.src;
    const src = viewer.querySelector('video > source[src^="blob:"]');
    if (src) return src.src;
    return null;
  }

  function getViewerProgress(viewer) {
    for (const el of viewer.querySelectorAll('span, div')) {
      const m = el.textContent.trim().match(/^(\d+)\s+(?:of|de)\s+(\d+)$/i);
      if (m) return { current: +m[1], total: +m[2] };
    }
    return null;
  }

  function getViewerDate(viewer) {
    for (const el of viewer.querySelectorAll('time, span, div')) {
      if (el.tagName === 'TIME' && el.getAttribute('datetime')) {
        const d = new Date(el.getAttribute('datetime'));
        if (!isNaN(d.getTime())) { d.setHours(0, 0, 0, 0); return d; }
      }
      const text = el.textContent.trim();
      if (!text || text.length > 40 || el.children.length > 1) continue;
      const m = text.match(/(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2,4})/);
      if (m) { const d = parsePlainTextDate(`[0:00, ${m[0]}]`); if (d) return d; }
      const d = new Date(text);
      if (!isNaN(d.getTime()) && d.getFullYear() > 2010) { d.setHours(0, 0, 0, 0); return d; }
    }
    return null;
  }

  function findViewerDownloadBtn(viewer) {
    return [...viewer.querySelectorAll('[aria-label], [data-testid], button')]
      .find(el => {
        const a = (el.getAttribute('aria-label') || '').toLowerCase();
        const t = (el.dataset.testid || '').toLowerCase();
        return SEL.viewerDownloadAriaLabels.some(l => a.includes(l)) ||
               SEL.viewerDownloadTestIds.some(l => t.includes(l));
      });
  }

  // ── Main download flow ─────────────────────────────────────────────────────

  let _cancelled = false;

  function lockPage(lock) {
    const main = document.getElementById('main');
    if (main) main.style.pointerEvents = lock ? 'none' : '';
  }

  async function startDownload() {
    log.reset();
    _cancelled = false;
    log.info(`Starting download — v${VERSION}`);

    const startVal  = document.getElementById('wa-dl-start')?.value;
    const endVal    = document.getElementById('wa-dl-end')?.value;
    const startDate = startVal ? new Date(startVal + 'T00:00:00') : null;
    const endDate   = endVal   ? new Date(endVal   + 'T23:59:59') : null;

    log.info('date range:', startDate?.toDateString() ?? 'none', '→', endDate?.toDateString() ?? 'none');

    if (startDate && endDate && startDate > endDate) {
      setStatus('⚠️ "Desde" debe ser anterior a "Hasta".', '#c00');
      showLogButton();
      return;
    }

    const btn    = document.getElementById('wa-dl-btn');
    const canBtn = document.getElementById('wa-dl-cancel');
    btn.disabled = true; btn.style.opacity = '0.55';
    if (canBtn) { canBtn.style.display = 'block'; }
    lockPage(true);

    function finish() {
      lockPage(false);
      btn.disabled = false; btn.style.opacity = '1';
      const c = document.getElementById('wa-dl-cancel');
      if (c) c.style.display = 'none';
    }

    // ── Viewer-first mode ─────────────────────────────────────────────────────
    // If the user already has the photo viewer open, skip all scrolling and DOM
    // collection. We navigate backwards to find the start date, then download
    // forward as usual.
    const preOpenedViewer = findViewer();
    let viewer            = preOpenedViewer;
    let unknownDateCount  = 0;

    if (!preOpenedViewer) {
      // ── Phase 1: Scroll bottom → top, collecting media at each position ────
      const chatPane = findScrollContainer();
      if (!chatPane) {
        setStatus('⚠️ No se encontró el chat. Asegúrate de tener un chat abierto.', '#c00');
        log.error('findScrollContainer returned null');
        finish(); showLogButton();
        return;
      }

      setStatus('🔄 Cargando mensajes…');
      log.info('phase 1: scrolling to collect media');

      chatPane.scrollTop = chatPane.scrollHeight;
      await sleep(1000);

      const seenSrcs    = new Set();
      const seenBubbles = new Set();
      const all         = [];

      function mergeItems(items) {
        all.push(...items);
      }

      mergeItems(collectMedia(chatPane, seenSrcs, seenBubbles));

      let prevScrollTop   = chatPane.scrollTop;
      let noProgressCount = 0;

      while (noProgressCount < 4) {
        if (_cancelled) { log.info('cancelled by user'); setStatus('⏹ Cancelado.', '#888'); finish(); return; }
        chatPane.scrollTop = Math.max(0, chatPane.scrollTop - chatPane.clientHeight * 0.85);
        await sleep(1500);
        mergeItems(collectMedia(chatPane, seenSrcs, seenBubbles));
        setStatus(`🔄 Cargando… (${all.length} imagen(es) encontrada(s))`);
        log.debug(`scroll position: ${chatPane.scrollTop}, items so far: ${all.length}`);

        if (startDate) {
          const seps = buildSeparators(chatPane);
          // Stop one day before startDate: ensures the start-date separator is
          // already in the DOM before start-date items are collected, preventing
          // misattribution to the preceding (older) separator.
          const stopThreshold = new Date(startDate.getTime() - 24 * 60 * 60 * 1000);
          if (seps.length && seps[0].date && seps[0].date < stopThreshold) {
            log.info('reached start date boundary, stopping scroll');
            break;
          }
        }

        if (chatPane.scrollTop === 0) {
          await sleep(800);
          mergeItems(collectMedia(chatPane, seenSrcs, seenBubbles));
          log.info('reached top of chat');
          break;
        }

        if (chatPane.scrollTop === prevScrollTop) noProgressCount++;
        else { noProgressCount = 0; prevScrollTop = chatPane.scrollTop; }
      }

      log.info(`phase 1 done: ${all.length} total items collected`);

      if (all.length === 0) {
        setStatus('⚠️ No se encontraron imágenes en los mensajes visibles.', '#c00');
        log.warn('no media found — possible causes: no chat open, selectors changed, virtual DOM issue');
        finish(); showLogButton();
        return;
      }

      // ── Phase 2: Filter by date range ───────────────────────────────────────
      const toDownload = all.filter(item => {
        if (!item.date) { unknownDateCount++; return true; }
        if (startDate && item.date < startDate) return false;
        if (endDate   && item.date > endDate)   return false;
        return true;
      });

      log.info(`phase 2: ${toDownload.length} in range, ${all.length - toDownload.length} filtered out, ${unknownDateCount} unknown date`);

      if (toDownload.length === 0) {
        setStatus(`⚠️ Se encontraron ${all.length} imagen(es) pero ninguna está en el rango seleccionado.`, '#c00');
        finish(); showLogButton();
        return;
      }

      // ── Phase 3: Load unloaded images ────────────────────────────────────────
      for (const item of toDownload.filter(i => i.type === 'unloaded')) {
        setStatus('📡 Cargando imagen sin descargar…');
        const newSrc = await loadUnloadedImage(item.btn);
        if (newSrc) { item.type = 'loaded'; item.src = newSrc; }
      }

      // ── Phase 4: Open viewer on earliest in-range image ──────────────────────
      log.info('phase 4: opening viewer');

      const sorted = [...toDownload]
        .sort((a, b) => (!a.date ? 1 : !b.date ? -1 : a.date - b.date));

      function findClickTarget(item) {
        if (item.type === 'album' && document.contains(item.trigger)) return item.trigger;
        if (item.type !== 'loaded') return null;
        const img = document.querySelector(`#main img[src="${CSS.escape(item.src)}"]`);
        if (!img) return null;
        return img.closest(SEL.imageClickTarget) || img;
      }

      let clickTarget = null;
      for (const item of sorted) {
        clickTarget = findClickTarget(item);
        if (clickTarget) break;
      }

      if (!clickTarget) {
        chatPane.scrollTop = chatPane.scrollHeight;
        await sleep(1000);
        for (const item of sorted) {
          clickTarget = findClickTarget(item);
          if (clickTarget) break;
        }
      }

      if (!clickTarget) {
        setStatus('⚠️ No se encontró ninguna imagen en pantalla para abrir el visor.', '#c00');
        log.error('no click target found in DOM — all collected items may have been virtualized away');
        finish(); showLogButton();
        return;
      }

      clickTarget.scrollIntoView({ block: 'center' });
      await sleep(400);
      setStatus('🖼️ Abriendo visor…');

      clickTarget.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
      await sleep(500);
      if (!findViewer()) {
        for (const target of [clickTarget.parentElement, clickTarget.parentElement?.parentElement].filter(Boolean)) {
          target.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
          await sleep(500);
          if (findViewer()) break;
        }
      }

      for (let i = 0; i < 20; i++) { viewer = findViewer(); if (viewer) break; await sleep(400); }

      if (!viewer) {
        setStatus('⚠️ No se pudo abrir el visor de imágenes.', '#c00');
        log.error('viewer did not open — SEL.viewer selectors likely need updating for new WhatsApp version');
        finish(); showLogButton();
        return;
      }
    } // end !preOpenedViewer

    // ── Phase 5: Navigate viewer → download ──────────────────────────────────
    log.info(preOpenedViewer ? 'phase 5: viewer-first mode' : 'phase 5: navigating viewer');

    const sendRight = () => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', keyCode: 39, bubbles: true, cancelable: true }));
      document.dispatchEvent(new KeyboardEvent('keyup',   { key: 'ArrowRight', keyCode: 39, bubbles: true }));
      log.debug('ArrowRight sent');
    };

    const sendLeft = () => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', keyCode: 37, bubbles: true, cancelable: true }));
      document.dispatchEvent(new KeyboardEvent('keyup',   { key: 'ArrowLeft', keyCode: 37, bubbles: true }));
      log.debug('ArrowLeft sent');
    };

    viewer.setAttribute('tabindex', '-1');
    viewer.focus();

    // ── Backward scan (viewer-first + startDate only) ─────────────────────────
    // Navigate left until we find an image before the start date, then step one
    // right to land on the first in-range image. If we hit the beginning of all
    // media without finding a pre-range image, just start downloading from there.
    if (preOpenedViewer && startDate) {
      log.info('viewer-first: scanning backward to find range start');
      setStatus('⏪ Buscando inicio del rango…');

      let noBackCount  = 0;
      let lastBackSrc  = null;

      while (noBackCount < 4 && !_cancelled) {
        let img = null, earlyVid = null;
        for (let w = 0; w < 15; w++) {
          img = getViewerImage(viewer);
          if (img) break;
          earlyVid = getViewerVideoSrc(viewer);
          if (earlyVid) break;
          await sleep(200);
        }

        if (!img) {
          // video/gif — step back past it
          const v = earlyVid || getViewerVideoSrc(viewer);
          if (v && v === lastBackSrc) noBackCount++;
          else { noBackCount = 0; lastBackSrc = v || lastBackSrc; }
          sendLeft();
          await sleep(400);
          continue;
        }

        const imgDate = getViewerDate(viewer);
        log.debug('backward scan:', imgDate?.toDateString() ?? '?');

        if (imgDate && imgDate < startDate) {
          // One step before the range — step forward to the first in-range image
          log.info('backward: found pre-range image at', imgDate.toDateString(), '— stepping to range start');
          sendRight();
          await sleep(600);
          break;
        }

        // Still in range (or no date) — keep going back
        if (img.src === lastBackSrc) {
          noBackCount++;
          log.debug('backward: no advance', noBackCount, '/ 4');
        } else {
          noBackCount = 0;
          lastBackSrc = img.src;
        }
        sendLeft();
        await sleep(400);
      }

      if (noBackCount >= 4) log.info('backward: reached beginning of media, starting from here');
      log.info('backward scan complete, starting forward download');
    }

    // ── Forward download loop ──────────────────────────────────────────────────
    const seenInViewer = new Set();
    let downloaded     = 0;
    let noAdvanceCount = 0;

    while (noAdvanceCount < 4) {
      if (_cancelled) { log.info('cancelled by user in viewer'); break; }
      let img = null;
      let earlyVidSrc = null;
      for (let w = 0; w < 30; w++) {
        img = getViewerImage(viewer);
        if (img) break;
        earlyVidSrc = getViewerVideoSrc(viewer);
        if (earlyVidSrc) break;
        await sleep(200);
      }

      if (!img) {
        const vidSrc = earlyVidSrc || getViewerVideoSrc(viewer);
        if (vidSrc) {
          if (seenInViewer.has(vidSrc)) {
            noAdvanceCount++;
            log.debug('looped back to seen video, noAdvanceCount:', noAdvanceCount);
          } else {
            seenInViewer.add(vidSrc);
            noAdvanceCount = 0;
            log.debug('video in viewer — skipping');
          }
          sendRight();
          await sleep(600);
          continue;
        }
        noAdvanceCount++;
        log.warn(`no image in viewer (attempt ${noAdvanceCount}/4)`);
        continue;
      }

      const currentSrc = img.src;

      if (seenInViewer.has(currentSrc)) {
        noAdvanceCount++;
        log.debug('looped back to seen image, noAdvanceCount:', noAdvanceCount);
        sendRight();
        await sleep(500);
        continue;
      }

      seenInViewer.add(currentSrc);
      noAdvanceCount = 0;

      const progress = getViewerProgress(viewer);
      const imgDate  = getViewerDate(viewer);
      log.debug(`viewer: ${progress?.current ?? '?'}/${progress?.total ?? '?'} | date: ${imgDate?.toDateString() ?? 'unknown'}`);

      if (imgDate && endDate && imgDate > endDate) { log.info('past end date, stopping viewer'); break; }

      const inRange = !imgDate
        || ((!startDate || imgDate >= startDate) && (!endDate || imgDate <= endDate));

      if (inRange) {
        const dateStr  = imgDate ? imgDate.toISOString().slice(0, 10) : 'sin-fecha';
        const filename = `whatsapp_${dateStr}_${String(downloaded + 1).padStart(3, '0')}.jpg`;
        setStatus(`📥 Descargando imagen ${downloaded + 1}…`);

        let ok = await downloadBlob(currentSrc, filename);
        if (!ok) {
          const dlBtn = findViewerDownloadBtn(viewer);
          if (dlBtn) {
            dlBtn.click();
            await sleep(500);
            ok = true;
            log.debug('used WA download button as fallback');
          } else {
            log.error('could not download image — blob fetch failed and no WA download btn found');
          }
        }
        if (ok) downloaded++;
      } else {
        log.debug('skipping image outside date range:', imgDate?.toDateString());
      }

      if (progress && progress.current >= progress.total) { log.info('reached last image in viewer'); break; }

      viewer.focus();
      sendRight();

      // Non-album out-of-range: don't wait 6 s — give it 1.6 s, bail if stuck
      const waitSteps = (!inRange && !progress) ? 8 : 30;
      let advanced = false;
      for (let w = 0; w < waitSteps; w++) {
        await sleep(200);
        if (getViewerImage(viewer)?.src !== currentSrc) { advanced = true; break; }
        if (w === 14) { log.debug('retrying ArrowRight'); sendRight(); }
      }
      if (!advanced) {
        noAdvanceCount++;
        log.warn(`viewer did not advance (${noAdvanceCount}/4)`);
        if (!inRange && !progress) { log.info('non-navigable out-of-range viewer — stopping'); break; }
      }
    }

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', keyCode: 27, bubbles: true }));
    await sleep(500);

    log.info(`done: ${downloaded} downloaded, ${seenInViewer.size} seen in viewer`);

    let summary = `✅ ¡Listo! ${downloaded} foto(s) guardada(s) en Descargas.`;
    if (unknownDateCount > 0) summary += `<br>ℹ️ ${unknownDateCount} imagen(es) sin fecha incluida(s).`;
    setStatus(summary, '#0a7a3e');

    finish();
    btn.textContent = '▶ Descargar de Nuevo';
    showLogButton();
    showReportButton();
  }

  // ── UI ────────────────────────────────────────────────────────────────────

  function showPanel() {
    const existing = document.getElementById(PANEL_ID);
    if (existing) { existing.remove(); return; }

    const panel = document.createElement('div');
    panel.id = PANEL_ID;
    Object.assign(panel.style, {
      position: 'fixed', top: '50%', left: '50%',
      transform: 'translate(-50%, -50%)',
      zIndex: '2147483647', background: '#fff',
      borderRadius: '16px', boxShadow: '0 8px 40px rgba(0,0,0,0.3)',
      padding: '28px 32px', width: '360px',
      fontFamily: 'Segoe UI, Arial, sans-serif',
      fontSize: '14px', color: '#111', userSelect: 'none',
    });

    const chipStyle = `display:inline-block;padding:3px 10px;margin:0 4px 4px 0;
      border:1px solid #ccc;border-radius:12px;font-size:11px;cursor:pointer;
      background:#f5f5f5;color:#444;white-space:nowrap;`;

    panel.innerHTML = `
      <div style="font-size:18px;font-weight:700;margin-bottom:6px;">
        📸 Descargador de Fotos
        <span style="font-size:11px;font-weight:400;color:#aaa;">v${VERSION}</span>
      </div>
      <div style="color:#555;margin-bottom:14px;line-height:1.5;font-size:13px;">
        Abre el chat y elige un rango de fechas.<br>
        Deja en blanco para descargar todas las fotos.
      </div>
      <div style="margin-bottom:10px;">
        <span style="font-size:11px;color:#888;display:block;margin-bottom:4px;">Accesos rápidos:</span>
        <span class="wa-dl-chip" data-preset="today"    style="${chipStyle}">Hoy</span>
        <span class="wa-dl-chip" data-preset="yesterday" style="${chipStyle}">Ayer</span>
        <span class="wa-dl-chip" data-preset="monday"   style="${chipStyle}">Desde el lunes</span>
        <span class="wa-dl-chip" data-preset="friday"   style="${chipStyle}">Desde el viernes</span>
        <span class="wa-dl-chip" data-preset="7days"    style="${chipStyle}">Últimos 7 días</span>
      </div>
      <label style="display:block;margin-bottom:4px;font-weight:600;">Desde</label>
      <input id="wa-dl-start" type="date"
        style="width:100%;padding:8px 10px;border:1px solid #ccc;border-radius:8px;font-size:14px;box-sizing:border-box;margin-bottom:12px;">
      <label style="display:block;margin-bottom:4px;font-weight:600;">Hasta</label>
      <input id="wa-dl-end" type="date"
        style="width:100%;padding:8px 10px;border:1px solid #ccc;border-radius:8px;font-size:14px;box-sizing:border-box;margin-bottom:20px;">
      <button id="wa-dl-btn"
        style="width:100%;padding:12px;background:#25d366;color:#fff;border:none;border-radius:10px;font-size:15px;font-weight:700;cursor:pointer;transition:opacity .2s;">
        ▶ Iniciar Descarga
      </button>
      <button id="wa-dl-cancel"
        style="display:none;width:100%;margin-top:8px;padding:10px;background:#fff;color:#c00;border:1.5px solid #c00;border-radius:10px;font-size:14px;font-weight:600;cursor:pointer;">
        ⏹ Cancelar
      </button>
      <div id="wa-dl-status"
        style="margin-top:14px;color:#444;min-height:38px;line-height:1.6;text-align:center;font-size:13px;"></div>
      <div style="margin-top:10px;text-align:right;">
        <span id="wa-dl-close" style="color:#bbb;cursor:pointer;font-size:12px;">✕ Cerrar</span>
      </div>
    `;

    document.body.appendChild(panel);
    document.getElementById('wa-dl-close').onclick  = () => { _cancelled = true; lockPage(false); panel.remove(); };
    document.getElementById('wa-dl-btn').onclick    = startDownload;
    document.getElementById('wa-dl-cancel').onclick = () => { _cancelled = true; };

    // ── Date preset chips ──────────────────────────────────────────────────
    function toInput(d) { return d.toISOString().slice(0, 10); }

    function presetDate(name) {
      const now = new Date(); now.setHours(0, 0, 0, 0);
      const day = now.getDay(); // 0=Sun 1=Mon … 6=Sat
      switch (name) {
        case 'today':     return [toInput(now), ''];
        case 'yesterday': { const d = new Date(now); d.setDate(d.getDate() - 1); return [toInput(d), toInput(d)]; }
        case 'monday': {
          const d = new Date(now);
          d.setDate(d.getDate() - (day === 0 ? 6 : day - 1)); // back to most recent Mon
          return [toInput(d), ''];
        }
        case 'friday': {
          const d = new Date(now);
          // Most recent Friday (including today if today is Friday)
          const diff = (day + 2) % 7; // days since last Friday
          d.setDate(d.getDate() - diff);
          return [toInput(d), ''];
        }
        case '7days': { const d = new Date(now); d.setDate(d.getDate() - 6); return [toInput(d), '']; }
        default: return ['', ''];
      }
    }

    panel.querySelectorAll('.wa-dl-chip').forEach(chip => {
      chip.onmouseenter = () => { chip.style.background = '#e0f5ea'; chip.style.borderColor = '#25d366'; };
      chip.onmouseleave = () => { chip.style.background = '#f5f5f5'; chip.style.borderColor = '#ccc'; };
      chip.onclick = () => {
        const [start, end] = presetDate(chip.dataset.preset);
        document.getElementById('wa-dl-start').value = start;
        document.getElementById('wa-dl-end').value   = end;
        // Highlight active chip
        panel.querySelectorAll('.wa-dl-chip').forEach(c => {
          c.style.background   = '#f5f5f5';
          c.style.borderColor  = '#ccc';
          c.style.fontWeight   = 'normal';
        });
        chip.style.background  = '#e0f5ea';
        chip.style.borderColor = '#25d366';
        chip.style.fontWeight  = '600';
      };
    });
  }

  function injectButton() {
    if (document.getElementById(BTN_ID)) return;

    const btn = document.createElement('div');
    btn.id    = BTN_ID;
    btn.title = 'Descargar fotos de WhatsApp';
    btn.setAttribute('role', 'button');
    btn.onclick = showPanel;

    Object.assign(btn.style, {
      position:       'fixed',
      left:           '0',
      top:            '50%',
      transform:      'translateY(-50%)',
      width:          '36px',
      height:         '36px',
      borderRadius:   '0 8px 8px 0',
      background:     '#25d366',
      cursor:         'pointer',
      zIndex:         '2147483646',
      display:        'flex',
      alignItems:     'center',
      justifyContent: 'center',
      boxShadow:      '2px 0 8px rgba(0,0,0,0.25)',
      fontSize:       '18px',
      userSelect:     'none',
      transition:     'width .15s',
    });
    btn.onmouseenter = () => { btn.style.width = '44px'; };
    btn.onmouseleave = () => { btn.style.width = '36px'; };
    btn.textContent  = '📸';
    document.body.appendChild(btn);
    log.info('button injected: left-center fixed');
  }

  // ── Init ──────────────────────────────────────────────────────────────────

  // Toolbar icon click → show panel directly
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type === 'SHOW_PANEL') showPanel();
  });

  const observer = new MutationObserver(() => {
    if (document.getElementById('main')) injectButton();
  });
  observer.observe(document.body, { childList: true, subtree: true });

  if (document.getElementById('main')) injectButton();

})();
