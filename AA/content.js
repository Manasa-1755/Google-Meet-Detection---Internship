let popupEl;
let recordingStarted = false;
let timerEl = null;
let timerInterval = null;
let recordStartTime = null;

function createPopup() {
  if (popupEl) return;
  popupEl = document.createElement("div");
  popupEl.innerText = "Start Recording";
  Object.assign(popupEl.style, {
    position: "fixed",
    top: "60px",
    right: "20px",
    background: "#0f9d58",
    color: "#fff",
    padding: "10px 15px",
    borderRadius: "8px",
    fontSize: "14px",
    cursor: "pointer",
    zIndex: 9999
  });
  document.body.appendChild(popupEl);

  popupEl.addEventListener("click", () => {
    chrome.runtime.sendMessage({ type: "START_RECORDING" });
    popupEl.style.display = "none";
    recordingStarted = true;

    // Start floating timer
    showTimer();
  });
}

function showTimer() {
  if (timerEl) return;
  timerEl = document.createElement("div");
  timerEl.innerText = "Recording: 00:00";
  Object.assign(timerEl.style, {
    position: "fixed",
    top: "20px",
    right: "20px",
    background: "#202124",
    color: "#fff",
    padding: "10px 15px",
    borderRadius: "8px",
    fontSize: "14px",
    zIndex: 9999
  });
  document.body.appendChild(timerEl);

  recordStartTime = Date.now();
  timerInterval = setInterval(updateTimer, 1000);
}

function updateTimer() {
  if (!recordStartTime || !timerEl) return;
  const elapsed = Math.floor((Date.now() - recordStartTime) / 1000);
  const minutes = String(Math.floor(elapsed / 60)).padStart(2, "0");
  const seconds = String(elapsed % 60).padStart(2, "0");
  timerEl.innerText = `Recording: ${minutes}:${seconds}`;
}

function hideTimer() {
  if (timerEl) timerEl.remove();
  timerEl = null;
  if (timerInterval) clearInterval(timerInterval);
  timerInterval = null;
  recordStartTime = null;
}

// Meeting detection
function isMeetingActive() {
  return document.querySelector('[aria-label^="Leave call"], [aria-label^="Leave meeting"]');
}

let meetingStarted = false;
function checkMeeting() {
  const active = isMeetingActive();

  if (active && !meetingStarted) {
    meetingStarted = true;
    console.log("[Meet Detector] Meeting started at", new Date().toLocaleTimeString());
    createPopup();
  } else if (!active && meetingStarted) {
    meetingStarted = false;
    console.log("[Meet Detector] Meeting ended at", new Date().toLocaleTimeString());
    hideTimer();
    recordingStarted = false;
    if (popupEl) popupEl.style.display = "none";
  }
}

const observer = new MutationObserver(checkMeeting);
observer.observe(document.body, { childList: true, subtree: true, attributes: true });
setInterval(checkMeeting, 3000);
