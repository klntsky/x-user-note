"use strict";
(async () => {
    const ENABLE_HIGHLIGHT = false;
    const HOVERCARD_TEXTAREA_HEIGHT = 50;
    const DEBUG_LOG = false;
    const debugLog = (DEBUG_LOG ?
        function debugLog(...args) {
            if (DEBUG_LOG)
                console.log("[X Note addon]:", ...args);
        } : function () {
    });
    debugLog("Content script started.");
    // --- Helper function to normalize usernames --- 
    function normalizeUsername(username) {
        return username.replace(/^@/, '');
    }
    // --- Global tracking for textareas ---
    const trackedTextareas = new Map(); // Map of username -> array of textarea elements
    const debounceTimers = {}; // Map of username -> timer ID
    function registerTextarea(username, ta) {
        if (!trackedTextareas.has(username)) {
            trackedTextareas.set(username, []);
        }
        trackedTextareas.get(username).push(ta);
    }
    function unregisterTextarea(username, ta) {
        if (!trackedTextareas.has(username))
            return;
        const arr = trackedTextareas.get(username);
        const index = arr.indexOf(ta);
        if (index !== -1) {
            arr.splice(index, 1);
        }
        if (arr.length === 0) {
            trackedTextareas.delete(username);
        }
    }
    function syncTextareas(username, newValue) {
        debugLog("Syncing textareas for", username, newValue);
        if (!trackedTextareas.has(username))
            return;
        const arr = trackedTextareas.get(username);
        const toUpdate = arr.filter(ta => document.contains(ta));
        trackedTextareas.set(username, toUpdate);
        toUpdate.forEach(ta => {
            if (ta.value !== newValue) {
                ta.value = newValue;
                autoResizeTextarea(ta);
            }
        });
    }
    // --- Storage helper wrappers using chrome.storage.sync ---
    async function getStoredData(key, defaultValue) {
        return new Promise((resolve, reject) => {
            if (!chrome || !chrome.storage) {
                console.error("[X User Notes] chrome.storage is not available in getStoredData. Halting operation.");
                reject(new Error("chrome.storage is not available"));
                return;
            }
            chrome.storage.sync.get({ [key]: defaultValue }, (result) => {
                if (chrome.runtime.lastError)
                    reject(chrome.runtime.lastError);
                else
                    resolve(result[key]);
            });
        });
    }
    async function setStoredData(key, value) {
        return new Promise((resolve, reject) => {
            if (!chrome || !chrome.storage) {
                console.error("[X User Notes] chrome.storage is not available in setStoredData. Halting operation.");
                reject(new Error("chrome.storage is not available"));
                return;
            }
            chrome.storage.sync.set({ [key]: value }, () => {
                if (chrome.runtime.lastError)
                    reject(chrome.runtime.lastError);
                else
                    resolve();
            });
        });
    }
    async function saveEvent(username, eventText) {
        debugLog("saveEvent called for", username);
        const key = 'muteBlockEvents-' + username;
        let events = await getStoredData(key, []);
        debugLog("Existing events for", username, events);
        events.unshift(eventText);
        await setStoredData(key, events);
        debugLog("New event saved for", username, eventText);
    }
    async function loadEvents(username) {
        debugLog("loadEvents called for", username);
        let events = await getStoredData('muteBlockEvents-' + username, []);
        debugLog("Loaded events for", username, events);
        return events;
    }
    async function exportAllData() {
        debugLog("exportAllData called.");
        return new Promise((resolve, reject) => {
            chrome.storage.sync.get(null, (items) => {
                if (chrome.runtime.lastError) {
                    reject(chrome.runtime.lastError);
                    return;
                }
                let data = {};
                for (let key in items) {
                    if (key.startsWith("muteBlockEvents-") || key === "DEBUG_LOG") {
                        data[key] = items[key];
                        debugLog("Exporting key:", key, data[key]);
                    }
                }
                resolve(data);
            });
        });
    }
    async function importAllData(data) {
        debugLog("importAllData called with data:", data);
        return new Promise((resolve, reject) => {
            chrome.storage.sync.set(data, () => {
                if (chrome.runtime.lastError)
                    reject(chrome.runtime.lastError);
                else
                    resolve();
            });
        });
    }
    // --- Timestamp helper ---
    function getTimestamp() {
        debugLog("getTimestamp called.");
        const now = new Date();
        const pad = (num) => num.toString().padStart(2, '0');
        const day = pad(now.getDate());
        const month = pad(now.getMonth() + 1);
        const year = now.getFullYear();
        const hours = pad(now.getHours());
        const minutes = pad(now.getMinutes());
        const timestamp = `${day}/${month}/${year} ${hours}:${minutes}`;
        debugLog("Timestamp generated:", timestamp);
        return timestamp;
    }
    // --- Auto-resize textarea ---
    // Expands the textarea to fit its content. If more than one line, adds one extra row.
    function autoResizeTextarea(textarea) {
        debugLog("autoResizeTextarea called for element:", textarea);
        textarea.style.height = 'auto';
        let newHeight = textarea.scrollHeight;
        let contentLines = textarea.value.split("\n").length;
        let lineHeight = parseFloat(window.getComputedStyle(textarea).lineHeight) || 20;
        if (contentLines > 1)
            newHeight += 5;
        if (newHeight < 20)
            newHeight = 20;
        textarea.style.height = newHeight + "px";
    }
    // --- Profile textarea functions ---
    async function updateTextareaForProfile(username) {
        debugLog("updateTextareaForProfile called for", username);
        const ta = document.getElementById('muteBlockInfoTextarea');
        if (!ta) {
            debugLog("Profile textarea not found, aborting update.");
            return;
        }
        const events = await loadEvents(username);
        ta.value = events.join('\n\n');
        autoResizeTextarea(ta);
        debugLog("Profile textarea updated for", username);
    }
    async function saveTextareaContents(username, value) {
        debugLog("saveTextareaContents called for", username);
        const events = value.split('\n\n').filter(s => s.trim() !== '');
        await setStoredData('muteBlockEvents-' + username, events);
        debugLog("Profile textarea contents saved for", username, events);
    }
    // Insert the profile textarea under the user description.
    function addTextareaToProfile() {
        debugLog("addTextareaToProfile called.");
        const profileAnchorElement = document.querySelector('[data-testid="UserJoinDate"]');
        if (!profileAnchorElement || !profileAnchorElement.parentElement) {
            debugLog("profile anchor element or its parent not found. Aborting.");
            return;
        }
        const userNameContainerElement = document.querySelector('[data-testid="UserName"]');
        if (!userNameContainerElement) {
            debugLog("User name container element not found. Aborting.");
            return;
        }
        const userNameElements = userNameContainerElement.querySelectorAll('span');
        const userNameElement = userNameElements.length > 0 ? userNameElements[userNameElements.length - 1] : undefined;
        if (!userNameElement || !userNameElement.textContent) {
            debugLog("User name element or textContent not found. Aborting.");
            return;
        }
        const rawUsername = userNameElement.textContent.trim();
        const username = normalizeUsername(rawUsername);
        debugLog("Detected and normalized username (profile):", username);
        // Check if an existing container exists.
        let existingContainer = document.getElementById('muteBlockInfoContainer');
        if (existingContainer) {
            // If the container's data-username doesn't match, remove it.
            if (existingContainer.getAttribute("data-username") !== username) {
                debugLog("Existing container belongs to a different user. Removing.");
                existingContainer.remove();
                existingContainer = null;
            }
            else {
                debugLog("Profile textarea container already exists for", username);
                return;
            }
        }
        const container = document.createElement('div');
        container.id = 'muteBlockInfoContainer';
        container.setAttribute("data-username", username);
        container.style.marginTop = "10px";
        const ta = document.createElement('textarea');
        ta.id = 'muteBlockInfoTextarea';
        ta.style.width = '100%';
        ta.style.boxSizing = 'border-box';
        ta.style.borderRadius = '10px';
        ta.style.padding = '3px';
        ta.style.resize = 'none';
        ta.rows = 1;
        ta.placeholder = "Your notes for " + username + " (visible only to you)";
        // Save content on every input event.
        ta.addEventListener('input', function () {
            debugLog("Profile textarea input event triggered.");
            autoResizeTextarea(ta);
            saveTextareaContents(username, ta.value);
            if (debounceTimers[username]) {
                clearTimeout(debounceTimers[username]);
            }
            debounceTimers[username] = setTimeout(() => {
                syncTextareas(username, ta.value);
                delete debounceTimers[username];
            }, 300);
        });
        ta.addEventListener('focus', function () {
            debugLog("Profile textarea focus event triggered. Expanding fully.");
            autoResizeTextarea(ta);
        });
        loadEvents(username).then(events => {
            ta.value = events.join('\n\n');
            autoResizeTextarea(ta);
        });
        container.appendChild(ta);
        debugLog("Profile textarea created and populated.");
        registerTextarea(username, ta);
        profileAnchorElement.parentElement.insertBefore(container, profileAnchorElement.nextSibling);
        debugLog("Profile textarea container added to the profile page.");
    }
    // Observe for profile page content dynamically loaded.
    const profileObserver = new MutationObserver((mutations) => {
        if (/^\/[^\/]+\/?$/.test(window.location.pathname)) {
            addTextareaToProfile();
        }
    });
    profileObserver.observe(document.body, { childList: true, subtree: true });
    // --- Find tweet container by tweet ID ---
    function findTweetContainerByStatusId(tweetId) {
        debugLog("Searching for tweet container with status id:", tweetId);
        let tweetLink = document.querySelector(`article[data-testid="tweet"] a[href*="/status/${tweetId}"]`);
        if (tweetLink) {
            // Traverse up to find the article element, which is the main tweet container.
            let currentElement = tweetLink;
            while (currentElement && currentElement.tagName !== 'ARTICLE') {
                currentElement = currentElement.parentElement;
            }
            if (currentElement) {
                debugLog("Found tweet container:", currentElement);
                return currentElement;
            }
        }
        debugLog("Tweet container not found for status id:", tweetId);
        return null;
    }
    // --- Clean tweet content for display ---
    function cleanTweetContent(content) {
        debugLog("Cleaning tweet content:", content);
        // Replace newlines with spaces for a more compact display.
        let cleanedContent = content.replace(/\n+/g, ' ').trim();
        // Truncate if too long.
        // if (cleanedContent.length > 100) {
        //   cleanedContent = cleanedContent.substring(0, 97) + '...';
        // }
        debugLog("Cleaned tweet content:", cleanedContent);
        return cleanedContent;
    }
    // --- Mute/Block button enhancements ---
    // This function is the core of the enhancement.
    // It modifies the behavior of mute/block confirmation buttons.
    function attachListenerToMuteBlockButton(buttonElement) {
        debugLog("attachListenerToMuteBlockButton called for element:", buttonElement);
        if (buttonElement.dataset.listenerAttached) {
            debugLog("Listener already attached to button.");
            return;
        }
        buttonElement.dataset.listenerAttached = 'true';
        buttonElement.addEventListener('click', async (event) => {
            // This listener is on the menu item.
            // The original click should proceed to open X.com's confirmation dialog.
            debugLog("Mute/Block menu item clicked:", buttonElement.textContent);
            const buttonText = buttonElement.textContent || "";
            // Matches "@" followed by one or more non-space characters
            const usernameMatch = buttonText.match(/@(\S+)/);
            if (!usernameMatch || !usernameMatch[1]) {
                debugLog("Username not found in button text (e.g., Mute @username):", buttonText);
                return; // If no username in the expected format, can't save.
            }
            const usernameFromButton = usernameMatch[1]; // e.g., "SomeUser" from "@SomeUser"
            const usernameForStorage = normalizeUsername(usernameFromButton); // Normalize, though regex group 1 usually doesn't have @
            const timestamp = getTimestamp();
            const action = buttonText.includes("Mute") ? "Muted" : "Blocked"; // Or "Mute" / "Block" to indicate intent
            let tweetUrl = "";
            let tweetText = "";
            // Attempt to find tweet context, similar to original JS
            const menuContainer = buttonElement.closest('[role="menu"]');
            if (menuContainer) {
                const engagementLink = menuContainer.querySelector('a[data-testid="tweetEngagements"], a[href*="/status/"]');
                if (engagementLink && engagementLink.href) {
                    const href = engagementLink.href;
                    tweetUrl = href.replace(/\/quotes$/, '');
                    const tweetIdMatch = href.match(/\/status\/(\d+)/);
                    if (tweetIdMatch) {
                        const tweetId = tweetIdMatch[1];
                        const tweetArticle = findTweetContainerByStatusId(tweetId); // Helper function
                        if (tweetArticle) {
                            const tweetTextElement = tweetArticle.querySelector('[data-testid="tweetText"]');
                            if (tweetTextElement && tweetTextElement.innerText) {
                                tweetText = cleanTweetContent(tweetTextElement.innerText);
                            }
                            else {
                                // Fallback if specific text element isn't found
                                tweetText = cleanTweetContent(tweetArticle.innerText || "");
                            }
                        }
                    }
                }
            }
            let logEntry = `${action} @${usernameForStorage} on ${timestamp}`;
            if (tweetUrl || tweetText)
                logEntry += " Reason:";
            if (tweetUrl)
                logEntry += `\n${tweetUrl}`;
            if (tweetText)
                logEntry += `\n${tweetText}`;
            await saveEvent(usernameForStorage, logEntry);
            debugLog("Event saved (intent to mute/block). User:", usernameForStorage, "Log:", logEntry);
            // Update UI: if on the user's profile page, update the main textarea.
            // Also, sync other textareas for this user (e.g., hovercards).
            const pathParts = window.location.pathname.split('/');
            const rawPathUsername = pathParts.length > 1 ? pathParts[1] : ""; // Username from URL, e.g., "elonmusk" or "@elonmusk"
            const pathUsernameForComparison = normalizeUsername(rawPathUsername);
            if (pathUsernameForComparison && pathUsernameForComparison.toLowerCase() === usernameForStorage.toLowerCase()) {
                debugLog("On profile page of user being muted/blocked. Updating textarea for", usernameForStorage);
                await updateTextareaForProfile(usernameForStorage); // This function loads events and sets textarea value
                // After updateTextareaForProfile, the profile textarea should have the new content.
                // Sync this new content to other tracked textareas for this user.
                const profileTextarea = document.getElementById('muteBlockInfoTextarea');
                if (profileTextarea) {
                    syncTextareas(usernameForStorage, profileTextarea.value);
                }
                else {
                    // Fallback if profile textarea isn't immediately found (should be rare)
                    syncTextareas(usernameForStorage, (await loadEvents(usernameForStorage)).join('\n\n'));
                }
            }
            else {
                // If not on the profile page, still sync any other textareas (e.g., from hovercards)
                syncTextareas(usernameForStorage, (await loadEvents(usernameForStorage)).join('\n\n'));
            }
            // The original click on the menu item will proceed as normal.
        });
    }
    // --- Hovercard text field functions ---
    async function waitForUsernameAnchor(hoverCard) {
        return new Promise(resolve => {
            const observer = new MutationObserver(() => {
                const usernameAnchor = hoverCard.querySelector('a[href*="/"][role="link"][data-testid*="UserName"]');
                if (usernameAnchor) {
                    observer.disconnect();
                    resolve(usernameAnchor);
                }
            });
            observer.observe(hoverCard, { childList: true, subtree: true });
            // Initial check
            const usernameAnchor = hoverCard.querySelector('a[href*="/"][role="link"][data-testid*="UserName"]');
            if (usernameAnchor) {
                observer.disconnect();
                resolve(usernameAnchor);
            }
        });
    }
    async function addTextFieldToHoverCard(hoverCard) {
        debugLog("addTextFieldToHoverCard called for hovercard:", hoverCard);
        if (hoverCard.dataset.textFieldAdded === 'true') {
            debugLog("Text field already added to this hovercard.");
            return;
        }
        hoverCard.dataset.textFieldAdded = 'true';
        // Find an anchor point for the textarea, e.g., user bio or follow button area
        const anchorElement = hoverCard.querySelector('[data-testid="UserDescription"], [data-testid="userFollowButton"], div[role="group"]');
        if (!anchorElement || !anchorElement.parentNode) {
            debugLog("Anchor element or its parentNode for hovercard textarea not found.");
            return;
        }
        // Extract username from the hovercard
        // const usernameAnchor = hoverCard.querySelector('a[href*="/"][role="link"][data-testid*="UserName"]');
        const usernameAnchor = await waitForUsernameAnchor(hoverCard);
        if (!usernameAnchor || !usernameAnchor.href) {
            debugLog("Username anchor or href not found in hovercard.");
            return;
        }
        const usernameMatch = usernameAnchor.href.match(/\/([^\/]+)$/);
        if (!usernameMatch || !usernameMatch[1]) {
            debugLog("Could not extract username from hovercard link:", usernameAnchor.href);
            return;
        }
        const rawUsernameFromLink = usernameMatch[1];
        const username = normalizeUsername(rawUsernameFromLink);
        debugLog("Username extracted and normalized from hovercard:", username);
        const ta = document.createElement('textarea');
        ta.style.width = 'calc(100% - 10px)'; // Adjust width to fit padding
        ta.style.boxSizing = 'border-box';
        ta.style.marginTop = '8px';
        ta.style.padding = '5px';
        ta.style.border = '1px solid #ccc';
        ta.style.borderRadius = '4px';
        ta.style.resize = 'none';
        ta.style.minHeight = `${HOVERCARD_TEXTAREA_HEIGHT}px`;
        ta.placeholder = `Notes for @${username}...`;
        ta.rows = 2; // Start with 2 rows
        const events = await loadEvents(username);
        ta.value = events.join('\n\n');
        autoResizeTextarea(ta);
        registerTextarea(username, ta);
        ta.addEventListener('input', () => {
            autoResizeTextarea(ta);
            if (debounceTimers[username]) {
                clearTimeout(debounceTimers[username]);
            }
            debounceTimers[username] = setTimeout(async () => {
                await saveTextareaContents(username, ta.value);
                syncTextareas(username, ta.value); // Sync with other textareas for this user
                delete debounceTimers[username];
            }, 500); // Debounce time for saving hovercard notes
        });
        anchorElement.parentNode.insertBefore(ta, anchorElement.nextSibling);
        debugLog("Textarea added to hovercard for user:", username);
        ta.focus();
        autoResizeTextarea(ta);
    }
    // --- Main observer for dynamic content ---
    const observer = new MutationObserver((mutationsList, observerInstance) => {
        debugLog("MutationObserver callback triggered. Mutations count:", mutationsList.length);
        for (const mutation of mutationsList) {
            if (mutation.type === 'childList') {
                mutation.addedNodes.forEach(node => {
                    if (node.nodeType === Node.ELEMENT_NODE) {
                        const htmlNode = node;
                        // New logic: Find Mute/Block menu items
                        const processNodeForMuteBlockItems = (element) => {
                            // Check the element itself
                            if (element.getAttribute('role') === 'menuitem' &&
                                element.textContent &&
                                (element.textContent.includes("Mute @") || element.textContent.includes("Block @"))) {
                                debugLog("Found potential mute/block menuitem:", element);
                                attachListenerToMuteBlockButton(element);
                            }
                            // Also check descendants, as the original JS did with querySelectorAll
                            // Ensure querySelectorAll is called on an element that supports it.
                            if (typeof element.querySelectorAll === 'function') {
                                const menuItems = element.querySelectorAll('[role="menuitem"]');
                                menuItems.forEach(item => {
                                    if (item.textContent && (item.textContent.includes("Mute @") || item.textContent.includes("Block @"))) {
                                        debugLog("Found potential mute/block menuitem in descendants:", item);
                                        attachListenerToMuteBlockButton(item);
                                    }
                                });
                            }
                        };
                        processNodeForMuteBlockItems(htmlNode);
                        // Check for user profile page load (presence of UserJoinDate) - REMAINS THE SAME
                        if (htmlNode.querySelector('[data-testid="UserJoinDate"]') || htmlNode.matches('[data-testid="UserJoinDate"]')) {
                            debugLog("User profile indicator found, attempting to add textarea.");
                            addTextareaToProfile();
                        }
                        // Check for hovercards - REMAINS THE SAME
                        const hoverCards = htmlNode.querySelectorAll('[data-testid="HoverCard"]');
                        hoverCards.forEach(hc => addTextFieldToHoverCard(hc));
                        if (htmlNode.matches('[data-testid="HoverCard"]')) {
                            addTextFieldToHoverCard(htmlNode);
                        }
                    }
                });
            }
        }
        // Also re-check profile on any mutation, as URL might not change but content does (e.g. SPA navigation) - REMAINS THE SAME
        if (/^\/[^\/]+\/?$/.test(window.location.pathname)) {
            addTextareaToProfile();
        }
    });
    // Start observing the document body for added nodes and subtree modifications.
    observer.observe(document.body, { childList: true, subtree: true });
    debugLog("Main MutationObserver started.");
    // Initial checks on script load
    if (/^\/[^\/]+\/?$/.test(window.location.pathname)) {
        addTextareaToProfile(); // For profile pages loaded directly
    }
    // Highlight functionality (optional, can be enabled via settings)
    if (ENABLE_HIGHLIGHT) {
        // ... (implementation for highlighting users with notes can be added here)
        debugLog("Highlighting functionality is enabled but not yet fully implemented.");
    }
    // --- Message listener for communication with other parts of the extension (e.g., popup) ---
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
        debugLog("Message received in content script:", request);
        if (request.action === "exportData") {
            exportAllData()
                .then(data => {
                debugLog("Data exported successfully, sending response.", data);
                sendResponse({ success: true, data: data });
            })
                .catch(error => {
                console.error("Error exporting data:", error);
                debugLog("Error exporting data, sending error response.", error);
                sendResponse({ success: false, error: error.message });
            });
            return true; // Indicates that the response is sent asynchronously.
        }
        else if (request.action === "importData") {
            importAllData(request.data)
                .then(() => {
                debugLog("Data imported successfully, sending response.");
                sendResponse({ success: true });
                // Potentially refresh UI elements here if needed after import
                // e.g., by re-triggering addTextareaToProfile() or addTextFieldToHoverCard if relevant elements are visible
            })
                .catch(error => {
                console.error("Error importing data:", error);
                debugLog("Error importing data, sending error response.", error);
                sendResponse({ success: false, error: error.message });
            });
            return true; // Indicates that the response is sent asynchronously.
        }
    });
    debugLog("Content script fully initialized and event listeners active.");
})();
//# sourceMappingURL=content.js.map