/// recorder.js – runs in a dedicated tab for recording
let mediaRecorder;
let recordedChunks = [];
let isRecording = false;
let timerInterval;
let recordingStartTime;
let isAutoRecord = false;

console.log("🎬 GMeet Recorder tab loaded");

// Listen for messages from popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log("📨 Recorder received:", message.action);

  if (message.action === "startRecording") {
    isAutoRecord = message.autoRecord || false;
    startRecording(message.tabId);
    sendResponse({ success: true });
  }

  if (message.action === "stopRecording") {
    stopRecording();
    sendResponse({ success: true });
  }

  return true;
});

async function startRecording(tabId) {
  console.log("🎬 Starting recording for tab:", tabId);

  if (isRecording) {
    console.log("⚠️ Already recording");
    return;
  }

  try {
    document.getElementById("status").textContent = "🟡 Starting recording...";

    // Capture the tab stream (video + audio)
    const tabStream = await new Promise((resolve, reject) => {
      chrome.tabCapture.capture({
        audio: true,
        video: true,
        audioConstraints: {
          mandatory: {
            chromeMediaSource: 'tab',
            chromeMediaSourceId: tabId,
            echoCancellation: true
          }
        },
        videoConstraints: {
          mandatory: {
            chromeMediaSource: 'tab',
            chromeMediaSourceId: tabId,
            minWidth: 1280,
            minHeight: 720,
            maxWidth: 1920,
            maxHeight: 1080,
            maxFrameRate: 30
          }
        }
      }, (stream) => {
        if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
        else if (!stream) reject(new Error("No tab stream returned"));
        else resolve(stream);
      });
    });

    console.log("✅ Tab stream captured:", tabStream.getTracks().length);

    let finalStream = tabStream;

    // Try to add mic audio
    try {
      const micStream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        video: false
      });

      const audioContext = new AudioContext();
      const destination = audioContext.createMediaStreamDestination();
      const tabSource = audioContext.createMediaStreamSource(new MediaStream(tabStream.getAudioTracks()));
      const micSource = audioContext.createMediaStreamSource(micStream);
      tabSource.connect(destination);
      micSource.connect(destination);

      finalStream = new MediaStream([...tabStream.getVideoTracks(), ...destination.stream.getAudioTracks()]);
      console.log("✅ Audio mixed successfully");
    } catch (micError) {
      console.warn("⚠️ Microphone unavailable, using tab audio only:", micError);
      finalStream = tabStream;
    }

    // Choose MIME type
    const mimeTypes = ['video/webm;codecs=vp9,opus','video/webm;codecs=vp8,opus','video/webm;codecs=h264,opus','video/webm'];
    let supportedType = mimeTypes.find(t => MediaRecorder.isTypeSupported(t)) || 'video/webm';

    mediaRecorder = new MediaRecorder(finalStream, {
      mimeType: supportedType,
      videoBitsPerSecond: 2500000,
      audioBitsPerSecond: 128000
    });

    recordedChunks = [];
    isRecording = true;
    recordingStartTime = Date.now();

    mediaRecorder.ondataavailable = e => {
      if (e.data.size > 0) recordedChunks.push(e.data);
    };

    mediaRecorder.onstop = () => {
      stopTimer();
      downloadRecording();
      cleanup();
    };

    mediaRecorder.onerror = e => {
      console.error("❌ MediaRecorder error:", e);
      document.getElementById("status").textContent = "❌ Recording error";
      cleanup();
    };

    mediaRecorder.start(1000);
    document.getElementById("status").textContent = isAutoRecord ? "🟢 Auto Recording..." : "🟢 Recording...";
    startTimer();

    await chrome.storage.local.set({ isRecording: true, recordingStartTime });
    chrome.runtime.sendMessage({ action: "recordingStarted" });
    console.log("✅ Recording started!");
  } catch (err) {
    console.error("❌ Recording start failed:", err);
    document.getElementById("status").textContent = "❌ Recording failed: " + err.message;
  }
}

function stopRecording() {
  if (mediaRecorder && isRecording) mediaRecorder.stop();
  else console.log("⚠️ No active recording");
}

function startTimer() {
  let seconds = 0;
  const timerEl = document.getElementById("timer");
  if (timerInterval) clearInterval(timerInterval);

  timerInterval = setInterval(() => {
    seconds++;
    const mins = String(Math.floor(seconds / 60)).padStart(2, "0");
    const secs = String(seconds % 60).padStart(2, "0");
    const timeStr = `${mins}:${secs}`;
    timerEl.textContent = timeStr;
    chrome.storage.local.set({ recordingTime: timeStr });
    chrome.runtime.sendMessage({ action: "timerUpdate", time: timeStr });
  }, 1000);
}

function stopTimer() {
  if (timerInterval) clearInterval(timerInterval);
  timerInterval = null;
}

function downloadRecording() {
  if (!recordedChunks.length) {
    document.getElementById("status").textContent = "❌ No recording data";
    return;
  }

  const blob = new Blob(recordedChunks, { type: 'video/webm' });
  const url = URL.createObjectURL(blob);
  const timestamp = new Date().toISOString().replace(/[:.]/g,'-').replace('T','_').split('Z')[0];
  const filename = `gmeet-recording-${timestamp}.webm`;

  chrome.downloads.download({ url, filename, saveAs: true }, downloadId => {
    if (chrome.runtime.lastError) fallbackDownload(blob, filename);
    else document.getElementById("status").textContent = "✅ Recording saved!";
  });
}

function fallbackDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 60000);
  document.getElementById("status").textContent = "✅ Recording saved!";
}

function cleanup() {
  isRecording = false;
  stopTimer();

  if (mediaRecorder?.stream) mediaRecorder.stream.getTracks().forEach(t => t.stop());
  recordedChunks = [];
  chrome.storage.local.remove(['isRecording','recordingTime','recordingStartTime']);
  chrome.runtime.sendMessage({ action: "recordingStopped" });
  document.getElementById("status").textContent = "✅ Recording completed";

  if (isAutoRecord) setTimeout(() => window.close(), 5000);
}

// Keep tab alive for auto-recording
setInterval(() => { if (isRecording) console.log("💓 Recorder alive"); }, 30000);
