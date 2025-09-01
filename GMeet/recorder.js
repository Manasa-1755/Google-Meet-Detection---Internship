// recorder.js
let displayStream, micStream, mediaRecorder, chunks = [];
let ctx; // AudioContext (created on Start click)
let panel; // Floating control panel

// Recorder function
async function startMeetRecorder() {
  try {
    console.log("🎥 Recorder is starting");

    if (mediaRecorder && mediaRecorder.state === "recording") {
      console.warn("🎥 Recorder is already running...");
      return;
    }

    // 1) Capture Meet tab 
    displayStream = await navigator.mediaDevices.getDisplayMedia({
      video: { frameRate: 30 },
      audio: true
    }).catch(err => {
      throw new Error("Failed to capture display: " + err.message);
    });

    // 2) Capture microphone
    micStream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true }
    }).catch(err => {
      throw new Error("Failed to capture microphone: " + err.message);
    });

    // 3) Create AudioContext (only now, after button click)
    try {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      if (ctx.state === "suspended") {
        await ctx.resume();
      }
    } catch (err) {
      throw new Error("Failed to initialize audio context: " + err.message);
    }

    const dest = ctx.createMediaStreamDestination();

    // Add tab audio
    const tabAudioTracks = displayStream.getAudioTracks();
    if (tabAudioTracks.length) {
      const tabSource = ctx.createMediaStreamSource(new MediaStream([tabAudioTracks[0]]));
      tabSource.connect(dest);
    } 
    // Add mic audio
    const micAudioTracks = micStream.getAudioTracks();
    if (micAudioTracks.length) {
      const micSource = ctx.createMediaStreamSource(new MediaStream([micAudioTracks[0]]));
      micSource.connect(dest);
    }

    // 4) Combine video + mixed audio
    const finalStream = new MediaStream([
      ...displayStream.getVideoTracks(),
      ...dest.stream.getAudioTracks()
    ]);

    // 5) Start recording
    const mimeType = MediaRecorder.isTypeSupported("video/webm;codecs=vp9,opus")
      ? "video/webm;codecs=vp9,opus"
      : "video/webm";

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
    };

    mediaRecorder.onerror = (event) => {
      console.error("MediaRecorder error:", event);
      stopMeetRecorder();
      alert("Recording failed: " + event.error.message);
    };

    mediaRecorder.start(1000);
    console.log("🎥 Recording has started...");

  } catch (err) {
    console.error("Failed to start recording:", err);
    alert("Failed to start recording: " + err.message);
    // Cleanup any partially initialized streams
    if (displayStream) {
      displayStream.getTracks().forEach(track => track.stop());
    }
    if (micStream) {
      micStream.getTracks().forEach(track => track.stop());
    }
    if (ctx && ctx.state !== "closed") {
      await ctx.close();
    }
  }
}

async function stopMeetRecorder() {
  if (!mediaRecorder || mediaRecorder.state !== "recording") {
    console.warn("No active recording");
    return;
  }
  mediaRecorder.stop();

  [displayStream, micStream].forEach(s => {
    if (s) s.getTracks().forEach(t => t.stop());
  });

  if (ctx && ctx.state !== "closed") {
    await ctx.close();
  }

  console.log("🎥 Recording has stopped. \nFile will be downloaded now...");
}

// Floating UI - to start and stop recording
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

  const startBtn = document.createElement("button");
  startBtn.textContent = "▶️ Start Rec";
  Object.assign(startBtn.style, {
    margin: "5px", padding: "6px 12px", background: "#0b8043",
    color: "#fff", border: "none", borderRadius: "6px", cursor: "pointer"
  });
  startBtn.onclick = () => startMeetRecorder();

  const stopBtn = document.createElement("button");
  stopBtn.textContent = "⏹ Stop Rec";
  Object.assign(stopBtn.style, {
    margin: "5px", padding: "6px 12px", background: "#d93025",
    color: "#fff", border: "none", borderRadius: "6px", cursor: "pointer"
  });
  stopBtn.onclick = () => stopMeetRecorder();

  const statusIndicator = document.createElement("div");
  Object.assign(statusIndicator.style, {
    margin: "5px",
    padding: "4px 8px",
    borderRadius: "4px",
    fontSize: "12px",
    color: "#fff",
    display: "none"
  });
  panel.appendChild(statusIndicator);

  panel.appendChild(startBtn);
  panel.appendChild(stopBtn);
  document.body.appendChild(panel);

  console.log("🎥 Recorder panel added (floating top-right)");
}
  
// Only run on Meet pages
const pathParts = location.pathname.split("/").filter(Boolean);
if (pathParts.length === 1 && /^[a-z]{3}-[a-z]{4}-[a-z]{3}$/i.test(pathParts[0])) {
  createRecorderPanel();
}



