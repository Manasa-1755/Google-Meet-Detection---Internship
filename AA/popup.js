let mediaRecorder = null;
let recordedChunks = [];
let tabStream = null;

document.getElementById("startRecording").addEventListener("click", async () => {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const tabId = tabs[0].id;

    chrome.tabCapture.capture({ audio: false, video: true }, (stream) => {
      if (!stream) return console.error("Failed to capture tab");
      tabStream = stream;
      recordedChunks = [];

      mediaRecorder = new MediaRecorder(tabStream, { mimeType: "video/webm; codecs=vp8" });
      mediaRecorder.ondataavailable = e => { if (e.data.size) recordedChunks.push(e.data); };
      mediaRecorder.onstop = () => {
        const blob = new Blob(recordedChunks, { type: "video/webm" });
        const url = URL.createObjectURL(blob);
        chrome.downloads.download({ url, filename: `gmeet_recording_${Date.now()}.webm` });
      };

      mediaRecorder.start();
      console.log("Recording started");
    });
  });
});
