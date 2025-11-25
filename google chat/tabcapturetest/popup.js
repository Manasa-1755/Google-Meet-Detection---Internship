// Elements
const startBtn = document.getElementById("startBtn");
const stopBtn = document.getElementById("stopBtn");
const preview = document.getElementById("preview");

// State
let mediaStream = null;
let mediaRecorder = null;
let chunks = [];

function setUI(capturing) {
  startBtn.disabled = capturing;
  stopBtn.disabled = !capturing;
}

function pickSupportedMimeType() {
  const candidates = [
    "video/webm;codecs=vp9,opus",
    "video/webm;codecs=vp8,opus",
    "video/webm",
  ];
  for (const type of candidates) {
    if (MediaRecorder.isTypeSupported(type)) return type;
  }
  return ""; // Let browser choose
}

startBtn.addEventListener("click", () => {
  setUI(true);
  chunks = [];

  const options = {
    audio: true,
    video: true,
  };

  chrome.tabCapture.capture(options, (stream) => {
    if (chrome.runtime.lastError || !stream) {
      console.error("Failed to capture tab:", chrome.runtime.lastError?.message);
      setUI(false);
      return;
    }

    mediaStream = stream;
    preview.srcObject = stream;

    const mimeType = pickSupportedMimeType();
    try {
      mediaRecorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
    } catch (e) {
      console.error("MediaRecorder init failed:", e);
      setUI(false);
      return;
    }

    mediaRecorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) {
        chunks.push(e.data);
      }
    };

    mediaRecorder.onstop = async () => {
      try {
        const blob = new Blob(chunks, { type: chunks[0]?.type || "video/webm" });
        const url = URL.createObjectURL(blob);
        const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
        const filename = `tab-recording-${timestamp}.webm`;

        chrome.downloads.download({ url, filename, saveAs: true }, () => {
          if (chrome.runtime.lastError) {
            console.error("Download failed:", chrome.runtime.lastError.message);
          }
          // Revoke later to ensure download picks it up
          setTimeout(() => URL.revokeObjectURL(url), 30_000);
        });
      } finally {
        // Cleanup tracks
        if (mediaStream) {
          mediaStream.getTracks().forEach(t => t.stop());
          mediaStream = null;
        }
        preview.srcObject = null;
        setUI(false);
      }
    };

    mediaRecorder.start(250); // gather data in chunks
  });
});

stopBtn.addEventListener("click", () => {
  if (mediaRecorder && mediaRecorder.state !== "inactive") {
    mediaRecorder.stop();
  } else if (mediaStream) {
    // Fallback: stop tracks and reset UI
    mediaStream.getTracks().forEach(t => t.stop());
    mediaStream = null;
    preview.srcObject = null;
    setUI(false);
  }
});