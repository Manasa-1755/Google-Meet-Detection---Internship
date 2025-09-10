
let displayStream, micStream, mediaRecorder, chunks = [];
let ctx;
let recordMode = "audio+video"; // default
let recordingPopupEl = null;
let recordingTimerInterval = null;
let recordingStartTime = null;
let autoRecord = false; // true = auto, false = manual

// Helper: capture current tab 
function captureTab(video = true, audio = false) {
  return new Promise((resolve, reject) => {
    chrome.tabCapture.capture({ video, audio }, stream => {
      if (!stream) reject(chrome.runtime.lastError);
      else resolve(stream);
    });
  });
}

// Load auto/manual preference 
function initRecorder(){
  chrome.storage.local.get("meetAutoRecord", ({ meetAutoRecord }) => {
    autoRecord = meetAutoRecord ?? false;
    console.log(`📌 Auto-record is ${autoRecord ? "enabled" : "disabled"}`);

    // Only log, never start manually
    if(isMeetActive()) {
      console.log("📌 Meet detected on load.");
      if(autoRecord){
        console.log("📌 Auto-record enabled, starting recorder...");
        startMeetRecorder();
      } else {
        console.log("📌 Manual mode: waiting for START click...");
      }
    }
  });
}

// Initialize
initRecorder();

// Live "Recording + Timing" Popup
function showRecordingTimerPopup() {
  if (recordingPopupEl) return;

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

// Listen for popup commands
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.command === "save") {
    saveRecording();
    sendResponse({ status: "Saved" });
  } 
  else if(msg.command === "start") {
    startMeetRecorder(true); // pass manual=true
    sendResponse({ status: "Started" });
  } 
  else if(msg.command === "stop") {
    stopMeetRecorder();
    sendResponse({ status: "Stopped" });
  }
  return true;
});

// Meet detection hook 
function onMeetDetected() {
  if (autoRecord) {
    console.log("📌 Meet detected, auto-recording enabled. Starting recorder...");
    startMeetRecorder();
  } else {
    console.log("📌 Meet detected, manual mode. Waiting for user START click.");
  }
}

// Start recording 
async function startMeetRecorder(manual = false) {
  if (!autoRecord && !manual) {
    console.log("⚠️ Ignored auto start because manual mode is active.");
    return;
  }

  if (mediaRecorder && mediaRecorder.state === "recording") {
    console.warn("🎥 Already recording, ignoring duplicate start.");
    return;
  }

  function attachStopSharingHandler(stream) {
  if (!stream) return;
  stream.getTracks().forEach(track => {
    console.log(`📡 Attached onended handler to ${track.kind} track`);
    track.onended = () => {
      console.log("⏹ User clicked Stop sharing. Recording stopped.");
      stopMeetRecorder();
    };
  });
}


  try {
    recordMode = await new Promise(resolve => {
      chrome.storage.local.get("meetRecordMode", ({ meetRecordMode }) =>
        resolve(meetRecordMode || "audio+video")
      );
    });

    recordMode = recordMode.toLowerCase();

    if (mediaRecorder && mediaRecorder.state === "recording") {
      console.warn("🎥 Already recording");
      return;
    }

    console.log(`🎥 Starting recording in mode: ${recordMode.toUpperCase()}`);

    chunks = [];
    let finalStreamTracks = [];

    // Video only
    if (recordMode === "video") {
      try {
        displayStream = await navigator.mediaDevices.getDisplayMedia({
          video: { frameRate: 30 },
          audio: false
        });

        attachStopSharingHandler(displayStream);

        finalStreamTracks.push(...displayStream.getVideoTracks());
      } catch (error) {
        console.warn("User cancelled screen sharing");
        return;
      }
    }

    // Audio only 
    if (recordMode === "audio") {
      try {
        micStream = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true }
        });

        finalStreamTracks.push(...micStream.getAudioTracks());
      } catch (error) {
        console.warn("User denied microphone access");
        return;
      }
    }

    // Both 
    if (recordMode === "audio+video") {
      try {
        displayStream = await navigator.mediaDevices.getDisplayMedia({
          video: { frameRate: 30 },
          audio: true
        });

        attachStopSharingHandler(displayStream);
      } catch (err) {
        console.warn("❌ User cancelled screen share (audio+video).");
        return;
      }

      try {
        micStream = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true }
        });
      } catch (error) {
        console.warn("⚠️ User denied microphone access (audio+video).");
        return;
      }

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

      if (!finalStreamTracks.length) {
        console.warn("⚠️ No media tracks available, recording aborted.");
        return;
      }
    }

    const finalStream = new MediaStream(finalStreamTracks);
    const mimeType = MediaRecorder.isTypeSupported("video/webm;codecs=vp9,opus")
      ? "video/webm;codecs=vp9,opus"
      : "video/webm";

    mediaRecorder = new MediaRecorder(finalStream, { mimeType, bitsPerSecond: 3_000_000 });
    mediaRecorder.ondataavailable = e => { if (e.data.size) chunks.push(e.data); };

    mediaRecorder.start(1000);

    if(mediaRecorder && mediaRecorder.state === "recording"){
      console.log(`✅ Recording started (${recordMode.toUpperCase()})`);
      showRecordingTimerPopup();
      showRecordingPopup(`🎥 Recording started (${recordMode.toUpperCase()})`);
    } else{
      console.warn("Recording did not start properly.");
    }

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

  mediaRecorder.onstop = () => cleanup();
  mediaRecorder.stop();
  console.log(`⏹ Recording stopped (${recordMode.toUpperCase()})`);
  if(chunks.length){
    showRecordingPopup(`⏹ Recording stopped (${recordMode.toUpperCase()})`);
  }
}

// Save manually 
function saveRecording() {
  if (!chunks.length) {
    alert("No recording available to save.");
    console.log("⚠️ No recording data to save.");
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

// Cleanup 
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
    top: recordingPopupEl ? `${recordingPopupEl.offsetHeight + 30}px` : "20px",
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

  requestAnimationFrame(() => popup.style.opacity = "1");

  setTimeout(() => {
    popup.style.opacity = "0";
    setTimeout(() => popup.remove(), 400);
  }, 5000);

}

