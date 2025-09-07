let displayStream, micStream, mediaRecorder, chunks = [];
let ctx;
let recordMode = "audio+video"; // default
let recordingPopupEl = null;
let recordingTimerInterval = null;
let recordingStartTime = null;

// Live "Recording + Timing" Popup 
function showRecordingTimerPopup() {
  if (recordingPopupEl) return; // already shown

  recordingStartTime = Date.now();

  recordingPopupEl = document.createElement("div");
  Object.assign(recordingPopupEl.style, {
    position: "fixed",
    top: "20px",
    right: "20px",
    background: "#202124",
    color: "white",
    padding: "12px 18px",
    borderRadius: "8px",
    boxShadow: "0 4px 12px rgba(0,0,0,0.3)",
    fontSize: "14px",
    zIndex: "9999",
    opacity: "0",
    transition: "opacity 0.4s ease",
    fontFamily: "monospace"
  });

  document.body.appendChild(recordingPopupEl);

  requestAnimationFrame(() => recordingPopupEl.style.opacity = "1");

  // Update text every second
  recordingTimerInterval = setInterval(() => {
    const elapsed = Date.now() - recordingStartTime;
    const h = String(Math.floor(elapsed / 3600000)).padStart(2, "0");
    const m = String(Math.floor((elapsed % 3600000) / 60000)).padStart(2, "0");
    const s = String(Math.floor((elapsed % 60000) / 1000)).padStart(2, "0");
    recordingPopupEl.innerText = `🔴 Recording… ${h}:${m}:${s}`;
  }, 1000);
}

// Stop & remove recording popup 
function hideRecordingTimerPopup() {
  if (recordingTimerInterval) clearInterval(recordingTimerInterval);
  recordingTimerInterval = null;

  if (recordingPopupEl) {
    recordingPopupEl.style.opacity = "0";
    setTimeout(() => recordingPopupEl?.remove(), 400);
  }
  recordingPopupEl = null;
}


console.log(`🎥 Recorder initialized`);

// Listen for popup -> only "save"
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.command === "save") {
    saveRecording();
    sendResponse({ status: "Saved" });
  }
  return true;
});

// Start recording
async function startMeetRecorder() {
  try {
    recordMode = await new Promise(resolve => {
      chrome.storage.local.get("meetRecordMode", ({ meetRecordMode }) =>
        resolve(meetRecordMode || "audio+video")
      );
    });

    recordMode = recordMode.toLowerCase();

    console.log(`🎥 Auto-starting in mode: ${recordMode.toUpperCase()}`);

    if (mediaRecorder && mediaRecorder.state === "recording") {
      console.warn("🎥 Already recording");
      return;
    }

    showRecordingPopup();

    chunks = [];
    let finalStreamTracks = [];

    // Video only
    if (recordMode === "video") {
      displayStream = await navigator.mediaDevices.getDisplayMedia({
        video: { frameRate: 30 },
        audio: false
      });
      finalStreamTracks.push(...displayStream.getVideoTracks());
    }

    // Audio only
    if (recordMode === "audio") {
      micStream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true }
      });
      finalStreamTracks.push(...micStream.getAudioTracks());
    }

    // Both
    if (recordMode === "audio+video") {
      displayStream = await navigator.mediaDevices.getDisplayMedia({
        video: { frameRate: 30 },
        audio: true
      });

      micStream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true }
      });

      ctx = new (window.AudioContext || window.webkitAudioContext)();
      if (ctx.state === "suspended") await ctx.resume();
      const dest = ctx.createMediaStreamDestination();

      if (displayStream.getAudioTracks().length) {
        const tabSource = ctx.createMediaStreamSource(
          new MediaStream([displayStream.getAudioTracks()[0]])
        );
        tabSource.connect(dest);
      }

      if (micStream.getAudioTracks().length) {
        const micSource = ctx.createMediaStreamSource(
          new MediaStream([micStream.getAudioTracks()[0]])
        );
        micSource.connect(dest);
      }

      finalStreamTracks.push(...displayStream.getVideoTracks());
      finalStreamTracks.push(...dest.stream.getAudioTracks());
    }

    const finalStream = new MediaStream(finalStreamTracks);
    const mimeType = MediaRecorder.isTypeSupported("video/webm;codecs=vp9,opus")
      ? "video/webm;codecs=vp9,opus"
      : "video/webm";

    mediaRecorder = new MediaRecorder(finalStream, { mimeType, bitsPerSecond: 3_000_000 });
    mediaRecorder.ondataavailable = e => { if (e.data.size) chunks.push(e.data); };

    mediaRecorder.start(1000);

    console.log(`✅ Recording started automatically in mode (${recordMode.toUpperCase()})`);
    showRecordingPopup(`🎥 Recording started automatically in mode (${recordMode.toUpperCase()})`);

  } catch (err) {
    console.error("Recording start failed:", err);
    cleanup();
  }
}

// Stop recording 
async function stopMeetRecorder() {

  hideRecordingTimerPopup();
  if (!mediaRecorder || mediaRecorder.state !== "recording") {
    console.warn("No active recording to stop.");
    return;
  }
  mediaRecorder.stop();
  console.log(`⏹ Recording stopped automatically in mode (${recordMode.toUpperCase()}). Click Save in Chrome extension to download the recording.`);
  showRecordingPopup(`⏹ Recording stopped in mode (${recordMode.toUpperCase()})`);
}

// Save manually 
function saveRecording() {
  if (!chunks.length) {
    alert("No recording available to save.");
    return;
  }
  const blob = new Blob(chunks, { type: mediaRecorder?.mimeType || "video/webm" });
  const url = URL.createObjectURL(blob);
  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  const a = document.createElement("a");
  a.href = url;
  a.download = `meet-recording-${ts}.webm`;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 1000);
  console.log("💾 Recording saved.");
  showRecordingPopup("💾 Recording saved");
}

//  Cleanup 
function cleanup() {
  [displayStream, micStream].forEach(s => s?.getTracks().forEach(t => t.stop()));
  displayStream = micStream = null;
  if (ctx && ctx.state !== "closed") ctx.close();
  ctx = null;
}

// Popup notification 
function showRecordingPopup(message) {
  const popup = document.createElement("div");
  popup.innerText = message;
  Object.assign(popup.style, {
    position: "fixed",
    top: "20px",
    right: "20px",
    background: "#202124",
    color: "white",
    padding: "12px 18px",
    borderRadius: "8px",
    boxShadow: "0 4px 12px rgba(0,0,0,0.3)",
    fontSize: "14px",
    zIndex: "9999",
    opacity: "0",
    transition: "opacity 0.4s ease"
  });

  document.body.appendChild(popup);

  // fade in
  requestAnimationFrame(() => popup.style.opacity = "1");

  // auto remove after 5 sec
  setTimeout(() => {
    popup.style.opacity = "0";
    setTimeout(() => popup.remove(), 400);
  }, 5000);
}
