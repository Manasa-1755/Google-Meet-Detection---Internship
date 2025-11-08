// UNIFIED BACKGROUND.JS - Google Meet & Microsoft Teams
(function() {
    'use strict';

    let userPermissionGranted = false;
    let currentRecordingTab = null;
    let isAutoRecording = false;
    let autoStartTimeout = null;

    // Service detection
    function detectService(url) {
        if (url.includes('meet.google.com')) return 'gmeet';
        if (url.includes('teams.microsoft.com') || url.includes('teams.live.com')) return 'teams';
        return null;
    }

    // Load saved permission state
    chrome.storage.local.get(['autoRecordPermission'], (result) => {
        userPermissionGranted = result.autoRecordPermission || false;
        console.log("🔐 Auto record permission:", userPermissionGranted);
    });

    // Listen for tab updates
    chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
        if (changeInfo.status === "complete" && tab.url) {
            const service = detectService(tab.url);
            if (service === 'gmeet') {
                handleGmeetTabUpdate(tabId, tab);
            } else if (service === 'teams') {
                handleTeamsTabUpdate(tabId, tab);
            }
        }
    });

    // ==================== GOOGLE MEET HANDLERS ====================
    function handleGmeetTabUpdate(tabId, tab) {
        console.log("✅ Meet tab detected:", tabId, tab.url);
    }

    function closeAllRecorderTabs() {
        return new Promise((resolve) => {
            chrome.tabs.query({ url: chrome.runtime.getURL("recorder.html") }, (tabs) => {
                if (tabs.length === 0) {
                    console.log("✅ No recorder tabs found to close");
                    resolve();
                    return;
                }
                
                let closedCount = 0;
                tabs.forEach(tab => {
                    chrome.tabs.remove(tab.id, () => {
                        closedCount++;
                        console.log(`✅ Background closed recorder tab: ${tab.id}`);
                        
                        if (closedCount === tabs.length) {
                            console.log("✅ Background: All recorder tabs closed");
                            resolve();
                        }
                    });
                });
            });
        });
    }

    async function handleGmeetAutoStart(message, sender) {
        console.log("🎬 Auto-start recording requested from tab:", sender.tab?.id);

        if (autoStartTimeout) {
            clearTimeout(autoStartTimeout);
            autoStartTimeout = null;
        }

        if (!sender.tab?.id) {
            console.log("❌ No sender tab ID");
            return { success: false, reason: "no_tab_id" };
        }

        if (!userPermissionGranted) {
            console.log("❌ Auto recording denied - no permission");
            return { success: false, reason: "no_permission" };
        }

        console.log("🔄 Resetting states before auto-start...");
        currentRecordingTab = null;
        isAutoRecording = false;

        await chrome.storage.local.set({ 
            isRecording: false,
            recordingStoppedByTabClose: true 
        });

        console.log("✅ Starting auto recording for tab:", sender.tab.id);
        currentRecordingTab = sender.tab.id;
        isAutoRecording = true;

        setTimeout(() => {
            startRecordingForTab(sender.tab.id, 'gmeet');
        }, 2000);

        return { success: true };
    }

    async function stopRecordingOnMeetingEnd() {
        return new Promise((resolve) => {
            chrome.tabs.query({
                url: chrome.runtime.getURL("recorder.html")
            }, (tabs) => {
                if (tabs.length > 0) {
                    let completed = 0;
                    tabs.forEach(tab => {
                        chrome.tabs.sendMessage(tab.id, {
                            action: "stopRecording",
                            forceAutoDownload: true
                        }, (_response) => {
                            if (chrome.runtime.lastError) {
                                console.log("▲ Recorder tab not responding");
                            } else {
                                console.log("■ Auto-download command sent");
                            }
                            completed++;
                            if (completed == tabs.length) {
                                currentRecordingTab = null;
                                isAutoRecording = false;
                                resolve();
                            }
                        });
                    });
                } else {
                    console.log("▲ No recorder tabs found");
                    currentRecordingTab = null;
                    isAutoRecording = false;
                    resolve();
                }
            });
        });
    }

    function notifyAllGmeetTabs(enabled) {
        chrome.tabs.query({ url: ["https://*.meet.google.com/*"] }, (tabs) => {
            tabs.forEach(tab => {
                chrome.tabs.sendMessage(tab.id, {
                    action: "updateAutoRecordPermission",
                    enabled: enabled
                });
            });
        });
    }

    // ==================== MICROSOFT TEAMS HANDLERS ====================
    function handleTeamsTabUpdate(tabId, tab) {
        console.log("✅ Teams tab detected:", tabId, tab.url);
        
        chrome.storage.local.get(['autoRecordPermission'], (result) => {
            if (result.autoRecordPermission) {
                console.log("🎬 Auto recording enabled - Waiting for Join button click...");
                
                setTimeout(() => {
                    chrome.tabs.sendMessage(tabId, { action: "checkMeetingStatus" }, (response) => {
                        if (chrome.runtime.lastError) {
                            console.log("⚠️ Content script not ready yet, will detect meeting when Join button is clicked");
                            return;
                        }
                        
                        if (response && response.isInMeeting && !response.recording) {
                            console.log("✅ Meeting already in progress - starting auto recording");
                            startRecordingForTab(tabId, 'teams');
                        }
                    });
                }, 3000);
            }
        });
    }

    function handleTeamsAutoStart(sender) {
        const timestamp = new Date().toLocaleTimeString();
        console.log(`🎬 Auto starting recording - Join button clicked (+3s delay completed) at ${timestamp}`);
        console.log("📍 Source tab:", sender.tab.id, sender.tab.url);
        startRecordingForTab(sender.tab.id, 'teams');
        return { success: true };
    }

    function notifyAllTeamsTabs(enabled) {
        chrome.tabs.query({url: ["https://*.teams.microsoft.com/*", "https://*.teams.live.com/*"]}, (tabs) => {
            tabs.forEach(tab => {
                chrome.tabs.sendMessage(tab.id, {
                    action: "updateAutoRecordPermission",
                    enabled: enabled
                });
            });
        });
    }

    // ==================== COMMON FUNCTIONS ====================
    function startRecordingForTab(tabId, service) {
        if (currentRecordingTab && !isAutoRecording) {
            console.log("⚠️ Already recording in tab:", currentRecordingTab);
            return;
        }

        console.log(`🎬 Starting recording for ${service} tab:`, tabId);
        
        chrome.tabs.create({
            url: chrome.runtime.getURL("recorder.html"),
            active: false
        }, (recorderTab) => {
            console.log("✅ Recorder tab opened:", recorderTab.id);
            
            const startRecording = (retryCount = 0) => {
                console.log(`🔄 Attempting to start recording (attempt ${retryCount + 1})...`);
                
                chrome.tabs.sendMessage(recorderTab.id, { 
                    action: "startRecording", 
                    tabId: tabId,
                    autoRecord: true,
                    service: service
                }, (response) => {
                    if (chrome.runtime.lastError) {
                        console.log(`❌ Recorder tab not ready (attempt ${retryCount + 1}/3), retrying...`);
                        if (retryCount < 2) {
                            setTimeout(() => startRecording(retryCount + 1), 1000);
                        } else {
                            console.error("❌ Failed to start recording after 3 attempts");
                            chrome.tabs.remove(recorderTab.id);
                        }
                    } else {
                        console.log("✅ Recording started successfully");
                        currentRecordingTab = tabId;
                    }
                });
            };
            
            setTimeout(() => startRecording(), 1500);
        });
    }

    function stopAllRecordings() {
        console.log("🛑 Stopping all recordings");
        
        chrome.tabs.query({ url: chrome.runtime.getURL("recorder.html") }, (tabs) => {
            if (tabs.length > 0) {
                console.log(`🛑 Stopping ${tabs.length} recorder tab(s)`);
                tabs.forEach(tab => {
                    chrome.tabs.sendMessage(tab.id, { action: "stopRecording" });
                });
            } else {
                console.log("⚠️ No recorder tabs found");
            }
        });
        
        currentRecordingTab = null;
        isAutoRecording = false;
        
        chrome.storage.local.remove(['isRecording', 'recordingTime', 'recordingStartTime', 'recordingTabId']);
    }

    // ==================== MESSAGE HANDLER ====================
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        console.log("📨 Background received:", message.action);
        
        const handleAsync = async () => {
            try {
                // Common permission messages
                if (message.action === "grantAutoRecordPermission") {
                    userPermissionGranted = true;
                    await chrome.storage.local.set({ autoRecordPermission: true });
                    notifyAllGmeetTabs(true);
                    notifyAllTeamsTabs(true);
                    console.log("✅ Auto record permission granted");
                    return { success: true };
                }
                
                if (message.action === "revokeAutoRecordPermission") {
                    userPermissionGranted = false;
                    await chrome.storage.local.set({ autoRecordPermission: false });
                    notifyAllGmeetTabs(false);
                    notifyAllTeamsTabs(false);
                    console.log("❌ Auto record permission revoked");
                    return { success: true };
                }

                // Service-specific auto start
                if (message.action === "autoStartRecording") {
                    const service = detectService(sender.tab?.url);
                    if (service === 'gmeet') {
                        return await handleGmeetAutoStart(message, sender);
                    } else if (service === 'teams') {
                        return handleTeamsAutoStart(sender);
                    }
                }

                // Common stop messages
                if (message.action === "autoStopRecording") {
                    console.log("🛑 Auto stop recording requested");
                    stopAllRecordings();
                    return { success: true };
                }

                if (message.action === "recordingCompleted") {
                    currentRecordingTab = null;
                    isAutoRecording = false;
                    
                    // Notify both services
                    chrome.tabs.query({ url: ["https://*.meet.google.com/*", "https://*.teams.microsoft.com/*", "https://*.teams.live.com/*"] }, (tabs) => {
                        tabs.forEach(tab => {
                            chrome.tabs.sendMessage(tab.id, { action: "recordingCompleted" });
                        });
                    });

                    setTimeout(() => {
                        closeAllRecorderTabs();
                    }, 1000);

                    return { success: true };
                }
                
                if (message.action === "checkMeetingStatus") {
                    chrome.tabs.sendMessage(sender.tab.id, { action: "checkMeetingStatus" }, (response) => {
                        sendResponse(response);
                    });
                    return true;
                }

                if (message.action === "closeRecorderTab") {
                    console.log("🛑 Closing recorder tab for auto mode");
                    closeAllRecorderTabs();
                    return { success: true };
                }

                if (message.action === "stopRecordingOnMeetingEnd") {
                    console.log("🛑 Meeting ended - AUTO-DOWNLOADING recording");
                    await stopRecordingOnMeetingEnd();
                    return { success: true };
                }

                if (message.action === "showMeetStatus" || message.action === "updateMeetTimer") {
                    chrome.tabs.query({ url: "https://*.meet.google.com/*" }, (tabs) => {
                        tabs.forEach(tab => {
                            // Remove the sender check - we want to send to ALL Meet tabs
                            chrome.tabs.sendMessage(tab.id, message, (response) => {
                                if (chrome.runtime.lastError) {
                                    console.log("⚠️ Could not send to Meet tab:", tab.id, chrome.runtime.lastError.message);
                                }
                            });
                        });
                    });
                    return { success: true };
                }

                if (message.action === "recordingStarted") {
                    const timestamp = new Date().toLocaleTimeString();
                    console.log(`✅ Recording started successfully at ${timestamp}`);
                    currentRecordingTab = sender.tab.id;
                    
                    await chrome.storage.local.set({ 
                        isRecording: true,
                        recordingStartTime: Date.now(),
                        recordingTabId: sender.tab.id
                    });
                    
                    return { success: true };
                }

                if (message.action === "recordingStopped") {
                    const timestamp = new Date().toLocaleTimeString();
                    console.log(`✅ Recording stopped successfully at ${timestamp}`);
                    currentRecordingTab = null;
                    
                    await chrome.storage.local.remove(['isRecording', 'recordingTime', 'recordingStartTime', 'recordingTabId']);
                    
                    return { success: true };
                }

                if (message.action === "timerUpdate") {
                    await chrome.storage.local.set({ recordingTime: message.time });
                    return { success: true };
                }

                return { success: false, reason: "unknown_action" };
            } catch (error) {
                console.error("❌ Error handling message:", error);
                return { success: false, error: error.message };
            }
        };

        handleAsync().then(sendResponse);
        return true;
    });

    // Monitor tab closures
    chrome.tabs.onRemoved.addListener((tabId) => {
        if (tabId === currentRecordingTab) {
            console.log("❌ Source tab closed - stopping recording");
            stopAllRecordings();
        }
        
        chrome.tabs.get(tabId, (tab) => {
            if (chrome.runtime.lastError) return;
            
            if (tab.url && tab.url.includes("recorder.html")) {
                console.log("🛑 Recorder tab closed - cleaning up");
                chrome.storage.local.remove(['isRecording', 'recordingTime', 'recordingStartTime', 'recordingTabId']);
                currentRecordingTab = null;
                isAutoRecording = false;
            }
        });
    });

    // Handle extension installation
    chrome.runtime.onInstalled.addListener((details) => {
        console.log("🔧 Extension installed/updated:", details.reason);
        
        if (details.reason === 'install') {
            chrome.storage.local.set({ autoRecordPermission: false });
            console.log("🔐 Auto recording disabled by default");
        }
    });

    // Keep service worker alive
    setInterval(() => {
        chrome.runtime.getPlatformInfo(() => {});
    }, 20000);

    console.log("🔧 Unified Background script loaded successfully");
})();