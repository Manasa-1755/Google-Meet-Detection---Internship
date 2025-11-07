// MAIN POPUP ROUTER - Dynamically loads platform-specific content
let currentPlatform = null;
let activeTabId = null;

document.addEventListener("DOMContentLoaded", async () => {
    await loadPopupContent();
    
    // Listen for tab changes to update popup dynamically
    chrome.tabs.onActivated.addListener(handleTabChange);
    chrome.tabs.onUpdated.addListener(handleTabUpdate);
});

async function loadPopupContent() {
    try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        await updatePopupForTab(tab);
    } catch (error) {
        console.error("❌ Error loading popup content:", error);
        showErrorState("Failed to load extension");
    }
}

async function updatePopupForTab(tab) {
    if (!tab?.url) {
        showNoTabMessage();
        return;
    }

    const platform = detectPlatform(tab.url);
    
    if (platform !== currentPlatform) {
        currentPlatform = platform;
        activeTabId = tab.id;
        
        if (platform === 'gmeet') {
            await loadGMeetInterface();
        } else if (platform === 'teams') {
            await loadTeamsInterface();
        } else {
            showNoPlatformMessage();
        }
    }
}

function detectPlatform(url) {
    if (url.includes("meet.google.com")) return 'gmeet';
    if (url.includes("teams.microsoft.com") || url.includes("teams.live.com")) return 'teams';
    return null;
}

async function loadGMeetInterface() {
    try {
        // Load GMeet popup HTML
        const response = await fetch(chrome.runtime.getURL('platforms/gmeet/popup-gmeet.html'));
        const html = await response.text();
        document.getElementById('popup-container').innerHTML = html;
        
        // Inject GMeet JavaScript
        const script = document.createElement('script');
        script.src = chrome.runtime.getURL('platforms/gmeet/popup-gmeet.js');
        script.onload = () => {
            // Initialize GMeet popup with current tab info
            if (window.initGMeetPopup && activeTabId) {
                window.initGMeetPopup(activeTabId);
            }
        };
        document.body.appendChild(script);
        
    } catch (error) {
        console.error("❌ Failed to load GMeet interface:", error);
        showErrorState("Failed to load Google Meet interface");
    }
}

async function loadTeamsInterface() {
    try {
        // Load Teams popup HTML
        const response = await fetch(chrome.runtime.getURL('platforms/teams/popup-teams.html'));
        const html = await response.text();
        document.getElementById('popup-container').innerHTML = html;
        
        // Inject Teams JavaScript
        const script = document.createElement('script');
        script.src = chrome.runtime.getURL('platforms/teams/popup-teams.js');
        script.onload = () => {
            // Initialize Teams popup with current tab info
            if (window.initTeamsPopup && activeTabId) {
                window.initTeamsPopup(activeTabId);
            }
        };
        document.body.appendChild(script);
        
    } catch (error) {
        console.error("❌ Failed to load Teams interface:", error);
        showErrorState("Failed to load Microsoft Teams interface");
    }
}

function showNoPlatformMessage() {
    document.getElementById('popup-container').innerHTML = `
        <div class="container">
            <div class="header">
                <h2>🎬 Meeting Recorder</h2>
                <div class="subtitle">Universal meeting recording solution</div>
            </div>
            <div class="platform-indicator">
                <span>🔍</span>
                <span>No meeting platform detected</span>
            </div>
            <div class="status-section">
                <div>❌ Please open Google Meet or Microsoft Teams</div>
            </div>
            <div class="important-note">
                Supports: Google Meet & Microsoft Teams<br>
                Features: Auto-record, Audio mixing, Background recording
            </div>
        </div>
    `;
}

function showNoTabMessage() {
    document.getElementById('popup-container').innerHTML = `
        <div class="container">
            <div class="header">
                <h2>🎬 Meeting Recorder</h2>
                <div class="subtitle">Universal meeting recording solution</div>
            </div>
            <div class="status-section">
                <div>❌ No active tab found</div>
            </div>
        </div>
    `;
}

function showErrorState(message) {
    document.getElementById('popup-container').innerHTML = `
        <div class="container">
            <div class="error">❌ ${message}</div>
        </div>
    `;
}

// Tab event handlers for dynamic updates
async function handleTabChange(activeInfo) {
    const tab = await chrome.tabs.get(activeInfo.tabId);
    await updatePopupForTab(tab);
}

async function handleTabUpdate(tabId, changeInfo, tab) {
    if (changeInfo.status === 'complete' && tab.active) {
        await updatePopupForTab(tab);
    }
}

// Global functions for platform scripts to access
window.getCurrentPlatform = () => currentPlatform;
window.getActiveTabId = () => activeTabId;