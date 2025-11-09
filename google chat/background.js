// Simple Background Script
console.log('🔧 Background loaded');

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    console.log('📨 Received:', request.action);
    
    if (request.action === 'callStarted') {
        console.log('🚀 CALL STARTED!');
        chrome.action.setBadgeBackgroundColor({ color: '#EA4335' });
        chrome.action.setBadgeText({ text: '🔴' });
        chrome.storage.local.set({ isInCall: true });
    }
    
    if (request.action === 'callEnded') {
        console.log('🛑 CALL ENDED');
        chrome.action.setBadgeBackgroundColor({ color: '#34A853' });
        chrome.action.setBadgeText({ text: '' });
        chrome.storage.local.set({ isInCall: false });
    }
    
    sendResponse({ received: true });
    return true;
});

// Monitor for Meet tabs
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.status === 'complete' && tab.url?.includes('meet.google.com')) {
        console.log('✅ Meet tab loaded:', tab.url);
    }
});