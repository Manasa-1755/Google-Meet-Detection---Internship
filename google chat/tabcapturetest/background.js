chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.action === "startAudioCapture") {
      // Don't pass tabId — let Chrome pick the active tab after invocation
      chrome.tabCapture.getMediaStreamId((streamId) => {
        if (chrome.runtime.lastError) {
          console.error("❌ tabCapture failed:", chrome.runtime.lastError.message);
          sendResponse({ error: chrome.runtime.lastError.message });
          return;
        }
        sendResponse({ streamId });
      });
      return true; // keep the message channel open
    }
  });
  