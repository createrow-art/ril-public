const API = 'http://localhost:3000';

// Register right-click context menu on the extension action button
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: 'open-ril',
    title: 'Open RIL',
    contexts: ['action'],
  });
  chrome.contextMenus.create({
    id: 'save-page',
    title: 'Save page to RIL',
    contexts: ['action'],
  });
});

// Handle right-click menu clicks
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === 'open-ril') {
    chrome.tabs.create({ url: 'chrome://newtab' });
    return;
  }

  if (info.menuItemId === 'save-page') {
    if (!tab?.url) return;
    try {
      await fetch(`${API}/api/items`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: tab.url }),
      });
    } catch {
      // Silent fail — no UI available in context menu flow
    }
  }
});
