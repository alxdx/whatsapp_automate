// When the user clicks the extension icon, tell the content script to show the panel.
chrome.action.onClicked.addListener((tab) => {
  chrome.tabs.sendMessage(tab.id, { type: 'SHOW_PANEL' }, (response) => {
    if (chrome.runtime.lastError) {
      chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files:  ['content.js'],
      });
    }
  });
});

// Proxy fetch requests from content scripts to avoid CORS restrictions.
// Service workers are not subject to CORS enforcement for URLs in host_permissions.
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'FETCH_PROXY') {
    fetch(msg.url, msg.options)
      .then(async r => ({ ok: r.ok, status: r.status, body: await r.text() }))
      .then(result => sendResponse({ success: true, ...result }))
      .catch(e   => sendResponse({ success: false, error: e.message }));
    return true; // keep channel open for async response
  }
});
