let mediaRecorder;
let recordedChunks = [];
let tabStream;
let audioEl;

chrome.runtime.onMessage.addListener((msg, sender) => {
  if (msg.type === "START_RECORDING") startRecording();
});

async function startRecording() {
  console.log("[Recorder] Capturing tab...");

  tabStream = await new Promise((resolve, reject) => {
    chrome.tabCapture.capture({ audio: true, video: true }, stream => {
      if (!stream) return reject("Tab capture failed");
      resolve(stream);
    });
  }).catch(err => { console.error("[Recorder]", err); return; });

  if (!tabStream) return;

  audioEl = document.createElement("audio");
  audioEl.autoplay = true;
  audioEl.srcObject = tabStream;
  audioEl.style.display = "none";
  document.body.appendChild(audioEl);

  recordedChunks = [];
  mediaRecorder = new MediaRecorder(tabStream, { mimeType: "video/webm; codecs=vp8,opus" });

  mediaRecorder.ondataavailable = e => { if (e.data.size) recordedChunks.push(e.data); };

  mediaRecorder.onstop = () => {
    const blob = new Blob(recordedChunks, { type: "video/webm" });
    const url = URL.createObjectURL(blob);
    chrome.downloads.download({ url, filename: `gmeet_recording_${Date.now()}.webm` });
    cleanup();
  };

  mediaRecorder.start();
  console.log("[Recorder] Recording started");
}

function cleanup() {
  if (audioEl) { try { audioEl.pause(); audioEl.srcObject = null; audioEl.remove(); } catch(e) {} audioEl = null; }
  if (tabStream) { tabStream.getTracks().forEach(t => t.stop()); tabStream = null; }
}
