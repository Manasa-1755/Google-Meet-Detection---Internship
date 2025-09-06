

(function () {
  let meetingStarted = false;
  let startTime = null;
  let endTime = null;
  let leaveButtonMissingSince = null;
  const END_THRESHOLD = 3000; // ms (3s)

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

  // Check meeting state
  function checkMeeting() {
    const leaveButton = document.querySelector(
      '[aria-label^="Leave call"], [aria-label^="Leave meeting"]'
    );

    if (leaveButton) {
      leaveButtonMissingSince = null;
      meetingStart();
    } else {
      if (!leaveButtonMissingSince) {
        leaveButtonMissingSince = Date.now();
      } else if (Date.now() - leaveButtonMissingSince > END_THRESHOLD) {
        meetingEnd();
      }
    }
  }

  // Run every second
  setInterval(checkMeeting, 1000);

  console.log(
    "%c✅ Meeting tracker + recorder initialized. Waiting for changes...",
    "color: orange; font-weight: bold;"
  );
})();

