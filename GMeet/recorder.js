
let displayStream, micStream, mediaRecorder, chunks = [];
let ctx;
let panel;
let recordMode = localStorage.getItem("meetRecordMode") || "both";
let statusIndicator;

// Start Recorder
async function startMeetRecorder() {
  try {
    console.log(`🎥 Recorder is in mode: ${recordMode.toUpperCase()}`);

    if (mediaRecorder && mediaRecorder.state === "recording") {
      console.warn(`🎥 Recorder is already running in mode: ${recordMode.toUpperCase()}`);
      return;
    }


    let finalStreamTracks = [];

    if (recordMode === "video" || recordMode === "both") {
      displayStream = await navigator.mediaDevices.getDisplayMedia({
        video: { frameRate: 30 },
        audio: recordMode === "both" ? true : false
      }).catch(err => { throw new Error("Display capture failed: " + err.message); });

      finalStreamTracks.push(...displayStream.getVideoTracks());
    }

    if (recordMode === "audio" || recordMode === "both") {
      micStream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true }
      }).catch(err => { throw new Error("Mic capture failed: " + err.message); });
    }

    if (recordMode !== "video") {
      try { ctx = new (window.AudioContext || window.webkitAudioContext)(); if (ctx.state === "suspended") await ctx.resume(); }
      catch (err) { throw new Error("AudioContext init failed: " + err.message); }

      const dest = ctx.createMediaStreamDestination();

      if (displayStream?.getAudioTracks().length && recordMode === "both") {
        const tabSource = ctx.createMediaStreamSource(new MediaStream([displayStream.getAudioTracks()[0]]));
        tabSource.connect(dest);
      }

      if (micStream?.getAudioTracks().length) {
        const micSource = ctx.createMediaStreamSource(new MediaStream([micStream.getAudioTracks()[0]]));
        micSource.connect(dest);
      }

      finalStreamTracks.push(...dest.stream.getAudioTracks());
    }

    const finalStream = new MediaStream(finalStreamTracks);

    const mimeType = MediaRecorder.isTypeSupported("video/webm;codecs=vp9,opus") ?
      "video/webm;codecs=vp9,opus" : "video/webm";

    mediaRecorder = new MediaRecorder(finalStream, { mimeType, bitsPerSecond: 3_000_000 });
    chunks = [];

    mediaRecorder.ondataavailable = e => { if (e.data.size) chunks.push(e.data); };
    mediaRecorder.onstop = () => {
      const blob = new Blob(chunks, { type: mediaRecorder.mimeType || "video/webm" });
      const url = URL.createObjectURL(blob);
      const ts = new Date().toISOString().replace(/[:.]/g, "-");
      const a = document.createElement("a");
      a.href = url;
      a.download = `meet-recording-${ts}.webm`;
      document.body.appendChild(a);
      a.click();
      setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 1000);
      updateStatus(false);
    };

    mediaRecorder.onerror = (event) => {
      console.error(`Recorder error in mode: ${recordMode.toUpperCase()}`, event);
      stopMeetRecorder();
      alert("Recording failed: " + event.error.message);
      updateStatus(false);
    };

    mediaRecorder.start(1000);
    console.log(`%c🎥 Recording has started in the mode: ${recordMode.toUpperCase()}`, "color: green; font-weight: bold;");
    updateStatus(true);
  } catch (err) {
    console.error("Recording start failed:", err);
    alert("Failed: " + err.message);
    [displayStream, micStream].forEach(s => s?.getTracks().forEach(t => t.stop()));
    if (ctx && ctx.state !== "closed") await ctx.close();
    updateStatus(false);
  }
}

// Stop Recorder
async function stopMeetRecorder() {
  if (!mediaRecorder || mediaRecorder.state !== "recording") {
    console.warn(`No recording in progress for mode: ${recordMode.toUpperCase()}`);
    return;
  }
  mediaRecorder.stop();
  [displayStream, micStream].forEach(s => s?.getTracks().forEach(t => t.stop()));
  if (ctx && ctx.state !== "closed") await ctx.close();
  console.log(`%c🎥 Recording stopped for mode: ${recordMode.toUpperCase()}`, "color: #ef392cff; font-weight: bold;");
  updateStatus(false);
}

// Update status indicator 
function updateStatus(isRecording) {
  if (!statusIndicator) return;
  statusIndicator.textContent = `Mode: ${recordMode.toUpperCase()} | ${isRecording ? "Recording ⬤" : "Idle ○"}`;
  statusIndicator.style.color = isRecording ? "#0b8043" : "#fff";
}
function createRecorderPanel() {
  if (panel) return;

  panel = document.createElement("div");
  Object.assign(panel.style, {
    position: "fixed",
    top: "10px",
    right: "10px",
    zIndex: 9999,
    background: "#202124",
    padding: "10px",
    borderRadius: "8px",
    boxShadow: "0 2px 6px rgba(0,0,0,0.3)"
  });

// Status indicator
statusIndicator = document.createElement("div");
Object.assign(statusIndicator.style, { margin: "5px", fontSize: "12px", color: "#fff" });
panel.appendChild(statusIndicator);
updateStatus(false);

// Dropdown for mode selection  
const select = document.createElement("select");
["video", "audio", "both"].forEach(mode => {
  const option = document.createElement("option");
  option.value = mode;
  option.textContent = mode.charAt(0).toUpperCase() + mode.slice(1);
  if (mode === recordMode) option.selected = true;
  select.appendChild(option);
});
Object.assign(select.style, { margin: "5px", padding: "4px 8px", borderRadius: "6px", cursor: "pointer" });

select.onchange = () => {
  recordMode = select.value;
  localStorage.setItem("meetRecordMode", recordMode);
  updateStatus(mediaRecorder?.state === "recording");
};

panel.appendChild(select);

// Start / Stop buttons

const startBtn = document.createElement("button");
startBtn.textContent = "▶️ Start";
Object.assign(startBtn.style, { margin: "5px", padding: "6px 12px", background: "#1a73e8", color: "#fff", border: "none", borderRadius: "6px", cursor: "pointer", transition: "all 0.2s ease", // smoother transition
boxShadow: "0 2px 4px rgba(0,0,0,0.3)" });

startBtn.onmouseover = () => {
  startBtn.style.transform = "scale(1.1)"; 
  startBtn.style.boxShadow = "0 4px 8px rgba(0,0,0,0.4)"; 
  startBtn.style.backgroundColor = "#1669c1"; 
};
startBtn.onmouseout = () => {
  startBtn.style.transform = "scale(1)";
  startBtn.style.boxShadow = "0 2px 4px rgba(0,0,0,0.3)";
  startBtn.style.backgroundColor = "#1a73e8";
};

startBtn.onclick = () => startMeetRecorder();

const stopBtn = document.createElement("button");
stopBtn.textContent = "⏹ Stop";
Object.assign(stopBtn.style, { margin: "5px", padding: "6px 12px", background: "#d93025", color: "#fff", border: "none", borderRadius: "6px", cursor: "pointer", transition: "all 0.2s ease",
boxShadow: "0 2px 4px rgba(0,0,0,0.3)" });

stopBtn.onmouseover = () => {
  stopBtn.style.transform = "scale(1.1)";
  stopBtn.style.boxShadow = "0 4px 8px rgba(0,0,0,0.4)";
  stopBtn.style.backgroundColor = "#b92b20"; 
};
stopBtn.onmouseout = () => {
  stopBtn.style.transform = "scale(1)";
  stopBtn.style.boxShadow = "0 2px 4px rgba(0,0,0,0.3)";
  stopBtn.style.backgroundColor = "#d93025";
};

stopBtn.onclick = () => stopMeetRecorder();

panel.appendChild(startBtn);
panel.appendChild(stopBtn);

document.body.appendChild(panel);
console.log("🎥 Recorder panel added");

}


// Run only on Meet
let panelCreated = false;

// Check if currently in an active meeting 
function isMeetActive() {
  const pathParts = location.pathname.split("/").filter(Boolean);
  const isMeetingCode = pathParts.length === 1 && /^[a-z]{3}-[a-z]{4}-[a-z]{3}$/i.test(pathParts[0]);
  const leaveButton = document.querySelector('[aria-label^="Leave call"], [aria-label^="Leave meeting"]');
  return isMeetingCode && leaveButton;
}

//  Monitor for meeting join/leave dynamically 
const meetObserver = new MutationObserver(() => {
  if (isMeetActive() && !panelCreated) {
    createRecorderPanel();
    panelCreated = true;
  } else if (!isMeetActive() && panelCreated) {
    panel?.remove();
    panel = null;
    panelCreated = false;
  }
});

// Observe changes to the body (any DOM changes)
meetObserver.observe(document.body, { childList: true, subtree: true });

// Also run immediately on page load
if (isMeetActive()) {
  createRecorderPanel();
  panelCreated = true;
}
