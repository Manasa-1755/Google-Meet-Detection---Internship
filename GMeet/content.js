/*
// ------------------ Google Meet Auto Recorder ------------------
let isInMeeting = false;
let recordingStarted = false;
let autoRecordEnabled = false;
let leaveButtonObserver = null;
let lastLeaveButtonVisible = false;

// ------------------ Check Auto Record Permission ------------------
async function checkAutoRecordPermission() {
  return new Promise((resolve) => {
    chrome.storage.local.get(['autoRecordPermission'], (result) => {
      autoRecordEnabled = result.autoRecordPermission || false;
      console.log("🔐 Auto record enabled:", autoRecordEnabled);
      resolve(autoRecordEnabled);
    });
  });
}

// ------------------ Detect Leave Button ------------------
function findLeaveButton() {
  const selectors = [
    'button[aria-label="Leave call"]',
    'button[aria-label*="Leave call"]',
    'div[role="button"][data-tooltip="Leave call"]',
    'div[role="button"][aria-label*="Leave"]',
    'button[jscontroller][jsname][aria-label*="Leave"]',
  ];
  for (const selector of selectors) {
    const el = document.querySelector(selector);
    if (el) return el;
  }
  return null;
}

function isElementVisible(element) {
  if (!element) return false;
  const style = window.getComputedStyle(element);
  const rect = element.getBoundingClientRect();
  return style.display !== 'none' &&
         style.visibility !== 'hidden' &&
         style.opacity !== '0' &&
         rect.width > 0 &&
         rect.height > 0 &&
         element.offsetParent !== null;
}

// ------------------ Check Meeting State ------------------
function checkMeetingState() {
  const leaveButton = findLeaveButton();
  const leaveVisible = leaveButton && isElementVisible(leaveButton);

  // Meeting joined
  if (leaveVisible && !lastLeaveButtonVisible) {
    console.log("✅ Leave button visible - Meeting joined");
    isInMeeting = true;
    if (autoRecordEnabled && !recordingStarted) startAutoRecording();
  }

  // Meeting ended
  if (!leaveVisible && lastLeaveButtonVisible) {
    console.log("❌ Leave button hidden - Meeting ended");
    isInMeeting = false;
    if (recordingStarted) stopAutoRecording();
  }

  lastLeaveButtonVisible = leaveVisible;
  chrome.storage.local.set({ isInMeeting });
}

// ------------------ Start / Stop Auto Recording ------------------
function startAutoRecording() {
  if (recordingStarted) return;
  recordingStarted = true;

  chrome.runtime.sendMessage({ action: "autoStartRecording" }, (response) => {
    if (response?.success) console.log("✅ Auto recording started");
    else recordingStarted = false;
  });
}

function stopAutoRecording() {
  if (!recordingStarted) return;
  recordingStarted = false;

  chrome.runtime.sendMessage({ action: "autoStopRecording" }, (response) => {
    if (response?.success) console.log("✅ Auto recording stopped");
    else console.log("❌ Failed to stop auto recording");
  });
}

// ------------------ Observe DOM Changes ------------------
function setupLeaveButtonObserver() {
  if (leaveButtonObserver) leaveButtonObserver.disconnect();
  leaveButtonObserver = new MutationObserver(() => {
    setTimeout(checkMeetingState, 500);
  });
  leaveButtonObserver.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['style', 'class', 'aria-hidden', 'disabled']
  });
}

// ------------------ Listen for Messages from Popup ------------------
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "updateAutoRecordPermission") {
    autoRecordEnabled = message.enabled;
    if (autoRecordEnabled && isInMeeting && !recordingStarted) setTimeout(startAutoRecording, 1000);
    sendResponse({ success: true });
  }

  if (message.action === "checkMeetingStatus") {
    sendResponse({ isInMeeting, recording: recordingStarted, autoRecordEnabled });
  }

  if (message.action === "autoStopRecording") {
    stopAutoRecording();
    sendResponse({ success: true });
  }
  return true;
});

// ------------------ Initial Setup ------------------
setTimeout(async () => {
  await checkAutoRecordPermission();
  setupLeaveButtonObserver();
  setInterval(checkMeetingState, 2000); // fallback
  console.log("🔍 Meet Auto Recorder content script fully loaded");
}, 1000);
*/

let isInMeeting = false;
let lastLeaveButtonVisible = false;
let autoRecordEnabled = false;

// Load auto-record permission
chrome.storage.local.get(['autoRecordPermission'], (res) => {
    autoRecordEnabled = res.autoRecordPermission || false;
});

// Check meeting state
function checkMeetingState() {
    const leaveButton = findLeaveButton();
    const leaveButtonVisible = leaveButton && isElementVisible(leaveButton);

    if (leaveButtonVisible && !lastLeaveButtonVisible) {
        console.log("✅ Meeting joined");
    }
    if (!leaveButtonVisible && lastLeaveButtonVisible) {
        console.log("❌ Meeting ended");
    }

    if (leaveButtonVisible && !isInMeeting) {
        isInMeeting = true;
        if (autoRecordEnabled) {
            chrome.runtime.sendMessage({ action: "autoStartRecording" });
        }
    } else if (!leaveButtonVisible && isInMeeting) {
        isInMeeting = false;
        if (autoRecordEnabled) {
            chrome.runtime.sendMessage({ action: "autoStopRecording" });
        }
    }

    lastLeaveButtonVisible = leaveButtonVisible;
}

// Find the “Leave call” button
function findLeaveButton() {
    const selectors = [
        'button[aria-label="Leave call"]',
        'button[aria-label*="Leave call"]',
        'div[role="button"][data-tooltip="Leave call"]',
        'div[role="button"][aria-label*="Leave"]'
    ];
    for (const sel of selectors) {
        const el = document.querySelector(sel);
        if (el) return el;
    }
    return null;
}

// Check if element is visible
function isElementVisible(el) {
    if (!el) return false;
    const style = window.getComputedStyle(el);
    const rect = el.getBoundingClientRect();
    return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
}

// Observe DOM changes for dynamic Meet UI
const observer = new MutationObserver(() => setTimeout(checkMeetingState, 500));
observer.observe(document.body, { childList: true, subtree: true });

// Fallback interval
setInterval(checkMeetingState, 2000);

console.log("🔍 Meet content script loaded");
