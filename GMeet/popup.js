// WORKING CODE - STATUS
let activeTabId;
let isRecording = false;
let autoRecordEnabled = false;

// Check current tab on popup open
document.addEventListener("DOMContentLoaded", async () => {
  console.log("🔍 Popup opened - checking tab...");

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    if (tab && tab.url && isMeetTab(tab.url)) {
      activeTabId = tab.id;
      console.log("✅ Google Meet tab detected:", activeTabId);

      // Check meeting status
      chrome.tabs.sendMessage(activeTabId, { action: "checkMeetingStatus" }, (response) => {
        if (response) updateMeetingStatusUI(response.isInMeeting, response.recording);
      });
    }

    // Check current recording status and permission
    await checkRecordingStatus();
    await checkAutoRecordPermission();

  } catch (error) {
    console.error("❌ Error checking tab:", error);
  }
});

function isMeetTab(url) {
  return url && url.includes("meet.google.com");
}

// ------------------ UI UPDATE ------------------
function updateMeetingStatusUI(isInMeeting, isRecordingFlag) {
  const statusElement = document.getElementById("status");

  if (isInMeeting) {
    statusElement.textContent = isRecordingFlag ? "🟢 In Meet - Recording..." : "🟡 In Meet - Ready to Record";
    statusElement.style.color = isRecordingFlag ? "#4CAF50" : "#FF9800";
  } else {
    statusElement.textContent = "⚪ Not in Meeting";
    statusElement.style.color = "#9E9E9E";
  }
}

function updateUIForRecording(recordingTime) {
  document.getElementById("startBtn").disabled = true;
  document.getElementById("stopBtn").disabled = autoRecordEnabled; // Disabled in auto mode
  document.getElementById("timer").textContent = recordingTime;
  document.getElementById("status").textContent = "🟢 Recording in background...";
  document.getElementById("startBtn").textContent = "Recording...";
  document.getElementById("startBtn").style.backgroundColor = "#666";
  document.getElementById("stopBtn").style.backgroundColor = autoRecordEnabled ? "#666" : "#f44336";
}

function updateUIForReady() {
  document.getElementById("startBtn").disabled = !activeTabId;
  document.getElementById("stopBtn").disabled = true;
  document.getElementById("timer").textContent = "00:00";

  if (activeTabId) {
    document.getElementById("status").textContent = "✅ Ready to record";
  } else {
    document.getElementById("status").textContent = "❌ Please open Google Meet";
  }

  document.getElementById("startBtn").textContent = "Start Recording";
  document.getElementById("startBtn").style.backgroundColor = activeTabId ? "#4CAF50" : "#666";
  document.getElementById("stopBtn").style.backgroundColor = "#666";
}

// ------------------ AUTO RECORD PERMISSION ------------------
async function checkAutoRecordPermission() {
  return new Promise((resolve) => {
    chrome.storage.local.get(['autoRecordPermission'], (result) => {
      autoRecordEnabled = result.autoRecordPermission || false;
      
      console.log("🔄 DEBUG - Storage value:", result.autoRecordPermission);
      console.log("🔄 DEBUG - autoRecordEnabled:", autoRecordEnabled);

      updateToggleUI();

      resolve(autoRecordEnabled);
    });
  });
}

// NEW FUNCTION: Update toggle UI dynamically
function updateToggleUI() {
  const toggle = document.getElementById('autoRecordToggle');
  const label = document.getElementById('toggleLabel');
  const permissionText = document.getElementById('permissionText');
  
  console.log("🔄 DEBUG - Updating toggle UI to:", autoRecordEnabled);
  console.log("🔄 DEBUG - Toggle element:", toggle);
  console.log("🔄 DEBUG - Label element:", label);
  
  if (toggle) {
    toggle.checked = autoRecordEnabled;
    console.log("🔄 DEBUG - Toggle checked set to:", toggle.checked);
  }
  if (label) {
    label.textContent = autoRecordEnabled ? 'ON' : 'OFF';
    label.style.color = autoRecordEnabled ? '#ffffff' : '#ffffff';
    label.style.fontWeight = 'bold';
    console.log("🔄 DEBUG - Label set to:", label.textContent);
  }
  if (permissionText) {
    permissionText.textContent = autoRecordEnabled 
      ? 'Auto recording enabled - meetings will be recorded automatically' 
      : 'Manually record when joining meetings';
    permissionText.style.color = autoRecordEnabled ? '#ffffff' : '#ffffff';
  }
}

// NEW: Listen for storage changes to update toggle in real-time
chrome.storage.onChanged.addListener((changes, namespace) => {
  if (namespace === 'local' && changes.autoRecordPermission) {
    console.log("🔄 Storage change detected for autoRecordPermission:", changes.autoRecordPermission.newValue);
    autoRecordEnabled = changes.autoRecordPermission.newValue;
    updateToggleUI();
    
    // Also update stop button state based on auto-record
    const stopBtn = document.getElementById('stopBtn');
    if (stopBtn && isRecording) {
      stopBtn.disabled = autoRecordEnabled;
      stopBtn.style.backgroundColor = autoRecordEnabled ? "#666" : "#f44336";
    }
  }
});

document.getElementById('autoRecordToggle').addEventListener('change', async (e) => {
  const enabled = e.target.checked;

  if (enabled) {
    const confirmed = confirm("Enable Auto Recording?\nAutomatically start recording when you join Meet and stop when you leave.");
    if (confirmed) {
      await chrome.runtime.sendMessage({ action: "grantAutoRecordPermission" });
      autoRecordEnabled = true;
    } else { 
      e.target.checked = false; 
      updateToggleUI(); // Reset UI if user cancels
      return; 
    }
    
    document.getElementById('stopBtn').disabled = true;
    document.getElementById('stopBtn').style.backgroundColor = "#666";

  } else {
    await chrome.runtime.sendMessage({ action: "revokeAutoRecordPermission" });
    autoRecordEnabled = false;

    document.getElementById('stopBtn').disabled = false;
    document.getElementById('stopBtn').style.backgroundColor = "#f44336";
  }
  
  updateToggleUI(); // Update UI immediately after toggle change
  updateUIForReady();
});


// ------------------ RECORDING ------------------
async function checkRecordingStatus() {
  const result = await chrome.storage.local.get(['isRecording', 'recordingTime']);
  isRecording = result.isRecording || false;

  // 🆕 CHECK IF RECORDING WAS STOPPED BY TAB CLOSURE
  if (result.recordingStoppedByTabClose) {
    console.log("🔄 Recording was stopped by tab closure - resetting UI");
    isRecording = false;
    // Clean up the flag
    chrome.storage.local.remove(['recordingStoppedByTabClose']);
  }

  if (isRecording) updateUIForRecording(result.recordingTime || "00:00");
  else updateUIForReady();
}

// Start Recording manually
document.getElementById("startBtn").addEventListener("click", async () => {
  if (!activeTabId) return alert("❌ Please open Google Meet first");

  document.getElementById("startBtn").disabled = true;
  document.getElementById("startBtn").textContent = "Starting...";
  document.getElementById("status").textContent = "🟡 Starting recording...";

  // 🆕 Notify content script about manual recording start
  chrome.tabs.sendMessage(activeTabId, { action: "manualRecordingStarted" });

  chrome.tabs.create({ url: chrome.runtime.getURL("recorder.html"), active: false }, (tab) => {
    setTimeout(() => {
      chrome.tabs.sendMessage(tab.id, { action: "startRecording", tabId: activeTabId });
    }, 1000);
  });
});

// Stop Recording manually  
document.getElementById("stopBtn").addEventListener("click", async () => {
  // 🆕 Notify content script about manual recording stop
  if (activeTabId) {
    chrome.tabs.sendMessage(activeTabId, { action: "manualRecordingStopped" });
  }
  stopRecordingAndDownload();
});

// ------------------ HELPER: Stop + Download ------------------
async function stopRecordingAndDownload() {
  document.getElementById("stopBtn").disabled = true;
  document.getElementById("stopBtn").textContent = "Stopping...";
  document.getElementById("status").textContent = "🟡 Stopping recording...";

  const tabs = await chrome.tabs.query({ url: chrome.runtime.getURL("recorder.html") });
  if (tabs.length > 0) {
    chrome.tabs.sendMessage(tabs[0].id, { action: "stopRecording" });
  } else {
    // 🆕 ENSURE UI RESETS EVEN IF RECORDER TAB NOT FOUND
    await chrome.storage.local.remove(['isRecording', 'recordingTime','recordingStoppedByTabClose']);
    isRecording = false;
    updateUIForReady();
  }
}

// ------------------ LISTEN FOR MESSAGES ------------------
chrome.runtime.onMessage.addListener((message) => {
  if (message.action === "timerUpdate") document.getElementById("timer").textContent = message.time;

  if (message.action === "recordingStarted") {
    isRecording = true;
    updateUIForRecording("00:00");
  }

  if (message.action === "recordingStopped") {
    isRecording = false;
    updateUIForReady();
  }

  if (message.action === "autoStopRecording") {
    stopRecordingAndDownload();
  }
});


// Listen for storage changes (when recorder tab closes)
chrome.storage.onChanged.addListener((changes, namespace) => {
  if (namespace === 'local' && changes.recordingStoppedByTabClose) {
    if (changes.recordingStoppedByTabClose.newValue === true) {
      console.log("🔄 Recorder tab closed - resetting UI");
      isRecording = false;
      updateUIForReady();
      
      // Clean up the flag
      chrome.storage.local.remove(['recordingStoppedByTabClose']);
    }
  }

  // Also reset when isRecording becomes false
  if (namespace === 'local' && changes.isRecording) {
    if (changes.isRecording.newValue === false) {
      console.log("🔄 Recording stopped - resetting UI");
      isRecording = false;
      updateUIForReady();
    }
  }

  // Handle autoRecordPermission changes
  if (namespace === 'local' && changes.autoRecordPermission) {
    console.log("🔄 Storage change detected for autoRecordPermission:", changes.autoRecordPermission.newValue);
    autoRecordEnabled = changes.autoRecordPermission.newValue;
    updateToggleUI();
  }
});

// ------------------ POPUP TOOLTIP ------------------
document.addEventListener('DOMContentLoaded', () => {
  const toggleContainer = document.querySelector('.permission-toggle');
  toggleContainer.title = "Automatically start/stop recording when joining/leaving Google Meet calls";
  document.getElementById('startBtn').title = "Manually start recording current Meet tab";
  document.getElementById('stopBtn').title = "Stop recording and download the video";
});

// ------------------ AUTO STOP DETECTION ------------------
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (tabId === activeTabId && changeInfo.status === "complete" && autoRecordEnabled && isRecording) {
    chrome.scripting.executeScript({
      target: { tabId: activeTabId },
      files: ["content.js"]
    });
  }
});


/*
let activeTabId;
let isRecording = false;
let autoRecordEnabled = false;

// Check current tab on popup open
document.addEventListener("DOMContentLoaded", async () => {
  console.log("🔍 Popup opened - checking tab...");

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    if (tab && tab.url && isMeetTab(tab.url)) {
      activeTabId = tab.id;
      console.log("✅ Google Meet tab detected:", activeTabId);

      // Check meeting status
      chrome.tabs.sendMessage(activeTabId, { action: "checkMeetingStatus" }, (response) => {
        if (response) updateMeetingStatusUI(response.isInMeeting, response.recording);
      });
    }

    // Check current recording status and permission
    await checkRecordingStatus();
    await checkAutoRecordPermission();

  } catch (error) {
    console.error("❌ Error checking tab:", error);
  }
});

function isMeetTab(url) {
  return url && url.includes("meet.google.com");
}

// ------------------ UI UPDATE ------------------
function updateMeetingStatusUI(isInMeeting, isRecordingFlag) {
  const statusElement = document.getElementById("status");

  if (isInMeeting) {
    statusElement.textContent = isRecordingFlag ? "🟢 In Meet - Recording..." : "🟡 In Meet - Ready to Record";
    statusElement.style.color = isRecordingFlag ? "#4CAF50" : "#FF9800";
  } else {
    statusElement.textContent = "⚪ Not in Meeting";
    statusElement.style.color = "#9E9E9E";
  }
}

function updateUIForRecording(recordingTime) {
  document.getElementById("startBtn").disabled = true;
  document.getElementById("stopBtn").disabled = autoRecordEnabled; // Disabled in auto mode
  document.getElementById("timer").textContent = recordingTime;
  document.getElementById("status").textContent = "🟢 Recording in background...";
  document.getElementById("startBtn").textContent = "Recording...";
  document.getElementById("warning").style.display = "block";
  document.getElementById("startBtn").style.backgroundColor = "#666";
  document.getElementById("stopBtn").style.backgroundColor = autoRecordEnabled ? "#666" : "#f44336";
}

function updateUIForReady() {
  document.getElementById("startBtn").disabled = !activeTabId;
  document.getElementById("stopBtn").disabled = true;
  document.getElementById("timer").textContent = "00:00";

  if (activeTabId) {
    document.getElementById("status").textContent = "✅ Ready to record";
  } else {
    document.getElementById("status").textContent = "❌ Please open Google Meet";
  }

  document.getElementById("startBtn").textContent = "Start Recording";
  document.getElementById("warning").style.display = activeTabId ? "block" : "none";
  document.getElementById("startBtn").style.backgroundColor = activeTabId ? "#4CAF50" : "#666";
  document.getElementById("stopBtn").style.backgroundColor = "#666";
}

// ------------------ AUTO RECORD PERMISSION ------------------
async function checkAutoRecordPermission() {
  const result = await chrome.storage.local.get(['autoRecordPermission']);
  autoRecordEnabled = result.autoRecordPermission || false;

  document.getElementById('autoRecordToggle').checked = autoRecordEnabled;
  document.getElementById('toggleLabel').textContent = autoRecordEnabled ? 'ON' : 'OFF';
  document.getElementById('permissionText').textContent = autoRecordEnabled
    ? 'Auto recording enabled ✅'
    : 'Automatically record when joining meetings';
}

document.getElementById('autoRecordToggle').addEventListener('change', async (e) => {
  const enabled = e.target.checked;

  if (enabled) {
    const confirmed = confirm("Enable Auto Recording?\nAutomatically start recording when you join Meet and stop when you leave.");
    if (confirmed) {
      await chrome.runtime.sendMessage({ action: "grantAutoRecordPermission" });
      autoRecordEnabled = true;
    } else { e.target.checked = false; return; }
  } else {
    await chrome.runtime.sendMessage({ action: "revokeAutoRecordPermission" });
    autoRecordEnabled = false;
  }
  updateUIForReady();
});

// ------------------ RECORDING ------------------
async function checkRecordingStatus() {
  const result = await chrome.storage.local.get(['isRecording', 'recordingTime']);
  isRecording = result.isRecording || false;

  if (isRecording) updateUIForRecording(result.recordingTime || "00:00");
  else updateUIForReady();
}

// Start Recording manually
document.getElementById("startBtn").addEventListener("click", async () => {
  if (!activeTabId) return alert("❌ Please open Google Meet first");

  document.getElementById("startBtn").disabled = true;
  document.getElementById("startBtn").textContent = "Starting...";
  document.getElementById("status").textContent = "🟡 Starting recording...";

  chrome.tabs.create({ url: chrome.runtime.getURL("recorder.html"), active: false }, (tab) => {
    setTimeout(() => {
      chrome.tabs.sendMessage(tab.id, { action: "startRecording", tabId: activeTabId });
    }, 1000);
  });
});

// Stop Recording manually
document.getElementById("stopBtn").addEventListener("click", async () => {
  stopRecordingAndDownload();
});

// ------------------ HELPER: Stop + Download ------------------
async function stopRecordingAndDownload() {
  document.getElementById("stopBtn").disabled = true;
  document.getElementById("stopBtn").textContent = "Stopping...";
  document.getElementById("status").textContent = "🟡 Stopping recording...";

  const tabs = await chrome.tabs.query({ url: chrome.runtime.getURL("recorder.html") });
  if (tabs.length > 0) {
    chrome.tabs.sendMessage(tabs[0].id, { action: "stopRecording" });
  } else {
    await chrome.storage.local.remove(['isRecording', 'recordingTime']);
    updateUIForReady();
  }
}

// ------------------ LISTEN FOR MESSAGES ------------------
chrome.runtime.onMessage.addListener((message) => {
  if (message.action === "timerUpdate") document.getElementById("timer").textContent = message.time;

  if (message.action === "recordingStarted") {
    isRecording = true;
    updateUIForRecording("00:00");
  }

  if (message.action === "recordingStopped") {
    isRecording = false;
    updateUIForReady();
  }

  if (message.action === "autoStopRecording") {
    stopRecordingAndDownload();
  }
});

// ------------------ POPUP TOOLTIP ------------------
document.addEventListener('DOMContentLoaded', () => {
  const toggleContainer = document.querySelector('.permission-toggle');
  toggleContainer.title = "Automatically start/stop recording when joining/leaving Google Meet calls";

  document.getElementById('startBtn').title = "Manually start recording current Meet tab";
  document.getElementById('stopBtn').title = "Stop recording and download the video";
});

// ------------------ AUTO STOP DETECTION ------------------
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (tabId === activeTabId && changeInfo.status === "complete" && autoRecordEnabled && isRecording) {
    chrome.scripting.executeScript({
      target: { tabId: activeTabId },
      files: ["content.js"]
    });
  }
});
*/


