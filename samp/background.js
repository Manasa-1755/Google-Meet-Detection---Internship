let mediaRecorder;
let recordedChunks = [];
let isRecording = false;

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.command === "start") {
    if (isRecording) {
      sendResponse({ status: "Already recording" });
      return;
    }

    chrome.tabCapture.capture({ video: true, audio: true }, stream => {
      if (!stream) {
        sendResponse({ status: "Failed to capture tab" });
        return;
      }

      recordedChunks = [];
      mediaRecorder = new MediaRecorder(stream);

      mediaRecorder.ondataavailable = e => {
        if (e.data.size > 0) recordedChunks.push(e.data);
      };

      mediaRecorder.onstop = saveRecording;

      mediaRecorder.start();
      isRecording = true;
      chrome.storage.local.set({ isRecording: true });
      sendResponse({ status: "Recording started" });
    });
    return true; // async response
  }

  if (msg.command === "stop") {
    if (!isRecording || !mediaRecorder) {
      sendResponse({ status: "Not recording" });
      return;
    }

    mediaRecorder.stop();
    isRecording = false;
    chrome.storage.local.set({ isRecording: false });
    sendResponse({ status: "Recording stopped" });
  }
});

function saveRecording() {
  const blob = new Blob(recordedChunks, { type: "video/webm" });
  const url = URL.createObjectURL(blob);
  const filename = `gmeet_recording_${Date.now()}.webm`;

  chrome.downloads.download({ url, filename });
  recordedChunks = [];
}
