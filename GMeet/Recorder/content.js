
// UNIFIED CONTENT.JS - Google Meet & Microsoft Teams
(function() {
    'use strict';

    // Service detection
    function detectService() {
        const url = window.location.href;
        if (url.includes('meet.google.com')) return 'gmeet';
        if (url.includes('teams.microsoft.com') || url.includes('teams.live.com')) return 'teams';
        return null;
    }

    const currentService = detectService();

    // Initialize based on service
    if (currentService === 'gmeet') {
        gmeetContent();
    } else if (currentService === 'teams') {
        teamsContent();
    }

    // ==================== GOOGLE MEET ====================
    function gmeetContent() {
        console.log("🔍 Initializing Google Meet content script");

        let isInMeeting = false;
        let recordingStarted = false;
        let autoRecordEnabled = false;
        let leaveButtonObserver = null;
        let lastLeaveButtonVisible = false;

        // Meeting Detection + Timer + Duration        
        let meetingStarted = false;
        let meetingStartTime = null;
        let meetingEndTime = null;
        let totalMeetingDuration = 0;

        function showMeetStatus(message, duration = 4000) {
            const existing = document.getElementById('meet-recorder-status');
            
            if (existing && message.includes("Recording...")) {
                existing.innerHTML = message.replace(/\n/g, '<br>');
                return;
            }
            
            if (existing) existing.remove();
            
            const status = document.createElement('div');
            status.id = 'meet-recorder-status';
            status.innerHTML = message.replace(/\n/g, '<br>');
            status.style.cssText = `
                position: fixed;
                top: 20px;
                right: 20px;
                background: rgba(0,0,0,0.95);
                color: white;
                padding: 12px 16px;
                border-radius: 10px;
                font-family: 'Google Sans', Arial, sans-serif;
                font-size: 14px;
                z-index: 100000;
                font-weight: bold;
                border: 2px solid #4285f4;
                box-shadow: 0 4px 12px rgba(0,0,0,0.3);
                backdrop-filter: blur(10px);
                max-width: 400px;
                word-wrap: break-word;
            `;
            
            document.body.appendChild(status);

            if (!message.includes("Recording...")) {
                setTimeout(() => {
                    const currentStatus = document.getElementById('meet-recorder-status');
                    if (currentStatus && !currentStatus.innerHTML.includes("Recording...")) {
                        currentStatus.remove();
                    }
                }, duration);
            }
        }

        function startMeetingTimer() {
            meetingStartTime = Date.now();
            const startTime = new Date(meetingStartTime).toLocaleTimeString();
            console.log(`%c📅 Meeting started at : ${startTime}`,"color: #0f9d58; font-weight: bold;");
            showMeetStatus(`📅 Meeting started at: ${startTime}`, 5000);
        }

        function stopMeetingTimer() {
            if (meetingStartTime) {
                meetingEndTime = Date.now();
                totalMeetingDuration = Math.floor((meetingEndTime - meetingStartTime) / 1000);
                
                const minutes = Math.floor(totalMeetingDuration / 60);
                const seconds = totalMeetingDuration % 60;
                const endTime = new Date(meetingEndTime).toLocaleTimeString();

                console.log(`%c📅 Meeting ended at : ${new Date(meetingEndTime).toLocaleTimeString()}`, "color: #d93025; font-weight: bold;");
                console.log(`%c⏱️ Duration of meeting : ${minutes}m ${seconds}s`, "color: #f4b400; font-weight: bold;");

                showMeetStatus(`📅 Meeting ended at : ${endTime}\n Duration: ${minutes}m ${seconds}s`, 5000);

                chrome.storage.local.set({
                    lastMeetingDuration: totalMeetingDuration,
                    lastMeetingEndTime: meetingEndTime
                });
                
                meetingStartTime = null;
                meetingEndTime = null;
            }
        }

        function getCurrentMeetingDuration() {
            if (meetingStartTime) {
                const currentDuration = Math.floor((Date.now() - meetingStartTime) / 1000);
                const minutes = Math.floor(currentDuration / 60);
                const seconds = currentDuration % 60;
                return `${minutes}m ${seconds}s`;
            }
            return "0m 0s";
        }

        function isMeetingActive() {
            return document.querySelector('[aria-label^="Leave call"], [aria-label^="Leave meeting"]');
        }

        async function initializeAutoRecord() {
        await checkAutoRecordPermission();
        
        // If auto-record is enabled, immediately check if we're in a meeting
        if (autoRecordEnabled) {
            console.log("🔄 Auto-record enabled - checking current meeting state");
            setTimeout(() => {
                checkMeetingState();
                // Force a re-check after a delay to catch any late-loading meetings
                setTimeout(() => {
                    checkMeetingState();
                    // If we're in a meeting and auto-record is enabled, start recording
                    if (isInMeeting && autoRecordEnabled && !recordingStarted) {
                        console.log("🚀 Auto-record enabled and in meeting - starting recording");
                        startAutoRecording();
                    }
                }, 3000);
            }, 1000);
        }
    }

        async function checkAutoRecordPermission() {
        return new Promise((resolve) => {
            chrome.storage.local.get(['autoRecordPermissions'], (result) => {
                autoRecordEnabled = result.autoRecordPermissions?.['gmeet'] || false;
                console.log(`🔐 Auto record enabled for gmeet:`, autoRecordEnabled);
                resolve(autoRecordEnabled);
            });
        });
    }
        
        function startAutoRecordingImmediately() {
            if (isInMeeting && autoRecordEnabled && !recordingStarted) {
                console.log("🚀 Auto-record toggled ON mid-meeting - starting recording immediately");
                showMeetStatus("🟡 Auto recording starting now...");
                startAutoRecording();
            }
        }

        function findLeaveButton() {
            const selectors = [
                'button[aria-label="Leave call"]',
                'button[aria-label*="Leave call"]',
                'div[role="button"][data-tooltip="Leave call"]',
                'div[role="button"][aria-label*="Leave"]',
                'button[jscontroller][jsname][aria-label*="Leave"]',
            ];
            for (const selector of selectors) {
                const el = document.querySelector(selector);
                if (el) return el;
            }
            return null;
        }

        function isElementVisible(element) {
            if (!element) return false;
            const style = window.getComputedStyle(element);
            const rect = element.getBoundingClientRect();
            return style.display !== 'none' &&
                   style.visibility !== 'hidden' &&
                   style.opacity !== '0' &&
                   rect.width > 0 &&
                   rect.height > 0 &&
                   element.offsetParent !== null;
        }        

        function checkMeetingState() {

            const leaveButton = findLeaveButton();
            const leaveVisible = leaveButton && isElementVisible(leaveButton);

            if (leaveVisible && !lastLeaveButtonVisible) {
                console.log("✅ Leave button visible - Meeting joined");
                isInMeeting = true;
                meetingStarted = true;
                startMeetingTimer();

                const startTime = new Date(meetingStartTime).toLocaleTimeString();
                
                if (autoRecordEnabled && !recordingStarted) {
                    console.log("🔄 Auto-record enabled - starting recording in 3 seconds...");
                    showMeetStatus(`📅 Meeting started at: ${startTime}\n🟡 Auto recording starting in 3 seconds...`);

                    // Clear any existing timeout
                    if (window.autoRecordTimeout) {
                        clearTimeout(window.autoRecordTimeout);
                    }
                    
                    window.autoRecordTimeout = setTimeout(async () => {
                        if (isInMeeting && autoRecordEnabled && !recordingStarted) {
                            await startAutoRecording();
                        }
                    }, 3000);
                } else {
                    showMeetStatus(`📅 Meeting started at: ${startTime}`, 5000);
                }
            }

            if (!leaveVisible && lastLeaveButtonVisible) {
                console.log("❌ Leave button hidden - Meeting ended");
                isInMeeting = false;
                meetingStarted = false;
                stopMeetingTimer();
                
                // Clear auto-record timeout if meeting ended
                if (window.autoRecordTimeout) {
                    clearTimeout(window.autoRecordTimeout);
                    window.autoRecordTimeout = null;
                }
        
                if (recordingStarted) {
                    console.log("🛑 Meeting ended - stopping recording");
                    chrome.runtime.sendMessage({ action: "stopRecordingOnMeetingEnd" });
                }
            }

            lastLeaveButtonVisible = leaveVisible;
            chrome.storage.local.set({ isInMeeting });
        }

        function forceMeetingRedetection() {
            console.log("🔍 Force re-detecting meeting state...");
            const leaveButton = findLeaveButton();
            const leaveVisible = leaveButton && isElementVisible(leaveButton);
            
            if (leaveVisible && !isInMeeting) {
                console.log("✅ Force detected: In meeting");
                isInMeeting = true;
                meetingStarted = true;
                if (!meetingStartTime) {
                    startMeetingTimer();
                }
                return true;
            } else if (!leaveVisible && isInMeeting) {
                console.log("✅ Force detected: Not in meeting");
                isInMeeting = false;
                meetingStarted = false;
                return false;
            }
            return isInMeeting;
        }

        function aggressiveInitialCheck() {
            setTimeout(() => {
                console.log("🔍 Aggressive initial meeting check...");
                checkMeetingState();
                setTimeout(() => {
                    if (!isInMeeting) {
                        checkMeetingState();
                    }
                }, 2000);
            }, 1000);
        }

        async function startAutoRecording() {
            if (recordingStarted) {
                console.log("⚠️ Auto recording already started, skipping");
                return;
            }
            
            console.log("🚀 Starting auto recording...");

            chrome.storage.local.set({ isRecording: false });

            
            try {
                const response = await new Promise((resolve) => {
                    chrome.runtime.sendMessage({ action: "autoStartRecording" }, resolve);
                });
                
                if (response?.success) {
                    recordingStarted = true;            
                    chrome.storage.local.set({ isRecording: true });

                } else {
                    console.log("❌ Failed to start auto recording:", response);
                    recordingStarted = false;
                    showMeetStatus("❌ Auto Recording Failed");
                    // Retry after 3 seconds if failed
                    setTimeout(() => {
                        if (isInMeeting && autoRecordEnabled && !recordingStarted) {
                            console.log("🔄 Retrying auto recording...");
                            startAutoRecording();
                        }
                    }, 3000);
                }
            } catch (error) {
                console.log("❌ Error starting auto recording:", error);
                recordingStarted = false;
                showMeetStatus("❌ Auto Recording Error");
            }
        }

        async function initializeWithStateRecovery() {
            await checkAutoRecordPermission();
            setupLeaveButtonObserver();
            
            const storageState = await new Promise(resolve => {
                chrome.storage.local.get(['isRecording', 'isInMeeting'], resolve);
            });
            
            console.log("🔄 State recovery check:", storageState);
            
            if (storageState.isInMeeting && !isInMeeting) {
                console.log("🔄 Recovering meeting state from storage");
                forceMeetingRedetection();
            }
            
            if (storageState.isRecording && !recordingStarted) {
                console.log("🔄 Resetting inconsistent recording state");
                chrome.storage.local.set({ isRecording: false });
            }
            
            checkInitialMeetingState();
            setInterval(checkMeetingState, 2000);
            aggressiveInitialCheck();
        }

        function stopAutoRecording() {
            if (!recordingStarted) return;
            recordingStarted = false;

            chrome.runtime.sendMessage({ action: "autoStopRecording" }, (response) => {
                if (response?.success) {
                    console.log("✅ Auto recording stopped");
                    if (autoRecordEnabled) {
                        chrome.runtime.sendMessage({ action: "closeRecorderTab" });
                    }
                } else {
                    console.log("❌ Failed to stop auto recording");
                }
            });
        }

        function setupLeaveButtonObserver() {
            if (leaveButtonObserver) leaveButtonObserver.disconnect();
            leaveButtonObserver = new MutationObserver(() => {
                setTimeout(checkMeetingState, 500);
            });
            leaveButtonObserver.observe(document.body, {
                childList: true,
                subtree: true,
                attributes: true,
                attributeFilter: ['style', 'class', 'aria-hidden', 'disabled']
            });
        }

        function checkInitialMeetingState() {
            const leaveButton = findLeaveButton();
            const leaveVisible = leaveButton && isElementVisible(leaveButton);
            
            if (leaveVisible && !isInMeeting) {
                console.log("🔍 Already in meeting - will auto-start recording in 3 seconds");
                isInMeeting = true;
                meetingStarted = true;
                
                if (!meetingStartTime) {
                    startMeetingTimer();
                }
                
                if (autoRecordEnabled && !recordingStarted) {
                    console.log("🚀 Auto-starting recording for existing meeting");
                    showMeetStatus("🟡 Auto recording starting in 3 seconds...", 3000);
                    setTimeout(async () => {
                        await startAutoRecording();
                    }, 3000);
                }
            }
        }

        function getMuteStatus() {
            const muteButton = document.querySelector('[aria-label*="microphone"]') || 
                             document.querySelector('[data-tooltip*="microphone"]') ||
                             document.querySelector('[jscontroller*="microphone"]');
            
            if (muteButton) {
                const ariaLabel = muteButton.getAttribute('aria-label') || '';
                const isMuted = ariaLabel.includes('unmute') || ariaLabel.includes('Turn on');
                return { isMuted: isMuted };
            }
            
            const muteIcon = document.querySelector('svg[aria-label*="microphone"]');
            if (muteIcon) {
                const ariaLabel = muteIcon.getAttribute('aria-label') || '';
                const isMuted = ariaLabel.includes('unmute') || ariaLabel.includes('Turn on');
                return { isMuted: isMuted };
            }
            
            return { isMuted: true };
        }

        // Message listener for Google Meet
        chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
            if (message.action === "updateAutoRecordPermission") {
                autoRecordEnabled = message.enabled;
                console.log(`🔄 Auto record permission updated for ${currentService}:`, autoRecordEnabled);

                // If permission was just enabled, check if we should start recording
                if (autoRecordEnabled && isInMeeting && !recordingStarted) {
                    console.log("🚀 Auto-record enabled while in meeting - starting recording");
                    if (currentService === 'gmeet') {
                        startAutoRecording();
                    } else if (currentService === 'teams') {
                        startAutoRecordingImmediately();
                    }
                }
                sendResponse({ success: true });
            }

            if (message.action === "autoRecordToggledOn") {
                autoRecordEnabled = message.enabled;
                console.log("🔄 Auto-record toggled ON, checking if we're in a meeting...");
                startAutoRecordingImmediately();
                sendResponse({ success: true });
            }

            if (message.action === "checkMeetingStatus") {
                sendResponse({ 
                    isInMeeting, 
                    recording: recordingStarted, 
                    autoRecordEnabled,
                    meetingDuration: getCurrentMeetingDuration()
                });
            }

            if (message.action === "autoStopRecording") {
                stopAutoRecording();
                sendResponse({ success: true });
            }

            if (message.action === "getMeetingDuration") {
                const duration = getCurrentMeetingDuration();
                sendResponse({ 
                    duration: duration,
                    isInMeeting: isInMeeting,
                    startTime: meetingStartTime
                });
            }

            if (message.action === "getLastMeetingStats") {
                chrome.storage.local.get(['lastMeetingDuration', 'lastMeetingEndTime'], (result) => {
                    sendResponse({
                        lastDuration: result.lastMeetingDuration || 0,
                        lastEndTime: result.lastMeetingEndTime || null
                    });
                });
                return true;
            }

            if (message.action === "getMuteStatus") {
                const status = getMuteStatus();
                sendResponse(status);
            }

            if (message.action === "showMeetStatus") {
                const duration = message.duration || 4000;
                showMeetStatus(message.message, duration);
                sendResponse({ success: true });
            }
            
            if (message.action === "updateMeetTimer") {
                const status = document.getElementById('meet-recorder-status');
                if (status && status.textContent.includes('Recording')) {
                    status.textContent = `🔴 Recording... ${message.time}`;
                } else if (isInMeeting && recordingStarted) {
                    showMeetStatus(`🔴 Recording... ${message.time}`);
                }
                sendResponse({ success: true });
            }

            if (message.action === "recordingCompleted") {
                recordingStarted = false;
                if (autoRecordEnabled) {
                    showMeetStatus("✅ Auto Recording Completed & Downloaded");
                } else {
                    showMeetStatus("✅ Recording Completed & Downloaded");
                }
                sendResponse({ success: true });
            }

            if (message.action === "forceResetAndRetry") {
                console.log("📨 Received force reset command");
                forceResetAndRetry();
                sendResponse({ success: true });
            }
            
            return true;
        });

        function forceResetAndRetry() {
            console.log("🔄 FORCE RESET - Resetting everything...");
            recordingStarted = false;
            forceMeetingRedetection();
            
            const existingStatus = document.getElementById('meet-recorder-status');
            if (existingStatus) existingStatus.remove();
            
            chrome.storage.local.set({ 
                isRecording: false,
                recordingStoppedByTabClose: true
            });
            
            chrome.runtime.sendMessage({ action: "refreshExtensionState" });
            
            showMeetStatus("🔄 Force reset - checking meeting state...");
            
            setTimeout(() => {
                console.log("🔄 Attempting auto-record after reset...");
                forceMeetingRedetection();
                
                if (isInMeeting && autoRecordEnabled && !recordingStarted) {
                    console.log("✅ Conditions met - starting auto recording");
                    startAutoRecording();
                } else {
                    console.log("❌ Conditions not met after reset:", {
                        isInMeeting,
                        autoRecordEnabled,
                        recordingStarted
                    });
                }
            }, 3000);
        }       

        // Initialize
        setTimeout(async () => {
            await initializeWithStateRecovery();
            await initializeAutoRecord();
            console.log("🔍 Meet Auto Recorder content script fully loaded with state recovery");
        }, 1000);
    }

    // ==================== MICROSOFT TEAMS ====================
    function teamsContent() {
        console.log("🔍 Initializing Microsoft Teams content script");

        let isInMeeting = false;
        let recordingStarted = false;
        let autoRecordEnabled = false;
        let joinButtonObserver = null;

        function startAutoRecordingImmediately() {
        if (isInMeeting && autoRecordEnabled && !recordingStarted) {
            console.log("🚀 Auto-record toggled ON mid-meeting - starting recording immediately");
            showMeetingNotification("autoRecordingStarted");
            startAutoRecording();
        }
        }

         async function initializeAutoRecord() {
            await checkAutoRecordPermision();
        
            // If auto-record is enabled, immediately check meeting status
            if (autoRecordEnabled) {
                console.log("🔄 Auto-record enabled - checking current meeting state");
                setTimeout(() => {
                    handleMidMeetingAutoRecord();
                    // Additional check after everything loads
                    setTimeout(() => {
                        handleMidMeetingAutoRecord();
                    }, 5000);
                }, 2000);
            }
        }

        async function checkAutoRecordPermission() {
        return new Promise((resolve) => {
            chrome.storage.local.get(['autoRecordPermissions'], (result) => {
                // Get service-specific permission for Teams
                autoRecordEnabled = result.autoRecordPermissions?.['teams'] || false;
                console.log("🔐 Auto record enabled for teams:", autoRecordEnabled);
                resolve(autoRecordEnabled);
            });
        });
        }

        function findJoinButton() {
            const joinButton = document.getElementById('prejoin-join-button');
            if (joinButton) {
                console.log("🔍 Found Join button:", {
                    id: joinButton.id,
                    text: joinButton.textContent,
                    visible: isElementVisible(joinButton)
                });
                return joinButton;
            }
            
            const fallbackSelectors = [
                'button[data-tid="prejoin-join-button"]',
                'button[aria-label*="Join"]',
                'button[aria-label*="join"]',
                '.join-button',
                'button[title*="Join"]',
                'button[title*="join"]'
            ];
            
            for (const selector of fallbackSelectors) {
                const button = document.querySelector(selector);
                if (button && isElementVisible(button)) {
                    console.log("🔍 Found Join button with selector:", selector);
                    return button;
                }
            }
            
            return null;
        }

        function isElementVisible(element) {
            if (!element) return false;
            const style = window.getComputedStyle(element);
            const rect = element.getBoundingClientRect();
            return style.display !== 'none' && 
                   style.visibility !== 'hidden' && 
                   style.opacity !== '0' &&
                   rect.width > 0 && 
                   rect.height > 0 &&
                   element.offsetParent !== null;
        }

        function setupJoinButtonClickHandler() {
            document.removeEventListener('click', handleJoinButtonClick, true);
            document.addEventListener('click', handleJoinButtonClick, true);
            console.log("🖱️ Join button click handler activated");
        }

        function handleJoinButtonClick(event) {
            let target = event.target;
            
            while (target && target !== document.body) {
                if (isJoinButton(target)) {
                    console.log("🎯 JOIN BUTTON CLICKED - User is joining meeting");
                    console.log("⏰ Starting 3-second delay before recording...");
                    
                    setTimeout(() => {
                        meetingStarted();
                    }, 3000);
                    
                    break;
                }
                target = target.parentElement;
            }
        }

        function isJoinButton(element) {
            if (!element) return false;
            if (element.id === 'prejoin-join-button') return true;
            if (element.getAttribute('data-tid') === 'prejoin-join-button') return true;
            
            const ariaLabel = element.getAttribute('aria-label') || '';
            const title = element.getAttribute('title') || '';
            const textContent = element.textContent || '';
            
            return (ariaLabel.toLowerCase().includes('join') && 
                    !ariaLabel.toLowerCase().includes('leave')) ||
                   (title.toLowerCase().includes('join') &&
                    !title.toLowerCase().includes('leave')) ||
                   textContent.toLowerCase().includes('join now') ||
                   textContent.trim() === 'Join now';
        }

        function setupLeaveButtonClickHandler() {
            document.removeEventListener('click', handleLeaveButtonClick, true);
            document.addEventListener('click', handleLeaveButtonClick, true);
            console.log("🖱️ Leave button click handler activated");
        }

        function handleLeaveButtonClick(event) {
            let target = event.target;
            
            while (target && target !== document.body) {
                if (isLeaveButton(target)) {
                    console.log("🛑 LEAVE BUTTON CLICKED - Meeting ended by user");
                    meetingEnded();
                    break;
                }
                target = target.parentElement;
            }
        }

        function isLeaveButton(element) {
            if (!element) return false;
            if (element.id === 'hangup-button') return true;
            
            const ariaLabel = element.getAttribute('aria-label') || '';
            const title = element.getAttribute('title') || '';
            const dataTid = element.getAttribute('data-tid') || '';
            
            return ariaLabel.toLowerCase().includes('leave') ||
                   ariaLabel.toLowerCase().includes('hang up') ||
                   title.toLowerCase().includes('leave') ||
                   title.toLowerCase().includes('hang up') ||
                   dataTid.includes('hangup') ||
                   element.classList.contains('hangup-button');
        }

        function meetingStarted() {
            if (isInMeeting) return;
            
            const startTime = new Date().toLocaleTimeString();
            console.log(`🎯 MEETING STARTED - 3-second delay completed at ${startTime}`);
            isInMeeting = true;
            
            if (autoRecordEnabled && !recordingStarted) {
                console.log("🎬 AUTO RECORDING - Starting recording after delay");
                startAutoRecording();
            } else {
                console.log("ℹ️ Auto recording not enabled or already recording");
            }
            
            showMeetingNotification("started");
            chrome.storage.local.set({ isInMeeting: isInMeeting });
        }

        function meetingEnded() {
            if (!isInMeeting) return;
            
            const endTime = new Date().toLocaleTimeString();
            console.log(`🎯 MEETING ENDED - Leave button was clicked at ${endTime}`);
            isInMeeting = false;
            
            if (recordingStarted) {
                console.log("⏹️ AUTO STOPPING - Stopping recording due to meeting end");
                stopAutoRecording();
            }
            
            showMeetingNotification("ended");
            chrome.storage.local.set({ isInMeeting: isInMeeting });
        }

        function startAutoRecording() {
            if (recordingStarted) return;
            
            console.log("🎬 Attempting auto recording start...");
            recordingStarted = true;
            
            chrome.runtime.sendMessage({ 
                action: "autoStartRecording"
            }, (response) => {
                if (response && response.success) {
                    console.log("✅ Auto recording started successfully");
                    showRecordingNotification("started");
                } else {
                    console.log("❌ Auto recording failed to start");
                    recordingStarted = false;
                }
            });
        }

        function stopAutoRecording() {
            if (!recordingStarted) return;
            
            console.log("🛑 Attempting auto recording stop...");
            
            chrome.runtime.sendMessage({ action: "autoStopRecording" }, (response) => {
                if (response && response.success) {
                    console.log("✅ Auto recording stopped successfully");
                    recordingStarted = false;
                    showRecordingNotification("stopped");
                } else {
                    console.log("❌ Auto recording failed to stop");
                }
            });
        }

        function showMeetingNotification(type) {
            const existingNotification = document.getElementById('meeting-status-notification');
            if (existingNotification) {
                existingNotification.remove();
            }

            const notification = document.createElement('div');
            notification.id = 'meeting-status-notification';
            
            const currentTime = new Date().toLocaleTimeString();
            
            if (type === "started") {
                notification.style.cssText = `
                    position: fixed;
                    top: 10px;
                    left: 50%;
                    transform: translateX(-50%);
                    background: #4CAF50;
                    color: white;
                    padding: 12px 18px;
                    border-radius: 8px;
                    z-index: 10000;
                    font-family: Arial, sans-serif;
                    font-size: 14px;
                    font-weight: bold;
                    box-shadow: 0 4px 12px rgba(0,0,0,0.3);
                    border: 2px solid #45a049;
                `;
                notification.textContent = `🔴 Meeting Started - ${currentTime}`;
            }  else if (type === "autoRecordingStarted") {
                notification.style.cssText = `
                position: fixed;
                top: 10px;
                left: 50%;
                transform: translateX(-50%);
                background: #2196F3;
                color: white;
                padding: 12px 18px;
                border-radius: 8px;
                z-index: 10000;
                font-family: Arial, sans-serif;
                font-size: 14px;
                font-weight: bold;
                box-shadow: 0 4px 12px rgba(0,0,0,0.3);
                border: 2px solid #1976D2;
                `;
                notification.textContent = `🎬 Auto Recording Started - ${currentTime}`;
            } else {
                notification.style.cssText = `
                    position: fixed;
                    top: 10px;
                    left: 50%;
                    transform: translateX(-50%);
                    background: #f44336;
                    color: white;
                    padding: 12px 18px;
                    border-radius: 8px;
                    z-index: 10000;
                    font-family: Arial, sans-serif;
                    font-size: 14px;
                    font-weight: bold;
                    box-shadow: 0 4px 12px rgba(0,0,0,0.3);
                    border: 2px solid #d32f2f;
                `;
                notification.textContent = `⏹️ Meeting Ended - ${currentTime}`;
            }
            
            document.body.appendChild(notification);
            
            setTimeout(() => {
                if (notification.parentNode) {
                    notification.parentNode.removeChild(notification);
                }
            }, 5000);
        }

        function showRecordingNotification(type) {
            const notification = document.createElement('div');
            notification.id = 'recording-status-notification';
            notification.style.cssText = `
                position: fixed;
                top: 60px;
                left: 50%;
                transform: translateX(-50%);
                background: ${type === 'started' ? '#2196F3' : '#FF9800'};
                color: white;
                padding: 8px 12px;
                border-radius: 5px;
                z-index: 9999;
                font-family: Arial, sans-serif;
                font-size: 11px;
                box-shadow: 0 2px 8px rgba(0,0,0,0.2);
            `;
            notification.textContent = type === 'started' 
                ? '🔴 Recording Started' 
                : '⏹️ Recording Stopped - Downloading...';
            
            document.body.appendChild(notification);
            
            setTimeout(() => {
                if (notification.parentNode) {
                    notification.parentNode.removeChild(notification);
                }
            }, 4000);
        }

        function checkIfInMeeting() {
            // Check for various indicators that we're in a Teams meeting
            const indicators = [
                // Video container
                '[data-tid="video-layout"]',
                '[data-tid="meeting-container"]',
                // Participant list
                '[data-tid="roster-list"]',
                // Meeting controls
                '[data-tid="meeting-controls"]',
                '[data-tid="call-controls"]',
                // Leave button
                '[data-tid="hangup-button"]',
                'button[aria-label*="Leave"]',
                'button[aria-label*="Hang up"]',
                // Active speaker video
                '[data-tid="active-speaker-video"]',
                // More specific meeting indicators
                'div[role="main"][data-tid*="meeting"]',
                '.ts-calling-stage',
                '.call-stage'
            ];
        
            for (const selector of indicators) {
                const element = document.querySelector(selector);
                if (element && isElementVisible(element)) {
                    console.log("✅ Teams meeting detected with selector:", selector);
                    return true;
                }
            }
        
            // Additional check: look for multiple video elements which indicate active meeting
            const videoElements = document.querySelectorAll('video');
            const visibleVideos = Array.from(videoElements).filter(video => 
                video.readyState > 0 && 
                video.videoWidth > 0 && 
                video.videoHeight > 0 &&
                isElementVisible(video)
            );
        
            if (visibleVideos.length > 0) {
                console.log("✅ Teams meeting detected via active video elements:", visibleVideos.length);
                return true;
            }
        
            console.log("❌ No Teams meeting indicators found");
            return false;
        }

        function handleMidMeetingAutoRecord() {
            const inMeeting = checkIfInMeeting();
            console.log("🔍 Mid-meeting auto-record check:", { 
                inMeeting, 
                isInMeeting, 
                autoRecordEnabled, 
                recordingStarted 
            });

            if (inMeeting && !isInMeeting) {
                console.log("🔍 Detected active meeting - updating state");
                isInMeeting = true;
                chrome.storage.local.set({ isInMeeting: true });
                
                if (autoRecordEnabled && !recordingStarted) {
                    console.log("🚀 Auto-record enabled mid-meeting - starting recording");                
                        startAutoRecordingImmediately();
                }
            } else if (inMeeting && isInMeeting && autoRecordEnabled && !recordingStarted) {
                // We're already marked as in meeting but recording hasn't started
                console.log("🚀 Already in meeting with auto-record enabled - starting recording");
                startAutoRecordingImmediately();
            }
        }

        function setupJoinButtonObserver() {
            if (joinButtonObserver) {
                joinButtonObserver.disconnect();
            }

            joinButtonObserver = new MutationObserver((mutations) => {
                let joinButtonAppeared = false;
                
                mutations.forEach((mutation) => {
                    if (mutation.type === 'childList') {
                        mutation.addedNodes.forEach(node => {
                            if (node.nodeType === 1 && (
                                node.id === 'prejoin-join-button' || 
                                node.getAttribute('data-tid') === 'prejoin-join-button' ||
                                (node.getAttribute('aria-label') && node.getAttribute('aria-label').toLowerCase().includes('join'))
                            )) {
                                console.log("➕ Join button added to DOM");
                                joinButtonAppeared = true;
                            }
                        });
                    }
                    
                    if (mutation.type === 'attributes' && 
                        (mutation.target.id === 'prejoin-join-button' || 
                         mutation.target.getAttribute('data-tid') === 'prejoin-join-button' ||
                         (mutation.target.getAttribute('aria-label') && mutation.target.getAttribute('aria-label').toLowerCase().includes('join')))) {
                        console.log("⚡ Join button attribute changed:", mutation.attributeName);
                        joinButtonAppeared = true;
                    }
                });
                
                if (joinButtonAppeared) {
                    console.log("🔍 Join button state changed, setting up click handler...");
                    setTimeout(() => {
                        setupJoinButtonClickHandler();
                        setupLeaveButtonClickHandler();
                    }, 500);
                }
            });

            joinButtonObserver.observe(document.body, {
                childList: true,
                subtree: true,
                attributes: true,
                attributeFilter: ['style', 'class', 'aria-hidden', 'disabled', 'id', 'data-tid', 'aria-label', 'title']
            });
        }

        // Message listener for Teams
        chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
            console.log("📨 Teams content script received:", message.action);
            
            if (message.action === "updateAutoRecordPermission") {
                autoRecordEnabled = message.enabled;
                console.log("🔐 Auto record permission updated:", autoRecordEnabled);
                if (autoRecordEnabled && isInMeeting && !recordingStarted) {
                    console.log("🚀 Auto-record enabled while in Teams meeting - starting recording");
                    setTimeout(() => {
                        startAutoRecordingImmediately();
                    }, 1000);
                }
                sendResponse({ success: true });
            }

            if (message.action === "autoRecordToggledOn") {
            autoRecordEnabled = message.enabled;
            console.log("🔄 Auto-record toggled ON, checking meeting status...");
            
            // Check if we're in a meeting and start recording immediately
            setTimeout(() => {
                handleMidMeetingAutoRecord();
            }, 500);
            
            sendResponse({ success: true });
            }

            if (message.action === "checkMeetingStatus") {
                const wasInMeeting = isInMeeting;
                handleMidMeetingAutoRecord();

                // If we just detected we're in a meeting and auto-record is enabled, start recording
                if (!wasInMeeting && isInMeeting && autoRecordEnabled && !recordingStarted) {
                console.log("🚀 Meeting detected with auto-record enabled - starting recording");
                setTimeout(() => {
                    startAutoRecordingImmediately();
                }, 1000);
                }

                sendResponse({ 
                    isInMeeting: isInMeeting, 
                    recording: recordingStarted,
                    autoRecordEnabled: autoRecordEnabled
                });
            }
            
            return true;
        });

        function initializeDetection() {
        // Load auto-record permission on initialization
        checkAutoRecordPermission().then(() => {
            console.log("🔐 Teams auto-record permission loaded:", autoRecordEnabled);

            initializeAutoRecord();
            
            // Then check meeting status
            setTimeout(() => {
                console.log("🔍 Initial meeting state check...");
                handleMidMeetingAutoRecord();
                
                // If auto-record is enabled and we're in a meeting, start recording
                if (autoRecordEnabled && isInMeeting && !recordingStarted) {
                    console.log("🚀 Auto-record enabled and in meeting - starting recording");
                    setTimeout(() => {
                        startAutoRecordingImmediately();
                    }, 2000);
                }
            }, 2000);
        });

        setupJoinButtonObserver();
        setupJoinButtonClickHandler();
        setupLeaveButtonClickHandler();
        
        const existingJoinButton = findJoinButton();
        if (existingJoinButton) {
            console.log("✅ Join button already present on page");
        }
        
        // Check if we're already in a meeting on initialization
        setTimeout(() => {
            handleMidMeetingAutoRecord();
        }, 3000);
        
        let lastUrl = location.href;
        const urlObserver = new MutationObserver(() => {
            const url = location.href;
            if (url !== lastUrl) {
                lastUrl = url;
                console.log("🔗 URL changed, reinitializing detection...");
                setTimeout(() => {
                    initializeDetection();
                }, 2000);
            }
        });
        
        urlObserver.observe(document, { subtree: true, childList: true });
        }

        // Initialize Teams
        setTimeout(() => {
            initializeDetection();
            console.log("🔍 Teams Auto Recorder initialized");
        }, 1500);
    }
})();



/*
// UNIFIED CONTENT.JS - Google Meet & Microsoft Teams
(function() {
    'use strict';

    // Service detection
    function detectService() {
        const url = window.location.href;
        if (url.includes('meet.google.com')) return 'gmeet';
        if (url.includes('teams.microsoft.com') || url.includes('teams.live.com')) return 'teams';
        return null;
    }

    const currentService = detectService();

    // Initialize based on service
    if (currentService === 'gmeet') {
        gmeetContent();
    } else if (currentService === 'teams') {
        teamsContent();
    }

    // ==================== GOOGLE MEET ====================
    function gmeetContent() {
        console.log("🔍 Initializing Google Meet content script");

        let isInMeeting = false;
        let recordingStarted = false;
        let autoRecordEnabled = false;
        let leaveButtonObserver = null;
        let lastLeaveButtonVisible = false;

        // Meeting Detection + Timer + Duration
        let timerEl = null;
        let timerInterval = null;
        let recordStartTime = null;
        let meetingStarted = false;
        let meetingStartTime = null;
        let meetingEndTime = null;
        let totalMeetingDuration = 0;

        function showMeetStatus(message, duration = 4000) {
            const existing = document.getElementById('meet-recorder-status');
            
            if (existing && message.includes("Recording...")) {
                existing.innerHTML = message.replace(/\n/g, '<br>');
                return;
            }
            
            if (existing) existing.remove();
            
            const status = document.createElement('div');
            status.id = 'meet-recorder-status';
            status.innerHTML = message.replace(/\n/g, '<br>');
            status.style.cssText = `
                position: fixed;
                top: 20px;
                right: 20px;
                background: rgba(0,0,0,0.95);
                color: white;
                padding: 12px 16px;
                border-radius: 10px;
                font-family: 'Google Sans', Arial, sans-serif;
                font-size: 14px;
                z-index: 100000;
                font-weight: bold;
                border: 2px solid #4285f4;
                box-shadow: 0 4px 12px rgba(0,0,0,0.3);
                backdrop-filter: blur(10px);
                max-width: 400px;
                word-wrap: break-word;
            `;
            
            document.body.appendChild(status);

            if (!message.includes("Recording...")) {
                setTimeout(() => {
                    const currentStatus = document.getElementById('meet-recorder-status');
                    if (currentStatus && !currentStatus.innerHTML.includes("Recording...")) {
                        currentStatus.remove();
                    }
                }, duration);
            }
        }

        function startMeetingTimer() {
            meetingStartTime = Date.now();
            const startTime = new Date(meetingStartTime).toLocaleTimeString();
            console.log(`%c📅 Meeting started at : ${startTime}`,"color: #0f9d58; font-weight: bold;");
            showMeetStatus(`📅 Meeting started at: ${startTime}`, 5000);
        }

        function stopMeetingTimer() {
            if (meetingStartTime) {
                meetingEndTime = Date.now();
                totalMeetingDuration = Math.floor((meetingEndTime - meetingStartTime) / 1000);
                
                const minutes = Math.floor(totalMeetingDuration / 60);
                const seconds = totalMeetingDuration % 60;
                const endTime = new Date(meetingEndTime).toLocaleTimeString();

                console.log(`%c📅 Meeting ended at : ${new Date(meetingEndTime).toLocaleTimeString()}`, "color: #d93025; font-weight: bold;");
                console.log(`%c⏱️ Duration of meeting : ${minutes}m ${seconds}s`, "color: #f4b400; font-weight: bold;");

                showMeetStatus(`📅 Meeting ended at : ${endTime}\n Duration: ${minutes}m ${seconds}s`, 5000);

                chrome.storage.local.set({
                    lastMeetingDuration: totalMeetingDuration,
                    lastMeetingEndTime: meetingEndTime
                });
                
                meetingStartTime = null;
                meetingEndTime = null;
            }
        }

        function getCurrentMeetingDuration() {
            if (meetingStartTime) {
                const currentDuration = Math.floor((Date.now() - meetingStartTime) / 1000);
                const minutes = Math.floor(currentDuration / 60);
                const seconds = currentDuration % 60;
                return `${minutes}m ${seconds}s`;
            }
            return "0m 0s";
        }

        function isMeetingActive() {
            return document.querySelector('[aria-label^="Leave call"], [aria-label^="Leave meeting"]');
        }

        async function checkAutoRecordPermission() {
    return new Promise((resolve) => {
        chrome.storage.local.get(['autoRecordPermissions'], (result) => {
            // Get service-specific permission
            const service = detectService(); // or use currentService variable
            autoRecordEnabled = result.autoRecordPermissions?.[service] || false;
            console.log(`🔐 Auto record enabled for ${service}:`, autoRecordEnabled);
            resolve(autoRecordEnabled);
        });
    });
}

        function findLeaveButton() {
            const selectors = [
                'button[aria-label="Leave call"]',
                'button[aria-label*="Leave call"]',
                'div[role="button"][data-tooltip="Leave call"]',
                'div[role="button"][aria-label*="Leave"]',
                'button[jscontroller][jsname][aria-label*="Leave"]',
            ];
            for (const selector of selectors) {
                const el = document.querySelector(selector);
                if (el) return el;
            }
            return null;
        }

        function isElementVisible(element) {
            if (!element) return false;
            const style = window.getComputedStyle(element);
            const rect = element.getBoundingClientRect();
            return style.display !== 'none' &&
                   style.visibility !== 'hidden' &&
                   style.opacity !== '0' &&
                   rect.width > 0 &&
                   rect.height > 0 &&
                   element.offsetParent !== null;
        }

        function checkMeetingState() {
            const leaveButton = findLeaveButton();
            const leaveVisible = leaveButton && isElementVisible(leaveButton);

            if (leaveVisible && !lastLeaveButtonVisible) {
                console.log("✅ Leave button visible - Meeting joined");
                isInMeeting = true;
                meetingStarted = true;
                startMeetingTimer();

                const startTime = new Date(meetingStartTime).toLocaleTimeString();
                
                if (autoRecordEnabled && !recordingStarted) {
                    console.log("🔄 Auto-record enabled - starting recording in 3 seconds...");
                    showMeetStatus(`📅 Meeting started at: ${startTime}\n🟡 Auto recording starting in 3 seconds...`);
                    
                    setTimeout(async () => {
                        if (isInMeeting && autoRecordEnabled && !recordingStarted) {
                            await startAutoRecording();
                        }
                    }, 3000);
                } else {
                    showMeetStatus(`📅 Meeting started at: ${startTime}`, 5000);
                }
            }

            if (!leaveVisible && lastLeaveButtonVisible) {
                console.log("❌ Leave button hidden - Meeting ended");
                isInMeeting = false;
                meetingStarted = false;
                stopMeetingTimer();
                
                chrome.storage.local.get(['isRecording'], (result) => {
                    if (result.isRecording) {
                        console.log("🛑 Meeting ended - stopping recording");
                        chrome.runtime.sendMessage({ action: "stopRecordingOnMeetingEnd" });
                    }
                });
            }

            lastLeaveButtonVisible = leaveVisible;
            chrome.storage.local.set({ isInMeeting });
        }

        function forceMeetingRedetection() {
            console.log("🔍 Force re-detecting meeting state...");
            const leaveButton = findLeaveButton();
            const leaveVisible = leaveButton && isElementVisible(leaveButton);
            
            if (leaveVisible && !isInMeeting) {
                console.log("✅ Force detected: In meeting");
                isInMeeting = true;
                meetingStarted = true;
                if (!meetingStartTime) {
                    startMeetingTimer();
                }
                return true;
            } else if (!leaveVisible && isInMeeting) {
                console.log("✅ Force detected: Not in meeting");
                isInMeeting = false;
                meetingStarted = false;
                return false;
            }
            return isInMeeting;
        }

        function aggressiveInitialCheck() {
            setTimeout(() => {
                console.log("🔍 Aggressive initial meeting check...");
                checkMeetingState();
                setTimeout(() => {
                    if (!isInMeeting) {
                        checkMeetingState();
                    }
                }, 2000);
            }, 1000);
        }

        async function startAutoRecording() {
            if (recordingStarted) {
                console.log("⚠️ Auto recording already started, skipping");
                return;
            }
            
            console.log("🚀 Starting auto recording...");
            
            try {
                const response = await new Promise((resolve) => {
                    chrome.runtime.sendMessage({ action: "autoStartRecording" }, resolve);
                });
                
                if (response?.success) {
                    recordingStarted = true;            
                    chrome.storage.local.set({ isRecording: true });
                } else {
                    console.log("❌ Failed to start auto recording:", response);
                    recordingStarted = false;
                    showMeetStatus("❌ Auto Recording Failed");
                }
            } catch (error) {
                console.log("❌ Error starting auto recording:", error);
                recordingStarted = false;
                showMeetStatus("❌ Auto Recording Error");
            }
        }

        async function initializeWithStateRecovery() {
            await checkAutoRecordPermission();
            setupLeaveButtonObserver();
            
            const storageState = await new Promise(resolve => {
                chrome.storage.local.get(['isRecording', 'isInMeeting'], resolve);
            });
            
            console.log("🔄 State recovery check:", storageState);
            
            if (storageState.isInMeeting && !isInMeeting) {
                console.log("🔄 Recovering meeting state from storage");
                forceMeetingRedetection();
            }
            
            if (storageState.isRecording && !recordingStarted) {
                console.log("🔄 Resetting inconsistent recording state");
                chrome.storage.local.set({ isRecording: false });
            }
            
            checkInitialMeetingState();
            setInterval(checkMeetingState, 2000);
            aggressiveInitialCheck();
        }

        function stopAutoRecording() {
            if (!recordingStarted) return;
            recordingStarted = false;

            chrome.runtime.sendMessage({ action: "autoStopRecording" }, (response) => {
                if (response?.success) {
                    console.log("✅ Auto recording stopped");
                    if (autoRecordEnabled) {
                        chrome.runtime.sendMessage({ action: "closeRecorderTab" });
                    }
                } else {
                    console.log("❌ Failed to stop auto recording");
                }
            });
        }

        function setupLeaveButtonObserver() {
            if (leaveButtonObserver) leaveButtonObserver.disconnect();
            leaveButtonObserver = new MutationObserver(() => {
                setTimeout(checkMeetingState, 500);
            });
            leaveButtonObserver.observe(document.body, {
                childList: true,
                subtree: true,
                attributes: true,
                attributeFilter: ['style', 'class', 'aria-hidden', 'disabled']
            });
        }

        function checkInitialMeetingState() {
            const leaveButton = findLeaveButton();
            const leaveVisible = leaveButton && isElementVisible(leaveButton);
            
            if (leaveVisible && !isInMeeting) {
                console.log("🔍 Already in meeting - will auto-start recording in 3 seconds");
                isInMeeting = true;
                meetingStarted = true;
                
                if (!meetingStartTime) {
                    startMeetingTimer();
                }
                
                if (autoRecordEnabled && !recordingStarted) {
                    console.log("🚀 Auto-starting recording for existing meeting");
                    showMeetStatus("🟡 Auto recording starting in 3 seconds...", 3000);
                    setTimeout(async () => {
                        await startAutoRecording();
                    }, 3000);
                }
            }
        }

        function getMuteStatus() {
            const muteButton = document.querySelector('[aria-label*="microphone"]') || 
                             document.querySelector('[data-tooltip*="microphone"]') ||
                             document.querySelector('[jscontroller*="microphone"]');
            
            if (muteButton) {
                const ariaLabel = muteButton.getAttribute('aria-label') || '';
                const isMuted = ariaLabel.includes('unmute') || ariaLabel.includes('Turn on');
                return { isMuted: isMuted };
            }
            
            const muteIcon = document.querySelector('svg[aria-label*="microphone"]');
            if (muteIcon) {
                const ariaLabel = muteIcon.getAttribute('aria-label') || '';
                const isMuted = ariaLabel.includes('unmute') || ariaLabel.includes('Turn on');
                return { isMuted: isMuted };
            }
            
            return { isMuted: true };
        }

        // Message listener for Google Meet
        chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
            if (message.action === "updateAutoRecordPermission") {
                autoRecordEnabled = message.enabled;
                console.log(`🔄 Auto record permission updated for ${currentService}:`, autoRecordEnabled);
                sendResponse({ success: true });
            }

            if (message.action === "checkMeetingStatus") {
                sendResponse({ 
                    isInMeeting, 
                    recording: recordingStarted, 
                    autoRecordEnabled,
                    meetingDuration: getCurrentMeetingDuration()
                });
            }

            if (message.action === "autoStopRecording") {
                stopAutoRecording();
                sendResponse({ success: true });
            }

            if (message.action === "getMeetingDuration") {
                const duration = getCurrentMeetingDuration();
                sendResponse({ 
                    duration: duration,
                    isInMeeting: isInMeeting,
                    startTime: meetingStartTime
                });
            }

            if (message.action === "getLastMeetingStats") {
                chrome.storage.local.get(['lastMeetingDuration', 'lastMeetingEndTime'], (result) => {
                    sendResponse({
                        lastDuration: result.lastMeetingDuration || 0,
                        lastEndTime: result.lastMeetingEndTime || null
                    });
                });
                return true;
            }

            if (message.action === "getMuteStatus") {
                const status = getMuteStatus();
                sendResponse(status);
            }

            if (message.action === "showMeetStatus") {
                const duration = message.duration || 4000;
                showMeetStatus(message.message, duration);
                sendResponse({ success: true });
            }
            
            if (message.action === "updateMeetTimer") {
                const status = document.getElementById('meet-recorder-status');
                if (status && status.textContent.includes('Recording')) {
                    status.textContent = `🔴 Recording... ${message.time}`;
                } else if (isInMeeting && recordingStarted) {
                    showMeetStatus(`🔴 Recording... ${message.time}`);
                }
                sendResponse({ success: true });
            }

            if (message.action === "recordingCompleted") {
                recordingStarted = false;
                if (autoRecordEnabled) {
                    showMeetStatus("✅ Auto Recording Completed & Downloaded");
                } else {
                    showMeetStatus("✅ Recording Completed & Downloaded");
                }
                sendResponse({ success: true });
            }

            if (message.action === "forceResetAndRetry") {
                console.log("📨 Received force reset command");
                forceResetAndRetry();
                sendResponse({ success: true });
            }
            
            return true;
        });

        function forceResetAndRetry() {
            console.log("🔄 FORCE RESET - Resetting everything...");
            recordingStarted = false;
            forceMeetingRedetection();
            
            const existingStatus = document.getElementById('meet-recorder-status');
            if (existingStatus) existingStatus.remove();
            
            chrome.storage.local.set({ 
                isRecording: false,
                recordingStoppedByTabClose: true
            });
            
            chrome.runtime.sendMessage({ action: "refreshExtensionState" });
            
            showMeetStatus("🔄 Force reset - checking meeting state...");
            
            setTimeout(() => {
                console.log("🔄 Attempting auto-record after reset...");
                forceMeetingRedetection();
                
                if (isInMeeting && autoRecordEnabled && !recordingStarted) {
                    console.log("✅ Conditions met - starting auto recording");
                    startAutoRecording();
                } else {
                    console.log("❌ Conditions not met after reset:", {
                        isInMeeting,
                        autoRecordEnabled,
                        recordingStarted
                    });
                }
            }, 3000);
        }

        // Initialize
        setTimeout(async () => {
            await initializeWithStateRecovery();
            console.log("🔍 Meet Auto Recorder content script fully loaded with state recovery");
        }, 1000);
    }

    // ==================== MICROSOFT TEAMS ====================
    function teamsContent() {
        console.log("🔍 Initializing Microsoft Teams content script");

        let isInMeeting = false;
        let recordingStarted = false;
        let autoRecordEnabled = false;
        let joinButtonObserver = null;

        async function checkAutoRecordPermission() {
            return new Promise((resolve) => {
                chrome.storage.local.get(['autoRecordPermission'], (result) => {
                    autoRecordEnabled = result.autoRecordPermission || false;
                    console.log("🔐 Auto record enabled:", autoRecordEnabled);
                    resolve(autoRecordEnabled);
                });
            });
        }

        function findJoinButton() {
            const joinButton = document.getElementById('prejoin-join-button');
            if (joinButton) {
                console.log("🔍 Found Join button:", {
                    id: joinButton.id,
                    text: joinButton.textContent,
                    visible: isElementVisible(joinButton)
                });
                return joinButton;
            }
            
            const fallbackSelectors = [
                'button[data-tid="prejoin-join-button"]',
                'button[aria-label*="Join"]',
                'button[aria-label*="join"]',
                '.join-button',
                'button[title*="Join"]',
                'button[title*="join"]'
            ];
            
            for (const selector of fallbackSelectors) {
                const button = document.querySelector(selector);
                if (button && isElementVisible(button)) {
                    console.log("🔍 Found Join button with selector:", selector);
                    return button;
                }
            }
            
            return null;
        }

        function isElementVisible(element) {
            if (!element) return false;
            const style = window.getComputedStyle(element);
            const rect = element.getBoundingClientRect();
            return style.display !== 'none' && 
                   style.visibility !== 'hidden' && 
                   style.opacity !== '0' &&
                   rect.width > 0 && 
                   rect.height > 0 &&
                   element.offsetParent !== null;
        }

        function setupJoinButtonClickHandler() {
            document.removeEventListener('click', handleJoinButtonClick, true);
            document.addEventListener('click', handleJoinButtonClick, true);
            console.log("🖱️ Join button click handler activated");
        }

        function handleJoinButtonClick(event) {
            let target = event.target;
            
            while (target && target !== document.body) {
                if (isJoinButton(target)) {
                    console.log("🎯 JOIN BUTTON CLICKED - User is joining meeting");
                    console.log("⏰ Starting 3-second delay before recording...");
                    
                    setTimeout(() => {
                        meetingStarted();
                    }, 3000);
                    
                    break;
                }
                target = target.parentElement;
            }
        }

        function isJoinButton(element) {
            if (!element) return false;
            if (element.id === 'prejoin-join-button') return true;
            if (element.getAttribute('data-tid') === 'prejoin-join-button') return true;
            
            const ariaLabel = element.getAttribute('aria-label') || '';
            const title = element.getAttribute('title') || '';
            const textContent = element.textContent || '';
            
            return (ariaLabel.toLowerCase().includes('join') && 
                    !ariaLabel.toLowerCase().includes('leave')) ||
                   (title.toLowerCase().includes('join') &&
                    !title.toLowerCase().includes('leave')) ||
                   textContent.toLowerCase().includes('join now') ||
                   textContent.trim() === 'Join now';
        }

        function setupLeaveButtonClickHandler() {
            document.removeEventListener('click', handleLeaveButtonClick, true);
            document.addEventListener('click', handleLeaveButtonClick, true);
            console.log("🖱️ Leave button click handler activated");
        }

        function handleLeaveButtonClick(event) {
            let target = event.target;
            
            while (target && target !== document.body) {
                if (isLeaveButton(target)) {
                    console.log("🛑 LEAVE BUTTON CLICKED - Meeting ended by user");
                    meetingEnded();
                    break;
                }
                target = target.parentElement;
            }
        }

        function isLeaveButton(element) {
            if (!element) return false;
            if (element.id === 'hangup-button') return true;
            
            const ariaLabel = element.getAttribute('aria-label') || '';
            const title = element.getAttribute('title') || '';
            const dataTid = element.getAttribute('data-tid') || '';
            
            return ariaLabel.toLowerCase().includes('leave') ||
                   ariaLabel.toLowerCase().includes('hang up') ||
                   title.toLowerCase().includes('leave') ||
                   title.toLowerCase().includes('hang up') ||
                   dataTid.includes('hangup') ||
                   element.classList.contains('hangup-button');
        }

        function meetingStarted() {
            if (isInMeeting) return;
            
            const startTime = new Date().toLocaleTimeString();
            console.log(`🎯 MEETING STARTED - 3-second delay completed at ${startTime}`);
            isInMeeting = true;
            
            if (autoRecordEnabled && !recordingStarted) {
                console.log("🎬 AUTO RECORDING - Starting recording after delay");
                startAutoRecording();
            } else {
                console.log("ℹ️ Auto recording not enabled or already recording");
            }
            
            showMeetingNotification("started");
            chrome.storage.local.set({ isInMeeting: isInMeeting });
        }

        function meetingEnded() {
            if (!isInMeeting) return;
            
            const endTime = new Date().toLocaleTimeString();
            console.log(`🎯 MEETING ENDED - Leave button was clicked at ${endTime}`);
            isInMeeting = false;
            
            if (recordingStarted) {
                console.log("⏹️ AUTO STOPPING - Stopping recording due to meeting end");
                stopAutoRecording();
            }
            
            showMeetingNotification("ended");
            chrome.storage.local.set({ isInMeeting: isInMeeting });
        }

        function startAutoRecording() {
            if (recordingStarted) return;
            
            console.log("🎬 Attempting auto recording start...");
            recordingStarted = true;
            
            chrome.runtime.sendMessage({ 
                action: "autoStartRecording"
            }, (response) => {
                if (response && response.success) {
                    console.log("✅ Auto recording started successfully");
                    showRecordingNotification("started");
                } else {
                    console.log("❌ Auto recording failed to start");
                    recordingStarted = false;
                }
            });
        }

        function stopAutoRecording() {
            if (!recordingStarted) return;
            
            console.log("🛑 Attempting auto recording stop...");
            
            chrome.runtime.sendMessage({ action: "autoStopRecording" }, (response) => {
                if (response && response.success) {
                    console.log("✅ Auto recording stopped successfully");
                    recordingStarted = false;
                    showRecordingNotification("stopped");
                } else {
                    console.log("❌ Auto recording failed to stop");
                }
            });
        }

        function showMeetingNotification(type) {
            const existingNotification = document.getElementById('meeting-status-notification');
            if (existingNotification) {
                existingNotification.remove();
            }

            const notification = document.createElement('div');
            notification.id = 'meeting-status-notification';
            
            const currentTime = new Date().toLocaleTimeString();
            
            if (type === "started") {
                notification.style.cssText = `
                    position: fixed;
                    top: 10px;
                    left: 50%;
                    transform: translateX(-50%);
                    background: #4CAF50;
                    color: white;
                    padding: 12px 18px;
                    border-radius: 8px;
                    z-index: 10000;
                    font-family: Arial, sans-serif;
                    font-size: 14px;
                    font-weight: bold;
                    box-shadow: 0 4px 12px rgba(0,0,0,0.3);
                    border: 2px solid #45a049;
                `;
                notification.textContent = `🔴 Meeting Started - ${currentTime}`;
            } else {
                notification.style.cssText = `
                    position: fixed;
                    top: 10px;
                    left: 50%;
                    transform: translateX(-50%);
                    background: #f44336;
                    color: white;
                    padding: 12px 18px;
                    border-radius: 8px;
                    z-index: 10000;
                    font-family: Arial, sans-serif;
                    font-size: 14px;
                    font-weight: bold;
                    box-shadow: 0 4px 12px rgba(0,0,0,0.3);
                    border: 2px solid #d32f2f;
                `;
                notification.textContent = `⏹️ Meeting Ended - ${currentTime}`;
            }
            
            document.body.appendChild(notification);
            
            setTimeout(() => {
                if (notification.parentNode) {
                    notification.parentNode.removeChild(notification);
                }
            }, 5000);
        }

        function showRecordingNotification(type) {
            const notification = document.createElement('div');
            notification.id = 'recording-status-notification';
            notification.style.cssText = `
                position: fixed;
                top: 60px;
                left: 50%;
                transform: translateX(-50%);
                background: ${type === 'started' ? '#2196F3' : '#FF9800'};
                color: white;
                padding: 8px 12px;
                border-radius: 5px;
                z-index: 9999;
                font-family: Arial, sans-serif;
                font-size: 11px;
                box-shadow: 0 2px 8px rgba(0,0,0,0.2);
            `;
            notification.textContent = type === 'started' 
                ? '🔴 Recording Started' 
                : '⏹️ Recording Stopped - Downloading...';
            
            document.body.appendChild(notification);
            
            setTimeout(() => {
                if (notification.parentNode) {
                    notification.parentNode.removeChild(notification);
                }
            }, 4000);
        }

        function setupJoinButtonObserver() {
            if (joinButtonObserver) {
                joinButtonObserver.disconnect();
            }

            joinButtonObserver = new MutationObserver((mutations) => {
                let joinButtonAppeared = false;
                
                mutations.forEach((mutation) => {
                    if (mutation.type === 'childList') {
                        mutation.addedNodes.forEach(node => {
                            if (node.nodeType === 1 && (
                                node.id === 'prejoin-join-button' || 
                                node.getAttribute('data-tid') === 'prejoin-join-button' ||
                                (node.getAttribute('aria-label') && node.getAttribute('aria-label').toLowerCase().includes('join'))
                            )) {
                                console.log("➕ Join button added to DOM");
                                joinButtonAppeared = true;
                            }
                        });
                    }
                    
                    if (mutation.type === 'attributes' && 
                        (mutation.target.id === 'prejoin-join-button' || 
                         mutation.target.getAttribute('data-tid') === 'prejoin-join-button' ||
                         (mutation.target.getAttribute('aria-label') && mutation.target.getAttribute('aria-label').toLowerCase().includes('join')))) {
                        console.log("⚡ Join button attribute changed:", mutation.attributeName);
                        joinButtonAppeared = true;
                    }
                });
                
                if (joinButtonAppeared) {
                    console.log("🔍 Join button state changed, setting up click handler...");
                    setTimeout(() => {
                        setupJoinButtonClickHandler();
                        setupLeaveButtonClickHandler();
                    }, 500);
                }
            });

            joinButtonObserver.observe(document.body, {
                childList: true,
                subtree: true,
                attributes: true,
                attributeFilter: ['style', 'class', 'aria-hidden', 'disabled', 'id', 'data-tid', 'aria-label', 'title']
            });
        }

        // Message listener for Teams
        chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
            console.log("📨 Content script received:", message.action);
            
            if (message.action === "updateAutoRecordPermission") {
                autoRecordEnabled = message.enabled;
                console.log("🔐 Auto record permission updated:", autoRecordEnabled);
                sendResponse({ success: true });
            }

            if (message.action === "checkMeetingStatus") {
                sendResponse({ 
                    isInMeeting: isInMeeting, 
                    recording: recordingStarted,
                    autoRecordEnabled: autoRecordEnabled
                });
            }
            
            return true;
        });

        function initializeDetection() {
            setupJoinButtonObserver();
            setupJoinButtonClickHandler();
            setupLeaveButtonClickHandler();
            
            const existingJoinButton = findJoinButton();
            if (existingJoinButton) {
                console.log("✅ Join button already present on page");
            }
            
            let lastUrl = location.href;
            const urlObserver = new MutationObserver(() => {
                const url = location.href;
                if (url !== lastUrl) {
                    lastUrl = url;
                    console.log("🔗 URL changed, reinitializing detection...");
                    setTimeout(() => {
                        initializeDetection();
                    }, 2000);
                }
            });
            
            urlObserver.observe(document, { subtree: true, childList: true });
        }

        // Initialize Teams
        setTimeout(() => {
            initializeDetection();
            console.log("🔍 Teams Auto Recorder initialized");
        }, 1500);
    }
})();
*/


/* WORKING CODE -1
// UNIFIED CONTENT.JS - Google Meet & Microsoft Teams
(function() {
    'use strict';

    // Service detection
    function detectService() {
        const url = window.location.href;
        if (url.includes('meet.google.com')) return 'gmeet';
        if (url.includes('teams.microsoft.com') || url.includes('teams.live.com')) return 'teams';
        return null;
    }

    const currentService = detectService();

    // Initialize based on service
    if (currentService === 'gmeet') {
        gmeetContent();
    } else if (currentService === 'teams') {
        teamsContent();
    }

    // ==================== GOOGLE MEET ====================
    function gmeetContent() {
        console.log("🔍 Initializing Google Meet content script");

        let isInMeeting = false;
        let recordingStarted = false;
        let autoRecordEnabled = false;
        let leaveButtonObserver = null;
        let lastLeaveButtonVisible = false;

        // Meeting Detection + Timer + Duration        
        let meetingStarted = false;
        let meetingStartTime = null;
        let meetingEndTime = null;
        let totalMeetingDuration = 0;

        function showMeetStatus(message, duration = 4000) {
            const existing = document.getElementById('meet-recorder-status');
            
            if (existing && message.includes("Recording...")) {
                existing.innerHTML = message.replace(/\n/g, '<br>');
                return;
            }
            
            if (existing) existing.remove();
            
            const status = document.createElement('div');
            status.id = 'meet-recorder-status';
            status.innerHTML = message.replace(/\n/g, '<br>');
            status.style.cssText = `
                position: fixed;
                top: 20px;
                right: 20px;
                background: rgba(0,0,0,0.95);
                color: white;
                padding: 12px 16px;
                border-radius: 10px;
                font-family: 'Google Sans', Arial, sans-serif;
                font-size: 14px;
                z-index: 100000;
                font-weight: bold;
                border: 2px solid #4285f4;
                box-shadow: 0 4px 12px rgba(0,0,0,0.3);
                backdrop-filter: blur(10px);
                max-width: 400px;
                word-wrap: break-word;
            `;
            
            document.body.appendChild(status);

            if (!message.includes("Recording...")) {
                setTimeout(() => {
                    const currentStatus = document.getElementById('meet-recorder-status');
                    if (currentStatus && !currentStatus.innerHTML.includes("Recording...")) {
                        currentStatus.remove();
                    }
                }, duration);
            }
        }

        function startMeetingTimer() {
            meetingStartTime = Date.now();
            const startTime = new Date(meetingStartTime).toLocaleTimeString();
            console.log(`%c📅 Meeting started at : ${startTime}`,"color: #0f9d58; font-weight: bold;");
            showMeetStatus(`📅 Meeting started at: ${startTime}`, 5000);
        }

        function stopMeetingTimer() {
            if (meetingStartTime) {
                meetingEndTime = Date.now();
                totalMeetingDuration = Math.floor((meetingEndTime - meetingStartTime) / 1000);
                
                const minutes = Math.floor(totalMeetingDuration / 60);
                const seconds = totalMeetingDuration % 60;
                const endTime = new Date(meetingEndTime).toLocaleTimeString();

                console.log(`%c📅 Meeting ended at : ${new Date(meetingEndTime).toLocaleTimeString()}`, "color: #d93025; font-weight: bold;");
                console.log(`%c⏱️ Duration of meeting : ${minutes}m ${seconds}s`, "color: #f4b400; font-weight: bold;");

                showMeetStatus(`📅 Meeting ended at : ${endTime}\n Duration: ${minutes}m ${seconds}s`, 5000);

                chrome.storage.local.set({
                    lastMeetingDuration: totalMeetingDuration,
                    lastMeetingEndTime: meetingEndTime
                });
                
                meetingStartTime = null;
                meetingEndTime = null;
            }
        }

        function getCurrentMeetingDuration() {
            if (meetingStartTime) {
                const currentDuration = Math.floor((Date.now() - meetingStartTime) / 1000);
                const minutes = Math.floor(currentDuration / 60);
                const seconds = currentDuration % 60;
                return `${minutes}m ${seconds}s`;
            }
            return "0m 0s";
        }

        function isMeetingActive() {
            return document.querySelector('[aria-label^="Leave call"], [aria-label^="Leave meeting"]');
        }

        async function checkAutoRecordPermission() {
            return new Promise((resolve) => {
                chrome.storage.local.get(['autoRecordPermissions'], (result) => {
                    // Get service-specific permission
                    autoRecordEnabled = result.autoRecordPermissions?.['gmeet'] || false;
                    console.log(`🔐 Auto record enabled for gmeet:`, autoRecordEnabled);
                    resolve(autoRecordEnabled);
                });
            });
        }
        
        function startAutoRecordingImmediately() {
            if (isInMeeting && autoRecordEnabled && !recordingStarted) {
                console.log("🚀 Auto-record toggled ON mid-meeting - starting recording immediately");
                showMeetStatus("🟡 Auto recording starting now...");
                startAutoRecording();
            }
        }

        function findLeaveButton() {
            const selectors = [
                'button[aria-label="Leave call"]',
                'button[aria-label*="Leave call"]',
                'div[role="button"][data-tooltip="Leave call"]',
                'div[role="button"][aria-label*="Leave"]',
                'button[jscontroller][jsname][aria-label*="Leave"]',
            ];
            for (const selector of selectors) {
                const el = document.querySelector(selector);
                if (el) return el;
            }
            return null;
        }

        function isElementVisible(element) {
            if (!element) return false;
            const style = window.getComputedStyle(element);
            const rect = element.getBoundingClientRect();
            return style.display !== 'none' &&
                   style.visibility !== 'hidden' &&
                   style.opacity !== '0' &&
                   rect.width > 0 &&
                   rect.height > 0 &&
                   element.offsetParent !== null;
        }        

        function checkMeetingState() {

            const leaveButton = findLeaveButton();
            const leaveVisible = leaveButton && isElementVisible(leaveButton);

            if (leaveVisible && !lastLeaveButtonVisible) {
                console.log("✅ Leave button visible - Meeting joined");
                isInMeeting = true;
                meetingStarted = true;
                startMeetingTimer();

                const startTime = new Date(meetingStartTime).toLocaleTimeString();
                
                if (autoRecordEnabled && !recordingStarted) {
                    console.log("🔄 Auto-record enabled - starting recording in 3 seconds...");
                    showMeetStatus(`📅 Meeting started at: ${startTime}\n🟡 Auto recording starting in 3 seconds...`);

                    // Clear any existing timeout
                    if (window.autoRecordTimeout) {
                        clearTimeout(window.autoRecordTimeout);
                    }
                    
                    window.autoRecordTimeout = setTimeout(async () => {
                        if (isInMeeting && autoRecordEnabled && !recordingStarted) {
                            await startAutoRecording();
                        }
                    }, 3000);
                } else {
                    showMeetStatus(`📅 Meeting started at: ${startTime}`, 5000);
                }
            }

            if (!leaveVisible && lastLeaveButtonVisible) {
                console.log("❌ Leave button hidden - Meeting ended");
                isInMeeting = false;
                meetingStarted = false;
                stopMeetingTimer();
                
                // Clear auto-record timeout if meeting ended
                if (window.autoRecordTimeout) {
                    clearTimeout(window.autoRecordTimeout);
                    window.autoRecordTimeout = null;
                }
        
                if (recordingStarted) {
                    console.log("🛑 Meeting ended - stopping recording");
                    chrome.runtime.sendMessage({ action: "stopRecordingOnMeetingEnd" });
                }
            }

            lastLeaveButtonVisible = leaveVisible;
            chrome.storage.local.set({ isInMeeting });
        }

        function forceMeetingRedetection() {
            console.log("🔍 Force re-detecting meeting state...");
            const leaveButton = findLeaveButton();
            const leaveVisible = leaveButton && isElementVisible(leaveButton);
            
            if (leaveVisible && !isInMeeting) {
                console.log("✅ Force detected: In meeting");
                isInMeeting = true;
                meetingStarted = true;
                if (!meetingStartTime) {
                    startMeetingTimer();
                }
                return true;
            } else if (!leaveVisible && isInMeeting) {
                console.log("✅ Force detected: Not in meeting");
                isInMeeting = false;
                meetingStarted = false;
                return false;
            }
            return isInMeeting;
        }

        function aggressiveInitialCheck() {
            setTimeout(() => {
                console.log("🔍 Aggressive initial meeting check...");
                checkMeetingState();
                setTimeout(() => {
                    if (!isInMeeting) {
                        checkMeetingState();
                    }
                }, 2000);
            }, 1000);
        }

        async function startAutoRecording() {
            if (recordingStarted) {
                console.log("⚠️ Auto recording already started, skipping");
                return;
            }
            
            console.log("🚀 Starting auto recording...");

            chrome.storage.local.set({ isRecording: false });

            
            try {
                const response = await new Promise((resolve) => {
                    chrome.runtime.sendMessage({ action: "autoStartRecording" }, resolve);
                });
                
                if (response?.success) {
                    recordingStarted = true;            
                    chrome.storage.local.set({ isRecording: true });

                } else {
                    console.log("❌ Failed to start auto recording:", response);
                    recordingStarted = false;
                    showMeetStatus("❌ Auto Recording Failed");
                    // Retry after 3 seconds if failed
                    setTimeout(() => {
                        if (isInMeeting && autoRecordEnabled && !recordingStarted) {
                            console.log("🔄 Retrying auto recording...");
                            startAutoRecording();
                        }
                    }, 3000);
                }
            } catch (error) {
                console.log("❌ Error starting auto recording:", error);
                recordingStarted = false;
                showMeetStatus("❌ Auto Recording Error");
            }
        }

        async function initializeWithStateRecovery() {
            await checkAutoRecordPermission();
            setupLeaveButtonObserver();
            
            const storageState = await new Promise(resolve => {
                chrome.storage.local.get(['isRecording', 'isInMeeting'], resolve);
            });
            
            console.log("🔄 State recovery check:", storageState);
            
            if (storageState.isInMeeting && !isInMeeting) {
                console.log("🔄 Recovering meeting state from storage");
                forceMeetingRedetection();
            }
            
            if (storageState.isRecording && !recordingStarted) {
                console.log("🔄 Resetting inconsistent recording state");
                chrome.storage.local.set({ isRecording: false });
            }
            
            checkInitialMeetingState();
            setInterval(checkMeetingState, 2000);
            aggressiveInitialCheck();
        }

        function stopAutoRecording() {
            if (!recordingStarted) return;
            recordingStarted = false;

            chrome.runtime.sendMessage({ action: "autoStopRecording" }, (response) => {
                if (response?.success) {
                    console.log("✅ Auto recording stopped");
                    if (autoRecordEnabled) {
                        chrome.runtime.sendMessage({ action: "closeRecorderTab" });
                    }
                } else {
                    console.log("❌ Failed to stop auto recording");
                }
            });
        }

        function setupLeaveButtonObserver() {
            if (leaveButtonObserver) leaveButtonObserver.disconnect();
            leaveButtonObserver = new MutationObserver(() => {
                setTimeout(checkMeetingState, 500);
            });
            leaveButtonObserver.observe(document.body, {
                childList: true,
                subtree: true,
                attributes: true,
                attributeFilter: ['style', 'class', 'aria-hidden', 'disabled']
            });
        }

        function checkInitialMeetingState() {
            const leaveButton = findLeaveButton();
            const leaveVisible = leaveButton && isElementVisible(leaveButton);
            
            if (leaveVisible && !isInMeeting) {
                console.log("🔍 Already in meeting - will auto-start recording in 3 seconds");
                isInMeeting = true;
                meetingStarted = true;
                
                if (!meetingStartTime) {
                    startMeetingTimer();
                }
                
                if (autoRecordEnabled && !recordingStarted) {
                    console.log("🚀 Auto-starting recording for existing meeting");
                    showMeetStatus("🟡 Auto recording starting in 3 seconds...", 3000);
                    setTimeout(async () => {
                        await startAutoRecording();
                    }, 3000);
                }
            }
        }

        function getMuteStatus() {
            const muteButton = document.querySelector('[aria-label*="microphone"]') || 
                             document.querySelector('[data-tooltip*="microphone"]') ||
                             document.querySelector('[jscontroller*="microphone"]');
            
            if (muteButton) {
                const ariaLabel = muteButton.getAttribute('aria-label') || '';
                const isMuted = ariaLabel.includes('unmute') || ariaLabel.includes('Turn on');
                return { isMuted: isMuted };
            }
            
            const muteIcon = document.querySelector('svg[aria-label*="microphone"]');
            if (muteIcon) {
                const ariaLabel = muteIcon.getAttribute('aria-label') || '';
                const isMuted = ariaLabel.includes('unmute') || ariaLabel.includes('Turn on');
                return { isMuted: isMuted };
            }
            
            return { isMuted: true };
        }

        // Message listener for Google Meet
        chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
            if (message.action === "updateAutoRecordPermission") {
                autoRecordEnabled = message.enabled;
                console.log(`🔄 Auto record permission updated for ${currentService}:`, autoRecordEnabled);
                sendResponse({ success: true });
            }

            if (message.action === "autoRecordToggledOn") {
                autoRecordEnabled = message.enabled;
                console.log("🔄 Auto-record toggled ON, checking if we're in a meeting...");
                startAutoRecordingImmediately();
                sendResponse({ success: true });
            }

            if (message.action === "checkMeetingStatus") {
                sendResponse({ 
                    isInMeeting, 
                    recording: recordingStarted, 
                    autoRecordEnabled,
                    meetingDuration: getCurrentMeetingDuration()
                });
            }

            if (message.action === "autoStopRecording") {
                stopAutoRecording();
                sendResponse({ success: true });
            }

            if (message.action === "getMeetingDuration") {
                const duration = getCurrentMeetingDuration();
                sendResponse({ 
                    duration: duration,
                    isInMeeting: isInMeeting,
                    startTime: meetingStartTime
                });
            }

            if (message.action === "getLastMeetingStats") {
                chrome.storage.local.get(['lastMeetingDuration', 'lastMeetingEndTime'], (result) => {
                    sendResponse({
                        lastDuration: result.lastMeetingDuration || 0,
                        lastEndTime: result.lastMeetingEndTime || null
                    });
                });
                return true;
            }

            if (message.action === "getMuteStatus") {
                const status = getMuteStatus();
                sendResponse(status);
            }

            if (message.action === "showMeetStatus") {
                const duration = message.duration || 4000;
                showMeetStatus(message.message, duration);
                sendResponse({ success: true });
            }
            
            if (message.action === "updateMeetTimer") {
                const status = document.getElementById('meet-recorder-status');
                if (status && status.textContent.includes('Recording')) {
                    status.textContent = `🔴 Recording... ${message.time}`;
                } else if (isInMeeting && recordingStarted) {
                    showMeetStatus(`🔴 Recording... ${message.time}`);
                }
                sendResponse({ success: true });
            }

            if (message.action === "recordingCompleted") {
                recordingStarted = false;
                if (autoRecordEnabled) {
                    showMeetStatus("✅ Auto Recording Completed & Downloaded");
                } else {
                    showMeetStatus("✅ Recording Completed & Downloaded");
                }
                sendResponse({ success: true });
            }

            if (message.action === "forceResetAndRetry") {
                console.log("📨 Received force reset command");
                forceResetAndRetry();
                sendResponse({ success: true });
            }
            
            return true;
        });

        function forceResetAndRetry() {
            console.log("🔄 FORCE RESET - Resetting everything...");
            recordingStarted = false;
            forceMeetingRedetection();
            
            const existingStatus = document.getElementById('meet-recorder-status');
            if (existingStatus) existingStatus.remove();
            
            chrome.storage.local.set({ 
                isRecording: false,
                recordingStoppedByTabClose: true
            });
            
            chrome.runtime.sendMessage({ action: "refreshExtensionState" });
            
            showMeetStatus("🔄 Force reset - checking meeting state...");
            
            setTimeout(() => {
                console.log("🔄 Attempting auto-record after reset...");
                forceMeetingRedetection();
                
                if (isInMeeting && autoRecordEnabled && !recordingStarted) {
                    console.log("✅ Conditions met - starting auto recording");
                    startAutoRecording();
                } else {
                    console.log("❌ Conditions not met after reset:", {
                        isInMeeting,
                        autoRecordEnabled,
                        recordingStarted
                    });
                }
            }, 3000);
        }       

        // Initialize
        setTimeout(async () => {
            await initializeWithStateRecovery();
            console.log("🔍 Meet Auto Recorder content script fully loaded with state recovery");
        }, 1000);
    }

    // ==================== MICROSOFT TEAMS ====================
    function teamsContent() {
        console.log("🔍 Initializing Microsoft Teams content script");

        let isInMeeting = false;
        let recordingStarted = false;
        let autoRecordEnabled = false;
        let joinButtonObserver = null;

        function startAutoRecordingImmediately() {
        if (isInMeeting && autoRecordEnabled && !recordingStarted) {
            console.log("🚀 Auto-record toggled ON mid-meeting - starting recording immediately");
            showMeetingNotification("autoRecordingStarted");
            startAutoRecording();
        }
        }

        async function checkAutoRecordPermission() {
        return new Promise((resolve) => {
            chrome.storage.local.get(['autoRecordPermissions'], (result) => {
                // Get service-specific permission for Teams
                autoRecordEnabled = result.autoRecordPermissions?.['teams'] || false;
                console.log("🔐 Auto record enabled for teams:", autoRecordEnabled);
                resolve(autoRecordEnabled);
            });
        });
        }

        function findJoinButton() {
            const joinButton = document.getElementById('prejoin-join-button');
            if (joinButton) {
                console.log("🔍 Found Join button:", {
                    id: joinButton.id,
                    text: joinButton.textContent,
                    visible: isElementVisible(joinButton)
                });
                return joinButton;
            }
            
            const fallbackSelectors = [
                'button[data-tid="prejoin-join-button"]',
                'button[aria-label*="Join"]',
                'button[aria-label*="join"]',
                '.join-button',
                'button[title*="Join"]',
                'button[title*="join"]'
            ];
            
            for (const selector of fallbackSelectors) {
                const button = document.querySelector(selector);
                if (button && isElementVisible(button)) {
                    console.log("🔍 Found Join button with selector:", selector);
                    return button;
                }
            }
            
            return null;
        }

        function isElementVisible(element) {
            if (!element) return false;
            const style = window.getComputedStyle(element);
            const rect = element.getBoundingClientRect();
            return style.display !== 'none' && 
                   style.visibility !== 'hidden' && 
                   style.opacity !== '0' &&
                   rect.width > 0 && 
                   rect.height > 0 &&
                   element.offsetParent !== null;
        }

        function setupJoinButtonClickHandler() {
            document.removeEventListener('click', handleJoinButtonClick, true);
            document.addEventListener('click', handleJoinButtonClick, true);
            console.log("🖱️ Join button click handler activated");
        }

        function handleJoinButtonClick(event) {
            let target = event.target;
            
            while (target && target !== document.body) {
                if (isJoinButton(target)) {
                    console.log("🎯 JOIN BUTTON CLICKED - User is joining meeting");
                    console.log("⏰ Starting 3-second delay before recording...");
                    
                    setTimeout(() => {
                        meetingStarted();
                    }, 3000);
                    
                    break;
                }
                target = target.parentElement;
            }
        }

        function isJoinButton(element) {
            if (!element) return false;
            if (element.id === 'prejoin-join-button') return true;
            if (element.getAttribute('data-tid') === 'prejoin-join-button') return true;
            
            const ariaLabel = element.getAttribute('aria-label') || '';
            const title = element.getAttribute('title') || '';
            const textContent = element.textContent || '';
            
            return (ariaLabel.toLowerCase().includes('join') && 
                    !ariaLabel.toLowerCase().includes('leave')) ||
                   (title.toLowerCase().includes('join') &&
                    !title.toLowerCase().includes('leave')) ||
                   textContent.toLowerCase().includes('join now') ||
                   textContent.trim() === 'Join now';
        }

        function setupLeaveButtonClickHandler() {
            document.removeEventListener('click', handleLeaveButtonClick, true);
            document.addEventListener('click', handleLeaveButtonClick, true);
            console.log("🖱️ Leave button click handler activated");
        }

        function handleLeaveButtonClick(event) {
            let target = event.target;
            
            while (target && target !== document.body) {
                if (isLeaveButton(target)) {
                    console.log("🛑 LEAVE BUTTON CLICKED - Meeting ended by user");
                    meetingEnded();
                    break;
                }
                target = target.parentElement;
            }
        }

        function isLeaveButton(element) {
            if (!element) return false;
            if (element.id === 'hangup-button') return true;
            
            const ariaLabel = element.getAttribute('aria-label') || '';
            const title = element.getAttribute('title') || '';
            const dataTid = element.getAttribute('data-tid') || '';
            
            return ariaLabel.toLowerCase().includes('leave') ||
                   ariaLabel.toLowerCase().includes('hang up') ||
                   title.toLowerCase().includes('leave') ||
                   title.toLowerCase().includes('hang up') ||
                   dataTid.includes('hangup') ||
                   element.classList.contains('hangup-button');
        }

        function meetingStarted() {
            if (isInMeeting) return;
            
            const startTime = new Date().toLocaleTimeString();
            console.log(`🎯 MEETING STARTED - 3-second delay completed at ${startTime}`);
            isInMeeting = true;
            
            if (autoRecordEnabled && !recordingStarted) {
                console.log("🎬 AUTO RECORDING - Starting recording after delay");
                startAutoRecording();
            } else {
                console.log("ℹ️ Auto recording not enabled or already recording");
            }
            
            showMeetingNotification("started");
            chrome.storage.local.set({ isInMeeting: isInMeeting });
        }

        function meetingEnded() {
            if (!isInMeeting) return;
            
            const endTime = new Date().toLocaleTimeString();
            console.log(`🎯 MEETING ENDED - Leave button was clicked at ${endTime}`);
            isInMeeting = false;
            
            if (recordingStarted) {
                console.log("⏹️ AUTO STOPPING - Stopping recording due to meeting end");
                stopAutoRecording();
            }
            
            showMeetingNotification("ended");
            chrome.storage.local.set({ isInMeeting: isInMeeting });
        }

        function startAutoRecording() {
            if (recordingStarted) return;
            
            console.log("🎬 Attempting auto recording start...");
            recordingStarted = true;
            
            chrome.runtime.sendMessage({ 
                action: "autoStartRecording"
            }, (response) => {
                if (response && response.success) {
                    console.log("✅ Auto recording started successfully");
                    showRecordingNotification("started");
                } else {
                    console.log("❌ Auto recording failed to start");
                    recordingStarted = false;
                }
            });
        }

        function stopAutoRecording() {
            if (!recordingStarted) return;
            
            console.log("🛑 Attempting auto recording stop...");
            
            chrome.runtime.sendMessage({ action: "autoStopRecording" }, (response) => {
                if (response && response.success) {
                    console.log("✅ Auto recording stopped successfully");
                    recordingStarted = false;
                    showRecordingNotification("stopped");
                } else {
                    console.log("❌ Auto recording failed to stop");
                }
            });
        }

        function showMeetingNotification(type) {
            const existingNotification = document.getElementById('meeting-status-notification');
            if (existingNotification) {
                existingNotification.remove();
            }

            const notification = document.createElement('div');
            notification.id = 'meeting-status-notification';
            
            const currentTime = new Date().toLocaleTimeString();
            
            if (type === "started") {
                notification.style.cssText = `
                    position: fixed;
                    top: 10px;
                    left: 50%;
                    transform: translateX(-50%);
                    background: #4CAF50;
                    color: white;
                    padding: 12px 18px;
                    border-radius: 8px;
                    z-index: 10000;
                    font-family: Arial, sans-serif;
                    font-size: 14px;
                    font-weight: bold;
                    box-shadow: 0 4px 12px rgba(0,0,0,0.3);
                    border: 2px solid #45a049;
                `;
                notification.textContent = `🔴 Meeting Started - ${currentTime}`;
            }  else if (type === "autoRecordingStarted") {
                notification.style.cssText = `
                position: fixed;
                top: 10px;
                left: 50%;
                transform: translateX(-50%);
                background: #2196F3;
                color: white;
                padding: 12px 18px;
                border-radius: 8px;
                z-index: 10000;
                font-family: Arial, sans-serif;
                font-size: 14px;
                font-weight: bold;
                box-shadow: 0 4px 12px rgba(0,0,0,0.3);
                border: 2px solid #1976D2;
                `;
                notification.textContent = `🎬 Auto Recording Started - ${currentTime}`;
            } else {
                notification.style.cssText = `
                    position: fixed;
                    top: 10px;
                    left: 50%;
                    transform: translateX(-50%);
                    background: #f44336;
                    color: white;
                    padding: 12px 18px;
                    border-radius: 8px;
                    z-index: 10000;
                    font-family: Arial, sans-serif;
                    font-size: 14px;
                    font-weight: bold;
                    box-shadow: 0 4px 12px rgba(0,0,0,0.3);
                    border: 2px solid #d32f2f;
                `;
                notification.textContent = `⏹️ Meeting Ended - ${currentTime}`;
            }
            
            document.body.appendChild(notification);
            
            setTimeout(() => {
                if (notification.parentNode) {
                    notification.parentNode.removeChild(notification);
                }
            }, 5000);
        }

        function showRecordingNotification(type) {
            const notification = document.createElement('div');
            notification.id = 'recording-status-notification';
            notification.style.cssText = `
                position: fixed;
                top: 60px;
                left: 50%;
                transform: translateX(-50%);
                background: ${type === 'started' ? '#2196F3' : '#FF9800'};
                color: white;
                padding: 8px 12px;
                border-radius: 5px;
                z-index: 9999;
                font-family: Arial, sans-serif;
                font-size: 11px;
                box-shadow: 0 2px 8px rgba(0,0,0,0.2);
            `;
            notification.textContent = type === 'started' 
                ? '🔴 Recording Started' 
                : '⏹️ Recording Stopped - Downloading...';
            
            document.body.appendChild(notification);
            
            setTimeout(() => {
                if (notification.parentNode) {
                    notification.parentNode.removeChild(notification);
                }
            }, 4000);
        }

        function checkIfInMeeting() {
            // Check for various indicators that we're in a Teams meeting
            const indicators = [
                // Video container
                '[data-tid="video-layout"]',
                '[data-tid="meeting-container"]',
                // Participant list
                '[data-tid="roster-list"]',
                // Meeting controls
                '[data-tid="meeting-controls"]',
                '[data-tid="call-controls"]',
                // Leave button
                '[data-tid="hangup-button"]',
                'button[aria-label*="Leave"]',
                'button[aria-label*="Hang up"]',
                // Active speaker video
                '[data-tid="active-speaker-video"]',
                // More specific meeting indicators
                'div[role="main"][data-tid*="meeting"]',
                '.ts-calling-stage',
                '.call-stage'
            ];
        
            for (const selector of indicators) {
                const element = document.querySelector(selector);
                if (element && isElementVisible(element)) {
                    console.log("✅ Teams meeting detected with selector:", selector);
                    return true;
                }
            }
        
            // Additional check: look for multiple video elements which indicate active meeting
            const videoElements = document.querySelectorAll('video');
            const visibleVideos = Array.from(videoElements).filter(video => 
                video.readyState > 0 && 
                video.videoWidth > 0 && 
                video.videoHeight > 0 &&
                isElementVisible(video)
            );
        
            if (visibleVideos.length > 0) {
                console.log("✅ Teams meeting detected via active video elements:", visibleVideos.length);
                return true;
            }
        
            console.log("❌ No Teams meeting indicators found");
            return false;
        }

        function handleMidMeetingAutoRecord() {
            const inMeeting = checkIfInMeeting();
            console.log("🔍 Mid-meeting auto-record check:", { 
                inMeeting, 
                isInMeeting, 
                autoRecordEnabled, 
                recordingStarted 
            });

            if (inMeeting && !isInMeeting) {
                console.log("🔍 Detected active meeting - updating state");
                isInMeeting = true;
                chrome.storage.local.set({ isInMeeting: true });
                
                if (autoRecordEnabled && !recordingStarted) {
                    console.log("🚀 Auto-record enabled mid-meeting - starting recording");                
                        startAutoRecordingImmediately();
                }
            } else if (inMeeting && isInMeeting && autoRecordEnabled && !recordingStarted) {
                // We're already marked as in meeting but recording hasn't started
                console.log("🚀 Already in meeting with auto-record enabled - starting recording");
                startAutoRecordingImmediately();
            }
        }

        function setupJoinButtonObserver() {
            if (joinButtonObserver) {
                joinButtonObserver.disconnect();
            }

            joinButtonObserver = new MutationObserver((mutations) => {
                let joinButtonAppeared = false;
                
                mutations.forEach((mutation) => {
                    if (mutation.type === 'childList') {
                        mutation.addedNodes.forEach(node => {
                            if (node.nodeType === 1 && (
                                node.id === 'prejoin-join-button' || 
                                node.getAttribute('data-tid') === 'prejoin-join-button' ||
                                (node.getAttribute('aria-label') && node.getAttribute('aria-label').toLowerCase().includes('join'))
                            )) {
                                console.log("➕ Join button added to DOM");
                                joinButtonAppeared = true;
                            }
                        });
                    }
                    
                    if (mutation.type === 'attributes' && 
                        (mutation.target.id === 'prejoin-join-button' || 
                         mutation.target.getAttribute('data-tid') === 'prejoin-join-button' ||
                         (mutation.target.getAttribute('aria-label') && mutation.target.getAttribute('aria-label').toLowerCase().includes('join')))) {
                        console.log("⚡ Join button attribute changed:", mutation.attributeName);
                        joinButtonAppeared = true;
                    }
                });
                
                if (joinButtonAppeared) {
                    console.log("🔍 Join button state changed, setting up click handler...");
                    setTimeout(() => {
                        setupJoinButtonClickHandler();
                        setupLeaveButtonClickHandler();
                    }, 500);
                }
            });

            joinButtonObserver.observe(document.body, {
                childList: true,
                subtree: true,
                attributes: true,
                attributeFilter: ['style', 'class', 'aria-hidden', 'disabled', 'id', 'data-tid', 'aria-label', 'title']
            });
        }

        // Message listener for Teams
        chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
            console.log("📨 Teams content script received:", message.action);
            
            if (message.action === "updateAutoRecordPermission") {
                autoRecordEnabled = message.enabled;
                console.log("🔐 Auto record permission updated:", autoRecordEnabled);
                if (autoRecordEnabled) {
                console.log("🔄 Permission granted - checking current meeting status");
                    setTimeout(() => {
                        handleMidMeetingAutoRecord();
                    }, 500);
                }
                sendResponse({ success: true });
            }

            if (message.action === "autoRecordToggledOn") {
            autoRecordEnabled = message.enabled;
            console.log("🔄 Auto-record toggled ON, checking meeting status...");
            
            // Check if we're in a meeting and start recording immediately
            setTimeout(() => {
                handleMidMeetingAutoRecord();
            }, 500);
            
            sendResponse({ success: true });
            }

            if (message.action === "checkMeetingStatus") {
                const wasInMeeting = isInMeeting;
                handleMidMeetingAutoRecord();

                // If we just detected we're in a meeting and auto-record is enabled, start recording
                if (!wasInMeeting && isInMeeting && autoRecordEnabled && !recordingStarted) {
                console.log("🚀 Meeting detected with auto-record enabled - starting recording");
                setTimeout(() => {
                    startAutoRecordingImmediately();
                }, 1000);
                }

                sendResponse({ 
                    isInMeeting: isInMeeting, 
                    recording: recordingStarted,
                    autoRecordEnabled: autoRecordEnabled
                });
            }
            
            return true;
        });

        function initializeDetection() {
        // Load auto-record permission on initialization
        checkAutoRecordPermission().then(() => {
            console.log("🔐 Teams auto-record permission loaded:", autoRecordEnabled);
            
            // Then check meeting status
            setTimeout(() => {
                console.log("🔍 Initial meeting state check...");
                handleMidMeetingAutoRecord();
                
                // If auto-record is enabled and we're in a meeting, start recording
                if (autoRecordEnabled && isInMeeting && !recordingStarted) {
                    console.log("🚀 Auto-record enabled and in meeting - starting recording");
                    setTimeout(() => {
                        startAutoRecordingImmediately();
                    }, 2000);
                }
            }, 2000);
        });

        setupJoinButtonObserver();
        setupJoinButtonClickHandler();
        setupLeaveButtonClickHandler();
        
        const existingJoinButton = findJoinButton();
        if (existingJoinButton) {
            console.log("✅ Join button already present on page");
        }
        
        // Check if we're already in a meeting on initialization
        setTimeout(() => {
            handleMidMeetingAutoRecord();
        }, 3000);
        
        let lastUrl = location.href;
        const urlObserver = new MutationObserver(() => {
            const url = location.href;
            if (url !== lastUrl) {
                lastUrl = url;
                console.log("🔗 URL changed, reinitializing detection...");
                setTimeout(() => {
                    initializeDetection();
                }, 2000);
            }
        });
        
        urlObserver.observe(document, { subtree: true, childList: true });
        }

        // Initialize Teams
        setTimeout(() => {
            initializeDetection();
            console.log("🔍 Teams Auto Recorder initialized");
        }, 1500);
    }
})();

*/
