chrome.runtime.onInstalled.addListener(() => {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});
});

chrome.runtime.onMessage.addListener((message, sender) => {
  if (message?.type !== "TABARATO_OPEN_PANEL" || !sender.tab?.id) return;
  chrome.sidePanel.open({ tabId: sender.tab.id }).catch(() => {});
});
