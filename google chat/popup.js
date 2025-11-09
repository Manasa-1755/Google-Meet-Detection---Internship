// Popup Script
document.addEventListener('DOMContentLoaded', function() {
    loadStatus();
    setInterval(loadStatus, 1000);
});

function loadStatus() {
    chrome.storage.local.get(['isInCall', 'callStartTime', 'callEndTime'], (result) => {
        const status = document.getElementById('status');
        const callInfo = document.getElementById('callInfo');
        
        if (result.isInCall) {
            status.innerHTML = '🔴 <div>In Meeting</div>';
            status.className = 'status in-call';
            
            if (result.callStartTime) {
                const startTime = new Date(result.callStartTime);
                const duration = Math.floor((Date.now() - result.callStartTime) / 1000);
                const minutes = Math.floor(duration / 60);
                const seconds = duration % 60;
                
                const formattedTime = startTime.toLocaleTimeString([], { 
                    hour: '2-digit', 
                    minute: '2-digit' 
                });
                
                callInfo.innerHTML = `
                    <div class="info-title">Meeting Started</div>
                    <div class="info-value">${formattedTime}</div>
                    
                    <div class="info-title" style="margin-top: 8px;">Duration</div>
                    <div class="info-value duration">${minutes}m ${seconds}s</div>
                `;
                
                console.log(`Meeting active - Started: ${formattedTime}, Duration: ${minutes}m ${seconds}s`);
            }
        } else {
            status.innerHTML = '✅ <div>Available</div>';
            status.className = 'status no-call';
            
            if (result.callEndTime) {
                const endTime = new Date(result.callEndTime);
                const formattedTime = endTime.toLocaleTimeString([], { 
                    hour: '2-digit', 
                    minute: '2-digit' 
                });
                
                callInfo.innerHTML = `
                    <div class="info-title">Last Meeting Ended</div>
                    <div class="info-value">${formattedTime}</div>
                `;
                
                console.log(`Meeting ended at: ${formattedTime}`);
            } else {
                callInfo.innerHTML = `
                    <div class="info-title">Status</div>
                    <div class="info-value">No active meetings</div>
                `;
            }
        }
    });
}