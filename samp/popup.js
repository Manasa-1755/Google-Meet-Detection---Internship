const startBtn = document.getElementById("startBtn");
const stopBtn = document.getElementById("stopBtn");
const statusDiv = document.getElementById("status");

let mediaRecorder;
let recordedChunks = [];

startBtn.addEventListener("click", async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  if (!tab.url.includes("https://meet.google.com")) {
    alert("This only works on Google Meet tabs.");
    return;
  }

  chrome.tabCapture.capture({ video: true, audio: true }, stream => {
    if (!stream) {
      alert("Failed to capture tab");
      return;
    }

    recordedChunks = [];
    mediaRecorder = new MediaRecorder(stream);

    mediaRecorder.ondataavailable = e => {
      if (e.data.size > 0) recordedChunks.push(e.data);
    };

    mediaRecorder.onstop = () => {
      const blob = new Blob(recordedChunks, { type: "video/webm" });
      const url = URL.createObjectURL(blob);
      chrome.downloads.download({ url, filename: `gmeet_recording_${Date.now()}.webm` });
      recordedChunks = [];
    };

    mediaRecorder.start();
    startBtn.disabled = true;
    stopBtn.disabled = false;
    statusDiv.textContent = "Recording...";
  });
});

stopBtn.addEventListener("click", () => {
  if (mediaRecorder && mediaRecorder.state === "recording") {
    mediaRecorder.stop();
    startBtn.disabled = false;
    stopBtn.disabled = true;
    statusDiv.textContent = "Recording stopped";
  }
});
