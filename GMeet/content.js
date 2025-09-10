(function () {
  let meetingStarted = false;
  let startTime = null;
  let endTime = null;

  // Utils
  function getCurrentTime() {
    return new Date().toLocaleTimeString();
  }
  function formatDuration(ms) {
    let totalSeconds = Math.floor(ms / 1000);
    let hours = Math.floor(totalSeconds / 3600);
    let minutes = Math.floor((totalSeconds % 3600) / 60);
    let seconds = totalSeconds % 60;
    return `${hours}h ${minutes}m ${seconds}s`;
  }

  // Meeting start
  function meetingStart() {
    if (!meetingStarted) {
      meetingStarted = true;
      startTime = new Date();
      console.log(
        `%c📢 Meeting Started at ${getCurrentTime()}`,
        "color: green; font-weight: bold;"
      );
      startMeetRecorder();
    }
  }

  // Meeting end
  function meetingEnd() {
    if (meetingStarted) {
      endTime = new Date();
      meetingStarted = false;
      console.log(
        `%c📢 Meeting Ended at ${getCurrentTime()}`,
        "color: #ef392c; font-weight: bold;"
      );

      if (startTime && endTime) {
        console.log(
          `%c⏱ Meeting Duration: ${formatDuration(endTime - startTime)}`,
          "color: #5d8ee9; font-weight: bold;"
        );
      }
      stopMeetRecorder();
    }
  }

  // Detect meeting state (button presence)
  function isMeetingActive() {
    return document.querySelector(
      '[aria-label^="Leave call"], [aria-label^="Leave meeting"]'
    );
  }

  // --- MutationObserver setup ---
  const observer = new MutationObserver(() => {
    const leaveButton = isMeetingActive();

    if (leaveButton) {
      if (!meetingStarted) {
        meetingStart();
      }
    } else {
      if (meetingStarted) {
        meetingEnd();
      }
    }
  });

  // Start observing the document
  observer.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
  });

  console.log(
    "%c✅ Meeting tracker (MutationObserver) initialized. Watching for DOM changes...",
    "color: orange; font-weight: bold;"
  );
})();
