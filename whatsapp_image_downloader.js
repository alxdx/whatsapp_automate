// ============================================================
//  WhatsApp Web – Descargador de Imágenes
//  Versión: 1.3.2
//
//  CÓMO USARLO:
//  1. Abre https://web.whatsapp.com e inicia sesión
//  2. Haz clic en el chat del que quieres descargar imágenes
//  3. Presiona F12 (o clic derecho → Inspeccionar) para abrir DevTools
//  4. Haz clic en la pestaña "Console" (Consola)
//  5. Pega este script completo y presiona Enter
//  6. Aparecerá un panel verde — ingresa las fechas y haz clic en Iniciar
// ============================================================

(function () {
  // ── Debug mode ───────────────────────────────────────────
  // To enable: paste  window.WA_DL_DEBUG = true  in the console before running the script.
  // To disable: paste  window.WA_DL_DEBUG = false
  const dbg = (...args) => { if (window.WA_DL_DEBUG) console.log('[WA-DL]', ...args); };

  if (document.getElementById('wa-img-dl-panel')) {
    document.getElementById('wa-img-dl-panel').remove();
  }

  // ── UI ───────────────────────────────────────────────────
  const panel = document.createElement('div');
  panel.id = 'wa-img-dl-panel';
  Object.assign(panel.style, {
    position:     'fixed',
    top:          '50%',
    left:         '50%',
    transform:    'translate(-50%, -50%)',
    zIndex:       '2147483647',
    background:   '#fff',
    borderRadius: '16px',
    boxShadow:    '0 8px 40px rgba(0,0,0,0.3)',
    padding:      '28px 32px',
    width:        '360px',
    fontFamily:   'Segoe UI, Arial, sans-serif',
    fontSize:     '14px',
    color:        '#111',
    userSelect:   'none',
  });

  panel.innerHTML = `
    <div style="font-size:18px;font-weight:700;margin-bottom:6px;">📸 Descargador de Imágenes de WhatsApp <span style="font-size:11px;font-weight:400;color:#aaa;">v1.3.2</span></div>
    <div style="color:#555;margin-bottom:18px;line-height:1.5;font-size:13px;">
      Abre el chat que quieras y elige un rango de fechas.<br>
      Deja una fecha en blanco para incluir todos los mensajes.
    </div>

    <label style="display:block;margin-bottom:4px;font-weight:600;">Desde</label>
    <input id="wa-start" type="date"
      style="width:100%;padding:8px 10px;border:1px solid #ccc;border-radius:8px;font-size:14px;box-sizing:border-box;margin-bottom:12px;">

    <label style="display:block;margin-bottom:4px;font-weight:600;">Hasta</label>
    <input id="wa-end" type="date"
      style="width:100%;padding:8px 10px;border:1px solid #ccc;border-radius:8px;font-size:14px;box-sizing:border-box;margin-bottom:20px;">

    <button id="wa-start-btn"
      style="width:100%;padding:12px;background:#25d366;color:#fff;border:none;border-radius:10px;font-size:15px;font-weight:700;cursor:pointer;transition:opacity .2s;">
      ▶ Iniciar Descarga
    </button>

    <div id="wa-status"
      style="margin-top:14px;color:#444;min-height:38px;line-height:1.6;text-align:center;font-size:13px;"></div>

    <div style="margin-top:10px;text-align:right;">
      <span id="wa-close" style="color:#bbb;cursor:pointer;font-size:12px;">✕ Cerrar</span>
    </div>
  `;

  document.body.appendChild(panel);
  document.getElementById('wa-close').onclick = () => panel.remove();

  // ── Utilities ────────────────────────────────────────────
  const sleep = ms => new Promise(r => setTimeout(r, ms));

  const setStatus = (html, color = '#444') => {
    const el = document.getElementById('wa-status');
    if (!el) return;
    el.style.color = color;
    el.innerHTML = html;
    console.log('[WA-DL]', html.replace(/<[^>]+>/g, ''));
  };

  // Parse "[3:42 PM, 4/21/2026] Name:" or "[15:42, 21/4/2026] Name:" or "[3:42 p. m., 21/4/2026]"
  function parsePlainTextDate(ppt) {
    if (!ppt) return null;
    // Skip time portion entirely — just grab the date part after the comma inside brackets
    // Matches: [<anything>, D/M/YY] or [<anything>, D.M.YY] etc.
    const m = ppt.match(/\[[^\]]*[,،]\s*(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2,4})/);
    if (!m) return null;
    const year = m[3].length === 2 ? 2000 + +m[3] : +m[3];
    let day, month;
    if (+m[1] > 12)       { day = +m[1]; month = +m[2]; }
    else if (+m[2] > 12)  { day = +m[2]; month = +m[1]; }
    else                  { day = +m[1]; month = +m[2]; }  // default D/M
    const d = new Date(year, month - 1, day);
    d.setHours(0, 0, 0, 0);
    return isNaN(d) ? null : d;
  }

  // Parse WhatsApp date separator bubbles: "Hoy"/"Today", "Ayer"/"Yesterday", full dates
  function parseSeparatorText(text) {
    const t = text.trim();
    const today = new Date(); today.setHours(0, 0, 0, 0);
    if (/^(today|hoy)$/i.test(t)) return today;
    if (/^(yesterday|ayer)$/i.test(t)) {
      const d = new Date(today); d.setDate(d.getDate() - 1); return d;
    }
    const d = new Date(t);
    if (!isNaN(d)) { d.setHours(0, 0, 0, 0); return d; }
    return null;
  }

  // Find the scrollable chat message pane
  function findScrollContainer() {
    const main = document.getElementById('main');
    if (!main) return null;

    // Strategy 1: data-testid
    const byTestId = main.querySelector('[data-testid="conversation-panel-messages"]');
    if (byTestId) return byTestId;

    // Strategy 2: computed overflow — pick the div with the tallest scrollable area
    let best = null, bestExtra = 0;
    for (const el of main.querySelectorAll('div')) {
      const cs = getComputedStyle(el);
      if (cs.overflowY === 'scroll' || cs.overflowY === 'auto') {
        const extra = el.scrollHeight - el.clientHeight;
        if (extra > bestExtra) { bestExtra = extra; best = el; }
      }
    }
    if (best) return best;

    // Strategy 3: legacy selectors
    return main.querySelector('[tabindex="-1"]')
        || main.querySelector('.copyable-area');
  }

  // Get the send date of any element, trying several strategies.
  function getElementDate(el, separators) {
    // Strategy 1: element is inside a data-pre-plain-text ancestor (most common)
    const ancestor = el.closest('[data-pre-plain-text]');
    if (ancestor) {
      const d = parsePlainTextDate(ancestor.getAttribute('data-pre-plain-text'));
      if (d) return d;
    }

    // Strategy 2: forwarded / album messages — data-pre-plain-text is a sibling or cousin
    // inside the same top-level message bubble ([data-id])
    const msgBubble = el.closest('[data-id]');
    if (msgBubble) {
      // Look for ANY data-pre-plain-text inside the bubble
      const pptEl = msgBubble.querySelector('[data-pre-plain-text]');
      if (pptEl) {
        const d = parsePlainTextDate(pptEl.getAttribute('data-pre-plain-text'));
        if (d) return d;
      }
      // Also try a <time datetime="…"> element (some WA Web versions use this)
      const timeEl = msgBubble.querySelector('time[datetime]');
      if (timeEl) {
        const d = new Date(timeEl.getAttribute('datetime'));
        if (!isNaN(d)) { d.setHours(0, 0, 0, 0); return d; }
      }
    }

    // Strategy 3: nearest preceding date-separator bubble
    for (let i = separators.length - 1; i >= 0; i--) {
      const { el: sep, date } = separators[i];
      if (sep.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING) {
        return date;
      }
    }
    return null;
  }

  // Parse "1 of 30" / "1 de 30" progress indicator inside the viewer
  function getViewerProgress(viewer) {
    for (const el of viewer.querySelectorAll('span, div')) {
      const m = el.textContent.trim().match(/^(\d+)\s+(?:of|de)\s+(\d+)$/i);
      if (m) return { current: +m[1], total: +m[2] };
    }
    return null;
  }

  // Collect all media items from the chat panel with accurate per-message dates
  function collectMedia(chatPane) {
    const results      = [];
    const seenSrc      = new Set();
    const seenUnloaded = new Set();

    // Pre-build an ordered list of date separators for fallback lookups.
    // WhatsApp changes data-testid between versions, so we try several selectors.
    const separators = [];
    const sepCandidateSelectors = [
      '[data-testid="conv-info-daily-date-separator"]',
      '[data-testid="msg-date-separator"]',
      '[data-testid="date-separator"]',
    ];
    for (const sel of sepCandidateSelectors) {
      for (const el of chatPane.querySelectorAll(sel)) {
        const d = parseSeparatorText(el.textContent);
        if (d) separators.push({ el, date: d });
      }
      if (separators.length > 0) break;
    }
    // Last resort: look for short leaf elements whose text looks like a date
    if (separators.length === 0) {
      for (const el of chatPane.querySelectorAll('div, span')) {
        if (el.children.length > 2) continue;
        const t = el.textContent.trim();
        if (t.length > 0 && t.length < 32) {
          const d = parseSeparatorText(t);
          if (d) separators.push({ el, date: d });
        }
      }
    }
    dbg('separators found:', separators.length, separators.map(s => s.date?.toDateString()));

    // Pass 1: identify message containers that are albums (+N overlay).
    // Thumbnails inside these containers will be skipped here — the viewer downloads them all.
    const albumContainers = new Set();
    for (const el of chatPane.querySelectorAll('*')) {
      if (/^\+\d+$/.test(el.textContent?.trim())) {
        const msgCtx = el.closest('[data-pre-plain-text]') || el.closest('[data-id]');
        if (msgCtx) albumContainers.add(msgCtx);
      }
    }
    dbg('album containers found:', albumContainers.size);

    // Pass 2: collect all media, skipping thumbnails that belong to albums
    for (const el of chatPane.querySelectorAll('*')) {
      // ── loaded image (<img src="blob:…">) ─────────────
      if (el.tagName === 'IMG' && el.src?.startsWith('blob:') && !seenSrc.has(el.src)) {
        const w = el.naturalWidth  || el.width;
        const h = el.naturalHeight || el.height;
        if (w > 60 && h > 60) {
          const msgCtx = el.closest('[data-pre-plain-text]') || el.closest('[data-id]');
          if (msgCtx && albumContainers.has(msgCtx)) {
            dbg('skipping album thumbnail (will download via viewer):', el.src.slice(0, 50));
          } else {
            seenSrc.add(el.src);
            results.push({ type: 'loaded', src: el.src, date: getElementDate(el, separators) });
          }
        }
      }

      // ── CSS background-image blob (thumbnails / previews) ──
      if (el.style?.backgroundImage?.includes('blob:') && el.tagName !== 'IMG') {
        const srcMatch = el.style.backgroundImage.match(/url\(["']?(blob:[^"')]+)["']?\)/);
        if (srcMatch && !seenSrc.has(srcMatch[1])) {
          const r = el.getBoundingClientRect();
          if (r.width > 60 && r.height > 60) {
            const msgCtx = el.closest('[data-pre-plain-text]') || el.closest('[data-id]');
            if (!(msgCtx && albumContainers.has(msgCtx))) {
              seenSrc.add(srcMatch[1]);
              results.push({ type: 'loaded', src: srcMatch[1], date: getElementDate(el, separators) });
            }
          }
        }
      }

      // ── unloaded image: WhatsApp "download" button overlay ──
      const testId = el.dataset.testid || '';
      const aria   = (el.getAttribute('aria-label') || '').toLowerCase();
      if (testId.includes('download') || aria === 'download' || aria === 'descargar') {
        const msgCtx = el.closest('[data-pre-plain-text]') || el.closest('[data-id]');
        if (msgCtx && !seenUnloaded.has(msgCtx)) {
          seenUnloaded.add(msgCtx);
          results.push({ type: 'unloaded', btn: el, date: getElementDate(el, separators) });
        }
      }

      // ── album overflow indicator (+N) ──────────────────
      // WhatsApp groups 10+ images into an album and shows "+N" on the last visible slot.
      // Only the first few thumbnails are in the DOM; the rest need the viewer to access.
      if (/^\+\d+$/.test(el.textContent?.trim())) {
        const msgCtx = el.closest('[data-pre-plain-text]') || el.closest('[data-id]');
        if (msgCtx && !seenUnloaded.has(msgCtx)) {
          seenUnloaded.add(msgCtx);
          // Prefer clicking an actual thumbnail image in the album rather than the +N text,
          // since the text element may have pointer-events disabled or not trigger the viewer.
          const thumbImg = msgCtx.querySelector('img[src^="blob:"]') || el;
          results.push({ type: 'album', trigger: thumbImg, date: getElementDate(el, separators) });
        }
      }
    }

    return results;
  }

  // Download a blob URL → anchor-click trick
  async function downloadBlob(src, filename) {
    try {
      const resp = await fetch(src, { credentials: 'include' });
      if (!resp.ok) throw new Error(resp.status);
      const blob = await resp.blob();
      const url  = URL.createObjectURL(blob);
      const a    = Object.assign(document.createElement('a'), { href: url, download: filename });
      document.body.appendChild(a);
      a.click();
      await sleep(400);
      a.remove();
      URL.revokeObjectURL(url);
      return true;
    } catch (e) {
      console.warn('[WA-DL] fetch failed:', src, e.message);
      return false;
    }
  }

  // Click WhatsApp's own download button and wait for the img to appear
  async function triggerUnloadedDownload(btn) {
    // Find nearest message container before clicking
    const msgCtx = btn.closest('[data-pre-plain-text]') || btn.closest('[data-id]') || btn.parentElement;
    const blobsBefore = new Set(
      [...(msgCtx?.querySelectorAll('img[src^="blob:"]') || [])].map(i => i.src)
    );

    // Simulate a real click
    btn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    await sleep(300);
    btn.click();

    // Wait up to 12 s for a new blob img to appear
    for (let t = 0; t < 24; t++) {
      await sleep(500);
      const newImgs = [...(msgCtx?.querySelectorAll('img[src^="blob:"]') || [])]
        .filter(i => !blobsBefore.has(i.src) && (i.naturalWidth || i.width) > 60);
      if (newImgs.length > 0) return newImgs[0].src;
    }
    return null; // WhatsApp's own save-to-disk already triggered
  }

  // Snapshot of all fixed/absolute full-screen overlays currently in the DOM.
  // Used to detect the viewer appearing after a click.
  function getOverlaySnapshot() {
    return new Set([...document.querySelectorAll('body > div, body > span')].map(el => el));
  }

  // Find the WhatsApp media viewer — tries many strategies since the testid changes between versions.
  function findViewer(beforeSnapshot) {
    // Strategy 1: known data-testid values
    const byTestId = document.querySelector(
      '[data-testid="app-viewer"], [data-testid="media-viewer"], [data-testid="media-lightbox"], [data-testid="photo-viewer"]'
    );
    if (byTestId) return byTestId;

    // Strategy 2: any dialog/modal that has a large blob image inside
    for (const el of document.querySelectorAll('[role="dialog"], [aria-modal="true"]')) {
      if (el.querySelector('img[src^="blob:"]')) return el;
    }

    // Strategy 3: new top-level fixed overlay that appeared after the click
    for (const el of document.querySelectorAll('body > div, body > span')) {
      if (beforeSnapshot && beforeSnapshot.has(el)) continue;
      const cs = getComputedStyle(el);
      if ((cs.position === 'fixed' || cs.position === 'absolute') && +cs.zIndex > 100) {
        if (el.querySelector('img[src^="blob:"]')) return el;
        if (el.offsetWidth > window.innerWidth * 0.8) return el; // full-screen overlay
      }
    }

    // Strategy 4: any element covering most of the screen with a blob image
    for (const el of document.querySelectorAll('div')) {
      const r = el.getBoundingClientRect();
      if (r.width > window.innerWidth * 0.8 && r.height > window.innerHeight * 0.8) {
        if (el.querySelector('img[src^="blob:"]')) return el;
      }
    }

    return null;
  }

  function getViewerNav(viewer, direction) {
    const vr = viewer.getBoundingClientRect();

    // Strategy 1: specific data-testid values (never include 'forward' — that matches "Reenviar mensaje")
    const testIds = direction === 'forward'
      ? ['nav-forward', 'photo-next', 'next-media', 'viewer-next']
      : ['nav-back',    'photo-prev', 'prev-media', 'viewer-prev'];
    for (const id of testIds) {
      const el = viewer.querySelector(`[data-testid="${id}"]`);
      if (el) { dbg('nav by testid:', id); return el; }
    }

    // Strategy 2: aria-label with photo-specific terms (NOT generic "forward"/"siguiente")
    const fwdLabels = ['siguiente foto', 'foto siguiente', 'next photo', 'próxima foto'];
    const bkLabels  = ['foto anterior',  'anterior foto',  'previous photo', 'última foto'];
    const labels    = direction === 'forward' ? fwdLabels : bkLabels;
    const byLabel   = [...viewer.querySelectorAll('[aria-label]')]
      .find(el => labels.some(l => el.getAttribute('aria-label').toLowerCase().includes(l)));
    if (byLabel) { dbg('nav by aria-label:', byLabel.getAttribute('aria-label')); return byLabel; }

    // Strategy 3: position-based — nav arrows are always on the left/right EDGES of the viewer,
    // while toolbar buttons (Reenviar, Descargar, etc.) sit at the top or bottom.
    // "Next" arrow lives in the right 20% of the viewer; "Prev" in the left 20%.
    const midY    = vr.top + vr.height * 0.5;
    const leftCut = vr.left + vr.width * 0.2;
    const rightCut= vr.left + vr.width * 0.8;

    const candidates = [...viewer.querySelectorAll('button, [role="button"]')]
      .filter(el => {
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) return false;
        const elMidY = r.top + r.height / 2;
        // Must be vertically near the center of the viewer (not top/bottom toolbar)
        if (Math.abs(elMidY - midY) > vr.height * 0.35) return false;
        if (direction === 'forward') return r.left > rightCut;
        else                         return r.right < leftCut;
      });

    if (candidates.length > 0) {
      const btn = direction === 'forward'
        ? candidates.sort((a, b) => b.getBoundingClientRect().left - a.getBoundingClientRect().left)[0]
        : candidates.sort((a, b) => a.getBoundingClientRect().left - b.getBoundingClientRect().left)[0];
      dbg('nav by position:', direction, btn.getBoundingClientRect());
      return btn;
    }

    dbg('nav button not found for direction:', direction);
    return null;
  }

  // Open an album in WhatsApp's full-screen viewer, navigate every image, download all.
  // Returns the number of images successfully downloaded.
  async function downloadAlbumViaViewer(triggerEl, dateStr, startIndex, onProgress) {
    const beforeSnapshot = getOverlaySnapshot();

    // Try clicking the trigger element and several of its ancestors
    // (the actual clickable target might be a parent div, not the img itself)
    const clickTargets = [
      triggerEl,
      triggerEl.parentElement,
      triggerEl.parentElement?.parentElement,
    ].filter(Boolean);

    for (const target of clickTargets) {
      target.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
      await sleep(600);
      if (findViewer(beforeSnapshot)) break;
    }

    // Wait up to 8 s for the viewer to appear
    let viewer = null;
    for (let t = 0; t < 16; t++) {
      viewer = findViewer(beforeSnapshot);
      if (viewer) break;
      await sleep(500);
    }

    if (!viewer) {
      console.warn('[WA-DL] No se pudo abrir el visor del álbum. Viewer DOM snapshot:', document.body.innerHTML.length);
      return 0;
    }

    dbg('Viewer found:', viewer.tagName, viewer.dataset.testid || '(no testid)');

    // Read total from "X of N" / "X de N" counter span
    const progress0   = getViewerProgress(viewer);
    const totalImages = progress0?.total ?? null;
    dbg('album total from counter:', totalImages, '| opened at position:', progress0?.current);

    // Rewind to image 1 so we don't skip images the viewer already scrolled past
    if (progress0 && progress0.current > 1) {
      dbg('rewinding to image 1 from position', progress0.current);
      for (let i = 0; i < progress0.current - 1; i++) {
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', keyCode: 37, bubbles: true, cancelable: true }));
        document.dispatchEvent(new KeyboardEvent('keyup',   { key: 'ArrowLeft', keyCode: 37, bubbles: true }));
        await sleep(250);
      }
      await sleep(600);
    }

    const albumSeenSrcs  = new Set();
    let downloaded       = 0;
    let noProgressRounds = 0;

    // Helper: find the main (largest) fully-loaded blob image currently in the viewer
    const getBigImg = () =>
      [...viewer.querySelectorAll('img[src^="blob:"]')]
        .filter(i => i.complete && (i.naturalWidth || i.width) > 80)
        .sort((a, b) => (b.naturalWidth || b.width) - (a.naturalWidth || a.width))[0] || null;

    // Helper: find WhatsApp's own download button inside the viewer (fallback)
    const getViewerDlBtn = () =>
      [...viewer.querySelectorAll('[aria-label], button, span[data-testid]')]
        .find(el => /descargar|download/i.test(el.getAttribute('aria-label') || el.dataset.testid || ''));

    while (noProgressRounds < 3) {
      // Wait for a loaded image to appear (up to 5 s)
      let img = null;
      for (let w = 0; w < 25; w++) {
        img = getBigImg();
        if (img) break;
        await sleep(200);
      }

      if (!img) { noProgressRounds++; continue; }

      // Stop as soon as we've downloaded the known total
      if (totalImages && downloaded >= totalImages) {
        dbg('reached album total:', totalImages); break;
      }

      if (albumSeenSrcs.has(img.src)) {
        // Looped back to an already-seen image → album fully traversed
        noProgressRounds++;
        advanceViewer();
        await sleep(400);
        continue;
      }

      albumSeenSrcs.add(img.src);
      noProgressRounds = 0;

      const currentSrc = img.src;
      const idx        = String(startIndex + downloaded).padStart(3, '0');
      const filename   = `whatsapp_${dateStr}_${idx}.jpg`;
      onProgress(`📥 Álbum: descargando imagen ${downloaded + 1}…`);

      // Primary: fetch the blob ourselves so we control the filename
      let success = await downloadBlob(currentSrc, filename);

      // Fallback: click WhatsApp's own viewer download button
      if (!success) {
        const dlBtn = getViewerDlBtn();
        if (dlBtn) { dlBtn.click(); success = true; dbg('fallback: clicked WA download btn'); }
        else console.warn('[WA-DL] No se pudo descargar la imagen del álbum:', currentSrc);
      }

      if (success) downloaded++;

      // Navigate forward using ArrowRight keyboard event — confirmed working.
      // Button clicks are intentionally avoided: WhatsApp's toolbar has a "Reenviar mensaje"
      // button that position-based detection can accidentally match, opening the wrong dialog.
      const advanceViewer = () => {
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', keyCode: 39, bubbles: true, cancelable: true }));
        document.dispatchEvent(new KeyboardEvent('keyup',   { key: 'ArrowRight', keyCode: 39, bubbles: true }));
        dbg('ArrowRight sent');
      };

      advanceViewer();
      for (let w = 0; w < 20; w++) {       // wait up to 4 s for src to change
        await sleep(200);
        const next = getBigImg();
        if (next && next.src !== currentSrc) break;
        if (w === 9) advanceViewer();       // retry once at 2 s if still stuck
      }
      if (getBigImg()?.src === currentSrc) { dbg('viewer did not advance, stopping album'); break; }
    }

    // Close the viewer — try button first, then Escape
    const closeBtn = [...viewer.querySelectorAll('[aria-label], button, span')]
      .find(el => /cerrar|close|exit/i.test(el.getAttribute('aria-label') || el.textContent));
    if (closeBtn) closeBtn.click();
    else document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));

    await sleep(700);
    return downloaded;
  }

  // Try to read the date of the image currently shown in the viewer.
  // WhatsApp sometimes renders the date in a header element above the image.
  function getViewerImageDate(viewer) {
    for (const el of viewer.querySelectorAll('time, span, div')) {
      if (el.tagName === 'TIME' && el.getAttribute('datetime')) {
        const d = new Date(el.getAttribute('datetime'));
        if (!isNaN(d)) { d.setHours(0, 0, 0, 0); return d; }
      }
      const text = el.textContent.trim();
      if (!text || text.length > 40 || el.children.length > 1) continue;
      // Match numeric date patterns: D/M/YY, M/D/YY, D.M.YYYY etc.
      const m = text.match(/(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2,4})/);
      if (m) { const d = parsePlainTextDate(`[0:00, ${m[0]}]`); if (d) return d; }
      // Match "Month D, YYYY" (English / Spanish month names)
      const d = new Date(text);
      if (!isNaN(d) && d.getFullYear() > 2020) { d.setHours(0, 0, 0, 0); return d; }
    }
    return null;
  }

  // ── Main ─────────────────────────────────────────────────
  document.getElementById('wa-start-btn').onclick = async () => {
    const startVal = document.getElementById('wa-start').value;
    const endVal   = document.getElementById('wa-end').value;
    const startDate = startVal ? new Date(startVal + 'T00:00:00') : null;
    const endDate   = endVal   ? new Date(endVal   + 'T23:59:59') : null;

    if (startDate && endDate && startDate > endDate) {
      setStatus('⚠️ La fecha "Desde" debe ser anterior a la fecha "Hasta".', '#c00');
      return;
    }

    const btn = document.getElementById('wa-start-btn');
    btn.disabled = true; btn.style.opacity = '0.55';

    const chatPane = findScrollContainer();
    if (!chatPane) {
      setStatus('⚠️ No se encontró la ventana del chat. Asegúrate de tener un chat abierto.', '#c00');
      btn.disabled = false; btn.style.opacity = '1';
      return;
    }

    // ── Phase 1+2: scroll page-by-page and collect at each position ──
    // WhatsApp uses virtual scrolling: messages outside the visible area are
    // removed from the DOM. We must collect images at every scroll position
    // instead of scrolling all the way first and scanning once at the end.
    setStatus('🔄 Cargando mensajes… esto puede tardar un momento.');

    const collectedSrcs = new Set();
    const collectedCtx  = new Set();
    const all           = [];

    function mergeMedia(items) {
      for (const item of items) {
        if (item.type === 'loaded') {
          if (!collectedSrcs.has(item.src)) { collectedSrcs.add(item.src); all.push(item); }
        } else {
          const key = item.trigger || item.btn;
          if (key && !collectedCtx.has(key)) { collectedCtx.add(key); all.push(item); }
        }
      }
    }

    // Start at the bottom so recent messages (today) are captured first
    chatPane.scrollTop = chatPane.scrollHeight;
    await sleep(1200);
    mergeMedia(collectMedia(chatPane));

    // Scroll up one viewport at a time, collecting at each stop
    let prevScrollTop = chatPane.scrollTop;
    let noProgressCount = 0;

    while (noProgressCount < 4) {
      chatPane.scrollTop = Math.max(0, chatPane.scrollTop - chatPane.clientHeight * 0.85);
      await sleep(1500);
      mergeMedia(collectMedia(chatPane));

      setStatus(`🔄 Cargando mensajes… (${all.length} imagen(es) encontrada(s))`);

      // Stop early if the oldest visible separator is already before the start date
      if (startDate) {
        const seps = [...chatPane.querySelectorAll('[data-testid="conv-info-daily-date-separator"]')];
        if (seps.length > 0) {
          const oldest = parseSeparatorText(seps[0].textContent);
          if (oldest && oldest < startDate) break;
        }
      }

      if (chatPane.scrollTop === prevScrollTop) noProgressCount++;
      else { noProgressCount = 0; prevScrollTop = chatPane.scrollTop; }

      // At the very top — do one final collect and stop
      if (chatPane.scrollTop === 0) { await sleep(800); mergeMedia(collectMedia(chatPane)); break; }
    }

    if (all.length === 0) {
      setStatus(
        '⚠️ No se encontraron imágenes en los mensajes visibles.<br>' +
        'Intenta desplazarte manualmente por el chat para que carguen las imágenes y vuelve a ejecutar el script.',
        '#c00'
      );
      btn.disabled = false; btn.style.opacity = '1';
      return;
    }

    // Filter by date. Log each item's detected date for debugging.
    let unknownDateCount = 0;
    function inRange(item) {
      if (!item.date) {
        // Can't determine date → include anyway (better than silently skipping)
        unknownDateCount++;
        dbg('image with unknown date included:', item.src || item.type);
        return true;
      }
      dbg('image date:', item.date.toDateString(), item.src || item.type);
      if (startDate && item.date < startDate) return false;
      if (endDate   && item.date > endDate)   return false;
      return true;
    }

    const toDownload = all.filter(inRange);
    const outOfRange = all.length - toDownload.length;

    if (toDownload.length === 0) {
      setStatus(
        `⚠️ Se encontraron ${all.length} imagen(es) pero ninguna está en el rango de fechas seleccionado.` +
        (outOfRange > 0 ? `<br>${outOfRange} imagen(es) estaban fuera del rango.` : ''),
        '#c00'
      );
      btn.disabled = false; btn.style.opacity = '1';
      return;
    }

    // ── Phase 3: open viewer on first in-range image, navigate right ──
    // Find any in-range image element currently present in the DOM.
    // Prefer the earliest-dated one so we navigate forward through time.
    const sortedByDate = [...toDownload]
      .filter(i => i.date)
      .sort((a, b) => a.date - b.date);
    const orderedItems = [...sortedByDate, ...toDownload.filter(i => !i.date)];

    let clickTarget = null;
    for (const item of orderedItems) {
      if (item.type === 'loaded') {
        const el = [...document.querySelectorAll('#main img')].find(i => i.src === item.src);
        if (el) { clickTarget = el; break; }
      } else if (item.trigger && document.contains(item.trigger)) {
        clickTarget = item.trigger; break;
      } else if (item.btn && document.contains(item.btn)) {
        clickTarget = item.btn; break;
      }
    }

    // If nothing visible, scroll to bottom (most recent) and retry
    if (!clickTarget) {
      chatPane.scrollTop = chatPane.scrollHeight;
      await sleep(1000);
      for (const item of orderedItems) {
        if (item.type === 'loaded') {
          const el = [...document.querySelectorAll('#main img')].find(i => i.src === item.src);
          if (el) { clickTarget = el; break; }
        } else if (item.trigger && document.contains(item.trigger)) {
          clickTarget = item.trigger; break;
        }
      }
    }

    if (!clickTarget) {
      setStatus('⚠️ No se encontró ninguna imagen en pantalla para abrir el visor.<br>Desplázate al chat manualmente y vuelve a intentarlo.', '#c00');
      btn.disabled = false; btn.style.opacity = '1';
      return;
    }

    setStatus('🖼️ Abriendo visor…');
    const beforeSnap = getOverlaySnapshot();
    clickTarget.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));

    let viewer = null;
    for (let t = 0; t < 20; t++) {
      viewer = findViewer(beforeSnap);
      if (viewer) break;
      await sleep(400);
    }

    if (!viewer) {
      setStatus('⚠️ No se pudo abrir el visor de imágenes.', '#c00');
      btn.disabled = false; btn.style.opacity = '1';
      return;
    }

    dbg('Viewer opened:', viewer.tagName, viewer.dataset.testid);

    const getBigImg = () =>
      [...viewer.querySelectorAll('img[src^="blob:"]')]
        .filter(i => i.complete && (i.naturalWidth || i.width) > 80)
        .sort((a, b) => (b.naturalWidth || b.width) - (a.naturalWidth || a.width))[0] || null;

    const sendRight = () => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', keyCode: 39, bubbles: true, cancelable: true }));
      document.dispatchEvent(new KeyboardEvent('keyup',   { key: 'ArrowRight', keyCode: 39, bubbles: true }));
    };

    // Wait for the first image to appear in the viewer
    let img = null;
    for (let w = 0; w < 20; w++) { img = getBigImg(); if (img) break; await sleep(300); }

    // Find WhatsApp's download button inside the viewer toolbar
    const findDlBtn = () => [...viewer.querySelectorAll('[aria-label], [data-testid], button')]
      .find(el => {
        const a = (el.getAttribute('aria-label') || '').toLowerCase();
        const t = (el.dataset.testid || '').toLowerCase();
        return a.includes('descargar') || a.includes('download') || t.includes('download');
      });

    const viewerSeenSrcs = new Set();
    let ok = 0, skipped = 0, noAdvanceCount = 0;

    while (noAdvanceCount < 4) {
      // Wait up to 6 s for a fully-loaded image to appear
      let img = null;
      for (let w = 0; w < 30; w++) { img = getBigImg(); if (img) break; await sleep(200); }
      if (!img) { noAdvanceCount++; dbg('no image in viewer, attempt', noAdvanceCount); continue; }

      const currentSrc = img.src;

      // If we see the same src we already handled, we need to advance (not break yet)
      if (viewerSeenSrcs.has(currentSrc)) {
        dbg('same src after navigation attempt, retrying advance');
        sendRight();
        await sleep(800);
        noAdvanceCount++;
        continue;
      }

      viewerSeenSrcs.add(currentSrc);
      noAdvanceCount = 0; // reset — we have a fresh image

      const progress = getViewerProgress(viewer);
      const imgDate  = getViewerImageDate(viewer);
      dbg('viewer pos:', progress?.current, '/', progress?.total, '| date:', imgDate?.toDateString());

      // Stop if past end date
      if (imgDate && endDate && imgDate > endDate) { dbg('past end date, stopping'); break; }

      const inRangeNow = !imgDate
        || ((!startDate || imgDate >= startDate) && (!endDate || imgDate <= endDate));

      if (inRangeNow) {
        setStatus(`📥 Descargando imagen ${ok + 1}…`);

        // Primary: click WhatsApp's own download button in the viewer toolbar
        const dlBtn = findDlBtn();
        if (dlBtn) {
          dbg('clicking WA download button');
          dlBtn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
          await sleep(600);
          ok++;
        } else {
          // Fallback: fetch blob ourselves
          dbg('WA download button not found, fetching blob');
          const dateStr  = imgDate ? imgDate.toISOString().slice(0, 10) : 'fecha-desconocida';
          const filename = `whatsapp_${dateStr}_${String(ok + 1).padStart(3, '0')}.jpg`;
          const success  = await downloadBlob(currentSrc, filename);
          if (success) ok++; else skipped++;
        }
      } else {
        dbg('skipping image outside range, date:', imgDate?.toDateString());
      }

      // Done if this was the last image
      if (progress && progress.current >= progress.total) { dbg('last image reached'); break; }

      // Re-focus the viewer so ArrowRight is captured, then navigate
      viewer.focus();
      sendRight();

      // Wait up to 6 s for the src to change
      let advanced = false;
      for (let w = 0; w < 30; w++) {
        await sleep(200);
        const next = getBigImg();
        if (next && next.src !== currentSrc) { advanced = true; break; }
        if (w === 15) { dbg('retrying ArrowRight'); sendRight(); }
      }
      if (!advanced) { noAdvanceCount++; dbg('did not advance, count:', noAdvanceCount); }
    }

    // Close viewer with Escape
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await sleep(500);

    let summary = `✅ ¡Listo! ${ok} imagen(es) guardada(s) en tu carpeta de Descargas.`;
    if (unknownDateCount > 0) summary += `<br>ℹ️ ${unknownDateCount} imagen(es) incluida(s) sin fecha detectada.`;
    if (skipped > 0)          summary += `<br>⚠️ ${skipped} no se pudieron descargar.`;
    setStatus(summary, '#0a7a3e');

    btn.disabled = false;
    btn.style.opacity = '1';
    btn.textContent = '▶ Descargar de Nuevo';
  };
})();
