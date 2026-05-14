// WhatsApp Photo Downloader — Diagnostic Snapshot
// Paste this entire script into the DevTools console on web.whatsapp.com
// It downloads a JSON file with DOM structure and selector test results.
// No message content or contact names are captured.

(function diagnosticDump() {
  'use strict';

  // ── Selectors to test (mirrors SEL in content.js) ─────────────────────────
  const SEL_TESTS = {
    scrollContainer:  ['[data-testid="conversation-panel-messages"]'],
    scrollFallback:   ['[tabindex="-1"]'],
    dateSeparators:   [
      '[data-testid="conv-info-daily-date-separator"]',
      '[data-testid="msg-date-separator"]',
      '[data-testid="date-separator"]',
    ],
    messageBubble:    ['[data-id]'],
    unloadedDownload: [
      '[data-testid="media-state-download"]',
      '[data-testid*="download"]',
      '[aria-label="download"]',
      '[aria-label="Descargar"]',
    ],
    imageClickTarget: ['[data-testid="image-thumb"]', '[aria-label="Open picture"]'],
    viewer: [
      '[data-testid="media-viewer-modal"]',
      '[data-testid="app-viewer"]',
      '[data-testid="media-viewer"]',
      '[data-testid="media-lightbox"]',
      '[data-testid="photo-viewer"]',
    ],
    viewerFallback:   ['[role="dialog"]', '[aria-modal="true"]'],
    attachBtn: [
      '[data-testid="attach-btn"]',
      '[data-testid="clip"]',
      '[aria-label="Adjuntar"]',
      '[aria-label="Attach"]',
    ],
    headerBtn: [
      '[data-testid="call-dropdown-button"]',
      '[aria-label="Search"]',
      '[aria-label="Menu"]',
    ],
  };

  // ── Helpers ────────────────────────────────────────────────────────────────

  function testSelectors(group) {
    return group.map(sel => ({
      selector: sel,
      matches:  document.querySelectorAll(sel).length,
      first:    summariseEl(document.querySelector(sel)),
    }));
  }

  function summariseEl(el) {
    if (!el) return null;
    const r  = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    return {
      tag:       el.tagName,
      id:        el.id         || undefined,
      testid:    el.dataset.testid || undefined,
      ariaLabel: el.getAttribute('aria-label') || undefined,
      role:      el.getAttribute('role')        || undefined,
      dataId:    el.hasAttribute('data-id')     ? '(present)' : undefined,
      dataPpt:   el.hasAttribute('data-pre-plain-text') ? '(present, redacted)' : undefined,
      hasBlobImg: !!el.querySelector('img[src^="blob:"]'),
      rect:      { w: Math.round(r.width), h: Math.round(r.height), top: Math.round(r.top), left: Math.round(r.left) },
      computed:  { position: cs.position, overflowY: cs.overflowY, zIndex: cs.zIndex, display: cs.display },
    };
  }

  // Serialise a DOM subtree — attributes only, no text content (privacy)
  function serializeTree(el, depth = 0, maxDepth = 6) {
    if (!el || depth > maxDepth) return null;
    const node = summariseEl(el);
    if (!node) return null;
    node.children = [...el.children]
      .map(c => serializeTree(c, depth + 1, maxDepth))
      .filter(Boolean);
    return node;
  }

  // ── Collect all data-testid and aria-label values in the page ─────────────
  function collectAttributes(attr) {
    const counts = {};
    for (const el of document.querySelectorAll(`[${attr}]`)) {
      const v = el.getAttribute(attr);
      counts[v] = (counts[v] || 0) + 1;
    }
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .map(([value, count]) => ({ value, count }));
  }

  // ── Scroll container info ──────────────────────────────────────────────────
  function scrollInfo() {
    const main = document.getElementById('main');
    if (!main) return null;
    let best = null, bestExtra = 0;
    for (const el of main.querySelectorAll('div')) {
      const cs    = getComputedStyle(el);
      const extra = el.scrollHeight - el.clientHeight;
      if ((cs.overflowY === 'scroll' || cs.overflowY === 'auto') && extra > bestExtra) {
        bestExtra = extra; best = el;
      }
    }
    if (!best) return { found: false };
    return {
      found:        true,
      scrollTop:    best.scrollTop,
      scrollHeight: best.scrollHeight,
      clientHeight: best.clientHeight,
      testid:       best.dataset.testid || null,
      summary:      summariseEl(best),
    };
  }

  // ── Sample message bubbles ─────────────────────────────────────────────────
  function sampleBubbles(limit = 5) {
    return [...document.querySelectorAll('[data-id]')]
      .slice(0, limit)
      .map(el => ({
        dataId:          '(redacted)',
        hasDataPpt:      el.hasAttribute('data-pre-plain-text'),
        dataPptOnDescendant: !!el.querySelector('[data-pre-plain-text]'),
        dataPptDepth:    (() => {
          const found = el.querySelector('[data-pre-plain-text]');
          if (!found) return null;
          let depth = 0, node = found;
          while (node !== el) { depth++; node = node.parentElement; }
          return depth;
        })(),
        hasTimeElement:  !!el.querySelector('time[datetime]'),
        dataPptFormat:   (() => {
          // Check bubble root first, then any descendant
          const src = el.hasAttribute('data-pre-plain-text')
            ? el
            : el.querySelector('[data-pre-plain-text]');
          const v = src?.getAttribute('data-pre-plain-text');
          if (!v) return null;
          return v.replace(/\[.*?\]/g, '[TIME, DATE]').replace(/].*$/, '] (name redacted)');
        })(),
        blobImages:      el.querySelectorAll('img[src^="blob:"]').length,
        hasDownloadBtn:  !!(
          el.querySelector('[data-testid*="download"]') ||
          el.querySelector('[aria-label="download"]')   ||
          el.querySelector('[aria-label="Descargar"]')
        ),
        hasAlbumOverlay: [...el.querySelectorAll('*')].some(c =>
          /^\+\d+$/.test(c.textContent?.trim()) && !c.querySelector('*')
        ),
        hasBlobBackground: [...el.querySelectorAll('[style*="blob:"]')].length > 0,
        childCount:      el.children.length,
      }));
  }

  // ── Build report ───────────────────────────────────────────────────────────
  const report = {
    meta: {
      timestamp:  new Date().toISOString(),
      url:        location.href,
      viewport:   { w: window.innerWidth, h: window.innerHeight },
      userAgent:  navigator.userAgent,
      mainExists: !!document.getElementById('main'),
    },

    selectorTests: Object.fromEntries(
      Object.entries(SEL_TESTS).map(([key, selectors]) => [key, testSelectors(selectors)])
    ),

    allTestIds:   collectAttributes('data-testid'),
    allAriaLabels: collectAttributes('aria-label'),

    scrollContainer: scrollInfo(),

    messageBubbleSample: sampleBubbles(5),

    // DOM tree of #main (structure only, no text)
    mainTree: serializeTree(document.getElementById('main'), 0, 5),

    // Header structure specifically
    headerTree: serializeTree(document.querySelector('#main header'), 0, 6),
  };

  // ── Download ───────────────────────────────────────────────────────────────
  const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
  const url  = URL.createObjectURL(blob);
  const ts   = new Date().toISOString().slice(0, 19).replace(/[T:]/g, '-');
  const a    = Object.assign(document.createElement('a'), {
    href: url, download: `wa-diagnostic-${ts}.json`,
  });
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);

  console.log('[WA-DIAG] Diagnostic snapshot downloaded.');
  console.log('[WA-DIAG] Selector results:');
  for (const [key, results] of Object.entries(report.selectorTests)) {
    const hit = results.find(r => r.matches > 0);
    console.log(`  ${key}: ${hit ? `✅ "${hit.selector}" (${hit.matches} match)` : '❌ no match'}`);
  }
})();
