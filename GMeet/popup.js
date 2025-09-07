document.addEventListener("DOMContentLoaded", () => {
  const videoBtn = document.getElementById("videoBtn");
  const audioBtn = document.getElementById("audioBtn");
  const bothBtn = document.getElementById("bothBtn");

  const autoToggle = document.getElementById("autoToggle");
  const startBtn = document.getElementById("start");
  const stopBtn = document.getElementById("stop");
  const saveBtn = document.getElementById("save");
  const statusDiv = document.getElementById("status");

  let currentMode = "audio+video";

  // Load saved mode + auto setting
  chrome.storage.local.get(["meetRecordMode", "autoRecord"], ({ meetRecordMode, autoRecord }) => {
    if (meetRecordMode) setActiveMode(meetRecordMode);
    else setActiveMode("audio+video");

    autoToggle.checked = (autoRecord === undefined) ? true : autoRecord;
    updateUI();
  });

  // Mode buttons
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

    updateUI();
  }

  // Auto toggle
  autoToggle.onchange = () => {
    chrome.storage.local.set({ autoRecord: autoToggle.checked });
    updateUI();
  };

  function updateUI() {
    if (autoToggle.checked) {
      startBtn.style.display = "none";
      stopBtn.style.display = "none";
    } else {
      startBtn.style.display = "block";
      stopBtn.style.display = "block";
    }
  }

  // Manual buttons
  startBtn.onclick = () => sendCommand("start");
  stopBtn.onclick = () => sendCommand("stop");
  saveBtn.onclick = () => sendCommand("save");

  function sendCommand(cmd) {
    chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
      if(!tabs.length){
        statusDiv.textContent = "No active tab found.";
        return;
      }
      chrome.tabs.sendMessage(tabs[0].id, { command: cmd }, response => {
        if (response?.status) statusDiv.textContent = response.status;
      });
    });
  }
});
