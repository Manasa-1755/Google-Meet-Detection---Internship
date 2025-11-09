// Google Meet Call Detector
console.log('Call Monitor: Detector loaded');

let isInCall = false;
let checkInterval;

function checkForCall() {
    const leaveButton = document.querySelector('button[aria-label="Leave call"]');
    
    if (leaveButton && !isInCall) {
        // CALL STARTED
        isInCall = true;
        const startTime = Date.now();
        console.log('Meeting started at:', new Date(startTime).toLocaleTimeString());
        
        // Show professional status indicator
        showMeetingStatus('Meeting Started');
        
        // Send to background
        chrome.runtime.sendMessage({
            action: 'callStarted',
            time: startTime
        });
        
        // Update storage with timing
        chrome.storage.local.set({
            isInCall: true,
            callStartTime: startTime,
            callEndTime: null
        });
    }
    
    if (!leaveButton && isInCall) {
        // CALL ENDED
        isInCall = false;
        const endTime = Date.now();
        console.log('Meeting ended at:', new Date(endTime).toLocaleTimeString());
        
        showMeetingStatus('Meeting Ended');
        
        chrome.runtime.sendMessage({
            action: 'callEnded',
            time: endTime
        });
        
        chrome.storage.local.set({
            isInCall: false,
            callEndTime: endTime
        });
        
        setTimeout(() => {
            document.getElementById('meeting-status-indicator')?.remove();
        }, 3000);
    }
}

function showMeetingStatus(message) {
    document.getElementById('meeting-status-indicator')?.remove();
    
    const indicator = document.createElement('div');
    indicator.id = 'meeting-status-indicator';
    indicator.textContent = message;
    indicator.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: #4285f4;
        color: white;
        padding: 12px 16px;
        border-radius: 8px;
        font-family: 'Segoe UI', Arial, sans-serif;
        font-size: 14px;
        font-weight: 500;
        z-index: 10000;
        box-shadow: 0 2px 10px rgba(0,0,0,0.2);
        border: 2px solid white;
    `;
    document.body.appendChild(indicator);
}

// Start checking immediately
console.log('Starting meeting detection...');
checkInterval = setInterval(checkForCall, 1000);

const observer = new MutationObserver(checkForCall);
observer.observe(document.body, {
    childList: true,
    subtree: true
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "ping") {
        sendResponse({ alive: true, isInCall: isInCall });
    }
    return true;
});