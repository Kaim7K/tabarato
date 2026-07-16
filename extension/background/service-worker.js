chrome.runtime.onInstalled.addListener(() => {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});
});

function waitForTab(tabId, timeout = 60000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      chrome.tabs.onUpdated.removeListener(listener);
      reject(new Error("O WhatsApp Web demorou para carregar."));
    }, timeout);
    const listener = (updatedId, changeInfo, tab) => {
      if (updatedId !== tabId || changeInfo.status !== "complete") return;
      clearTimeout(timer);
      chrome.tabs.onUpdated.removeListener(listener);
      resolve(tab);
    };
    chrome.tabs.get(tabId).then((tab) => {
      if (tab.status === "complete") {
        clearTimeout(timer);
        chrome.tabs.onUpdated.removeListener(listener);
        resolve(tab);
      }
    }).catch(reject);
    chrome.tabs.onUpdated.addListener(listener);
  });
}

async function whatsappTab() {
  const tabs = await chrome.tabs.query({ url: "https://web.whatsapp.com/*" });
  if (tabs.length) return tabs.sort((a, b) => (b.lastAccessed || 0) - (a.lastAccessed || 0))[0];
  return chrome.tabs.create({ url: "https://web.whatsapp.com/" });
}

async function sendToWhatsApp(message) {
  const tab = await whatsappTab();
  if (!tab?.id) throw new Error("Nao foi possivel abrir o WhatsApp Web.");
  await chrome.windows.update(tab.windowId, { focused: true });
  await chrome.tabs.update(tab.id, { active: true });
  await waitForTab(tab.id);

  const payload = {
    type: "TABARATO_WHATSAPP_SEND",
    groupName: message.groupName,
    text: message.text,
    imageDataUrl: message.imageDataUrl,
    fileName: message.fileName,
  };

  try {
    return await chrome.tabs.sendMessage(tab.id, payload);
  } catch {
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["content/whatsapp.js"] });
    return chrome.tabs.sendMessage(tab.id, payload);
  }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === "TABARATO_OPEN_PANEL" && sender.tab?.id) {
    chrome.sidePanel.open({ tabId: sender.tab.id }).catch(() => {});
    return;
  }
  if (message?.type === "TABARATO_SHARE_WHATSAPP") {
    sendToWhatsApp(message)
      .then((result) => sendResponse(result || { ok: true }))
      .catch((error) => sendResponse({ ok: false, error: error.message || "Falha ao acessar o WhatsApp Web." }));
    return true;
  }
});
