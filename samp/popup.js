let mediaRecorder;
let recordedChunks = [];
let timerInterval;
let secondsElapsed = 0;

const startBtn = document.getElementById("startBtn");
const stopBtn  = document.getElementById("stopBtn");
const timerEl  = document.getElementById("timer");

let audioEl; // hidden audio element for playback
let tabStream, micStream;

// ----------------- Timer -----------------
function startTimer() {
  secondsElapsed = 0;
  timerEl.textContent = "00:00";
  timerInterval = setInterval(() => {
    secondsElapsed++;
    const minutes = String(Math.floor(secondsElapsed / 60)).padStart(2, "0");
    const seconds = String(secondsElapsed % 60).padStart(2, "0");
    timerEl.textContent = `${minutes}:${seconds}`;
  }, 1000);
}

function stopTimer() {
  clearInterval(timerInterval);
  timerEl.textContent = "00:00";
}

// ----------------- Start Recording -----------------
startBtn.addEventListener("click", () => {
  chrome.tabs.query({ active: true, currentWindow: true }, async ([tab]) => {
    if (!tab || !tab.url.includes("meet.google.com")) {
      return alert("Please open an active Google Meet tab");
    }

    chrome.tabCapture.capture({ audio: true, video: true }, async (capturedTabStream) => {
      if (!capturedTabStream) return alert("Failed to capture tab audio/video");

      tabStream = capturedTabStream;

      // Play tab audio live in popup
      audioEl = document.createElement("audio");
      audioEl.autoplay = true;
      audioEl.srcObject = tabStream;
      audioEl.style.display = "none";
      document.body.appendChild(audioEl);

      let finalStream;
      try {
        // Capture microphone
        micStream = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true },
          video: false
        });

        // Mix tab + mic audio
        const ctx = new AudioContext();
        const destination = ctx.createMediaStreamDestination();

        if (tabStream.getAudioTracks().length > 0) {
          const tabSource = ctx.createMediaStreamSource(tabStream);
          tabSource.connect(destination);
        }

        if (micStream.getAudioTracks().length > 0) {
          const micSource = ctx.createMediaStreamSource(micStream);
          micSource.connect(destination);
        }

        // Merge video + mixed audio
        finalStream = new MediaStream([
          ...tabStream.getVideoTracks(),
          ...destination.stream.getAudioTracks()
        ]);

      } catch (err) {
        console.warn("Mic capture failed, fallback to tab only:", err);
        finalStream = tabStream;
      }

      // Setup MediaRecorder
      mediaRecorder = new MediaRecorder(finalStream, { mimeType: "video/webm; codecs=vp8,opus" });
      recordedChunks = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) recordedChunks.push(e.data);
      };

      mediaRecorder.onstop = () => {
        stopTimer();

        const blob = new Blob(recordedChunks, { type: "video/webm" });
        const url = URL.createObjectURL(blob);
        const filename = `gmeet_recording_${Date.now()}.webm`;
        chrome.downloads.download({ url, filename });

        // Cleanup
        if (audioEl) {
          audioEl.pause();
          audioEl.srcObject = null;
          audioEl.remove();
          audioEl = null;
        }
        if (tabStream) tabStream.getTracks().forEach(t => t.stop());
        if (micStream) micStream.getTracks().forEach(t => t.stop());

        startBtn.disabled = false;
        stopBtn.disabled = true;
      };

      mediaRecorder.start();
      startBtn.disabled = true;
      stopBtn.disabled = false;
      startTimer();
    });
  });
});

// ----------------- Stop Recording -----------------
stopBtn.addEventListener("click", () => {
  if (mediaRecorder && mediaRecorder.state === "recording") {
    mediaRecorder.stop();
  }
});
