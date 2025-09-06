document.addEventListener("DOMContentLoaded", () => {
  const videoBtn = document.getElementById("videoBtn");
  const audioBtn = document.getElementById("audioBtn");
  const bothBtn = document.getElementById("bothBtn");

  const saveBtn = document.getElementById("save");
  const statusDiv = document.getElementById("status");

  let currentMode = "audio+video";

  // Load saved mode
  chrome.storage.local.get("meetRecordMode", ({ meetRecordMode }) => {
    if (meetRecordMode) setActiveMode(meetRecordMode);
    else setActiveMode("audio+video");
  });

  // Toggle mode handlers
  videoBtn.onclick = () => setActiveMode("video");
  audioBtn.onclick = () => setActiveMode("audio");
  bothBtn.onclick = () => setActiveMode("audio+video");

  function setActiveMode(mode) {
    currentMode = mode;
    chrome.storage.local.set({ meetRecordMode: mode });

    [videoBtn, audioBtn, bothBtn].forEach(btn => btn.classList.remove("active"));
    if (mode === "video") videoBtn.classList.add("active");
    if (mode === "audio") audioBtn.classList.add("active");
    if (mode === "audio+video") bothBtn.classList.add("active");

    // Push to localStorage inside the Meet tab
    chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
      chrome.scripting.executeScript({
        target: { tabId: tabs[0].id },
        func: mode => localStorage.setItem("meetRecordMode", mode),
        args: [mode]
      });
    });
  }

  // Save button
  saveBtn.onclick = () => sendCommand("save");

  function sendCommand(cmd) {
    chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
      chrome.tabs.sendMessage(tabs[0].id, { command: cmd }, response => {
        if (response?.status) statusDiv.textContent = response.status;
      });
    });
  }
});
