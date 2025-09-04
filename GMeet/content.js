// --- MEETING DETECTION (Stable Version) ---
(function () {
  let meetingStarted = false;
  let startTime = null;
  let endTime = null;
  let leaveButtonMissingSince = null;
  const END_THRESHOLD = 3000; // ms (3s) to confirm meeting ended

  // Utility: get current time as hh:mm:ss
  function getCurrentTime() {
    return new Date().toLocaleTimeString();
  }

  // Utility: format duration (ms → hh:mm:ss)
  function formatDuration(ms) {
    let totalSeconds = Math.floor(ms / 1000);
    let hours = Math.floor(totalSeconds / 3600);
    let minutes = Math.floor((totalSeconds % 3600) / 60);
    let seconds = totalSeconds % 60;
    return `${hours}h ${minutes}m ${seconds}s`;
  }

  // Function: when meeting starts
  function meetingStart() {
    if (!meetingStarted) {
      meetingStarted = true;
      startTime = new Date();
      console.log(
        `%c📢 Meeting Started at ${getCurrentTime()}`,
        "color: green; font-weight: bold;"
      );
    }
  }

  // Function: when meeting ends
  function meetingEnd() {
    if (meetingStarted) {
      endTime = new Date();
      meetingStarted = false;
      console.log(
        `%c📢 Meeting Ended at ${getCurrentTime()}`,
        "color: #ef392cff; font-weight: bold;"
      );
      if (startTime && endTime) {
        console.log(
          `%c⏱ Meeting Duration: ${formatDuration(endTime - startTime)}`,
          "color: #5d8ee9ff; font-weight: bold;"
        );
      }
    }
  }

  // Function: check meeting state
  function checkMeeting() {
    const leaveButton = document.querySelector(
      '[aria-label^="Leave call"], [aria-label^="Leave meeting"]'
    );

    if (leaveButton) {
      leaveButtonMissingSince = null;
      meetingStart();
    } else {
      if (!leaveButtonMissingSince) {
        // mark when button disappeared
        leaveButtonMissingSince = Date.now();
      } else if (Date.now() - leaveButtonMissingSince > END_THRESHOLD) {
        // only end if button is gone for > threshold
        meetingEnd();
      }
    }
  }

  // Run check every second
  setInterval(checkMeeting, 1000);

  console.log(
    "%c✅ Meeting tracker initialized. Waiting for changes...",
    "color: orange; font-weight: bold;"
  );
})();
