(async () => {
  const ENABLE_HIGHLIGHT = true;
  const HOVERCARD_TEXTAREA_HEIGHT = 80;
  const DEBUG_LOG = true;

  function debugLog(...args) {
    if (DEBUG_LOG) console.log("[X Note addon]:", ...args);
  }

  debugLog("Content script started.");

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
    if (!trackedTextareas.has(username)) return;
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
    if (!trackedTextareas.has(username)) return;
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
      chrome.storage.sync.get({ [key]: defaultValue }, (result) => {
        if (chrome.runtime.lastError) reject(chrome.runtime.lastError);
        else resolve(result[key]);
      });
    });
  }

  async function setStoredData(key, value) {
    return new Promise((resolve, reject) => {
      chrome.storage.sync.set({ [key]: value }, () => {
        if (chrome.runtime.lastError) reject(chrome.runtime.lastError);
        else resolve();
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
        if (chrome.runtime.lastError) reject(chrome.runtime.lastError);
        else resolve();
      });
    });
  }

  // --- Timestamp helper ---
  function getTimestamp() {
    debugLog("getTimestamp called.");
    const now = new Date();
    const pad = num => num.toString().padStart(2, '0');
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
    if (contentLines > 1) newHeight += lineHeight;
    if (newHeight < 20) newHeight = 20;
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
    if (!profileAnchorElement) {
      debugLog("profile anchor element not found. Aborting.");
      return;
    }
    if (!document.getElementById('muteBlockInfoContainer')) {
      const pathParts = window.location.pathname.split('/');
      if (pathParts.length < 2 || !pathParts[1]) {
        debugLog("Unable to determine username from URL. Aborting.");
        return;
      }
      const username = "@" + pathParts[1];
      debugLog("Detected username (profile):", username);

      const container = document.createElement('div');
      container.id = 'muteBlockInfoContainer';
      container.style.marginTop = "10px";

      const ta = document.createElement('textarea');
      ta.id = 'muteBlockInfoTextarea';
      ta.style.width = '100%';
      ta.style.boxSizing = 'border-box';
      ta.style.borderRadius = '3px';
      ta.style.resize = 'none';
      ta.rows = 1;
      ta.placeholder = "Your notes for " + username + " (visible only to you)";
      ta.addEventListener('input', function() {
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
      ta.addEventListener('focus', function() {
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
    } else {
      debugLog("Profile textarea container already exists.");
    }
  }

  // Observe for profile page content dynamically loaded.
  const profileObserver = new MutationObserver((mutations) => {
    if (/^\/[^\/]+\/?$/.test(window.location.pathname)) {
      if (!document.getElementById('muteBlockInfoContainer')) {
        debugLog("Profile detected but textarea container missing. Re-adding...");
        addTextareaToProfile();
      }
    }
  });
  profileObserver.observe(document.body, { childList: true, subtree: true });

  // --- Find tweet container by tweet ID ---
  function findTweetContainerByStatusId(tweetId) {
    debugLog("Searching for tweet container with status id:", tweetId);
    let tweetLink = document.querySelector(`article[data-testid="tweet"] a[href*="/status/${tweetId}"]`);
    if (tweetLink) {
      let container = tweetLink.closest('article[data-testid="tweet"]');
      debugLog("Found tweet container by status id:", container);
      return container;
    }
    debugLog("No tweet container found for status id:", tweetId);
    return null;
  }

  // --- Clean tweet content ---
  function cleanTweetContent(content) {
    // Remove the first "·" (separator)
    debugLog("Cleaning tweet content.");
    content = content.replace("·", "");
    let lines = content.split("\n");
    // Remove trailing lines that contain only numbers (optionally decimals or K/M suffix).
    while (lines.length > 0 && /^\s*\d+([.]\d+)?[KM]?\s*$/.test(lines[lines.length - 1])) {
      lines.pop();
    }
    return lines.join("\n").trim();
  }

  // --- Button Listener Functions ---
  function attachListenerToMuteBlockButton(buttonElement) {
    debugLog("attachListenerToMuteBlockButton called for element:", buttonElement);
    if (buttonElement.getAttribute('data-mute-listener-attached') === "true") {
      debugLog("Listener already attached to this button.");
      return;
    }
    buttonElement.setAttribute('data-mute-listener-attached', 'true');

    // Mouseover: find the engagement link and highlight the corresponding tweet container.
    buttonElement.addEventListener('mouseover', function(e) {
      debugLog("Mouseover on mute/block button detected.");
      let popupContainer = buttonElement.closest('[role="menu"]') || buttonElement;
      let engagementLink = popupContainer.querySelector('a[data-testid="tweetEngagements"]') ||
                             popupContainer.querySelector('a[href*="/status/"]');
      if (engagementLink) {
        let href = engagementLink.getAttribute('href');
        debugLog("Engagement link found with href:", href);
        let tweetIdMatch = href.match(/\/status\/(\d+)/);
        if (tweetIdMatch) {
          let tweetId = tweetIdMatch[1];
          let container = findTweetContainerByStatusId(tweetId);
          if (container && ENABLE_HIGHLIGHT) {
            debugLog("Highlighting tweet container:", container);
            container.style.outline = "2px solid red";
            buttonElement._highlightedTweet = container;
          }
        }
      }
    });
    buttonElement.addEventListener('mouseout', function(e) {
      debugLog("Mouseout on mute/block button detected.");
      let popupContainer = buttonElement.closest('[role="menu"]') || buttonElement;
      popupContainer.style.outline = "";
      if (buttonElement._highlightedTweet) {
        buttonElement._highlightedTweet.style.outline = "";
        buttonElement._highlightedTweet = null;
      }
    });
    buttonElement.addEventListener('click', async function(e) {
      debugLog("Mute/Block button click detected:", buttonElement);
      let popupContainer = buttonElement.closest('[role="menu"]') || buttonElement;
      let engagementLink = popupContainer.querySelector('a[data-testid="tweetEngagements"]') ||
                             popupContainer.querySelector('a[href*="/status/"]');
      let tweetUrl = "";
      let tweetText = "";
      if (engagementLink) {
        let href = engagementLink.getAttribute('href');
        debugLog("Engagement link href:", href);
        let tweetIdMatch = href.match(/\/status\/(\d+)/);
        if (tweetIdMatch) {
          let tweetId = tweetIdMatch[1];
          let container = findTweetContainerByStatusId(tweetId);
          if (container) {
            let linkInContainer = container.querySelector('a[href*="/status/"]');
            tweetUrl = linkInContainer ? linkInContainer.href : href;
            // Try to use the element with data-testid="tweetText" if available.
            let tweetTextElem = container.querySelector('[data-testid="tweetText"]');
            if (tweetTextElem) {
              tweetText = cleanTweetContent(tweetTextElem.textContent);
            } else {
              debugLog('WARNING: tweetTextElem detection failed');
              tweetText = cleanTweetContent(container.innerText);
            }
          } else {
            tweetUrl = href;
          }
        } else {
          tweetUrl = href;
        }
      }
      const txt = buttonElement.textContent;
      const usernameMatch = txt.match(/@(\S+)/);
      if (!usernameMatch) {
        debugLog("Username not found in button text:", txt);
        return;
      }
      const username = "@" + usernameMatch[1];
      const timestamp = getTimestamp();
      const action = txt.includes("Mute") ? "Muted" : "Blocked";
      const logEntry = `${action} on ${timestamp}. Reason:\n${tweetUrl}\n${tweetText}`;
      await saveEvent(username, logEntry);
      debugLog("Mute/Block event saved for", username, logEntry);

      // If we are on that user's profile, update all tracked textareas instantly.
      const pathParts = window.location.pathname.split('/');
      if (pathParts.length >= 2 && ("@" + pathParts[1]) === username) {
        debugLog("Updating profile textarea for current profile", username);
        await updateTextareaForProfile(username);
        syncTextareas(username, document.getElementById('muteBlockInfoTextarea').value);
      }
    });
  }

  // --- Observe new mute/block buttons ---
  const buttonObserver = new MutationObserver(function(mutations) {
    mutations.forEach(function(mutation) {
      mutation.addedNodes.forEach(function(node) {
        if (node.nodeType === Node.ELEMENT_NODE) {
          if (node.getAttribute('role') === 'menuitem' &&
              (node.textContent.includes("Mute") || node.textContent.includes("Block"))) {
            debugLog("Found new mute/block menuitem:", node);
            attachListenerToMuteBlockButton(node);
          }
          const muteButtons = node.querySelectorAll && node.querySelectorAll('[role="menuitem"]');
          if (muteButtons && muteButtons.length > 0) {
            muteButtons.forEach(function(btn) {
              if (btn.textContent.includes("Mute") || btn.textContent.includes("Block")) {
                attachListenerToMuteBlockButton(btn);
              }
            });
          }
        }
      });
    });
  });
  buttonObserver.observe(document.body, { childList: true, subtree: true });
  debugLog("[DEBUG] Button observer set up.");

  // On initial load, if on a profile page, insert the profile textarea.
  if (/^\/[^\/]+\/?$/.test(window.location.pathname)) {
    debugLog("On initial load: profile page detected.");
    addTextareaToProfile();
  }

  // --- Hover Card Text Field for User Hover ---
  async function waitForUsernameAnchor(hoverCard) {
    for (let i = 0; i < 51; i++) {
      let anchor = hoverCard.querySelector('a[href^="/"]');
      if (anchor) return anchor;
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    return null;
  }

  async function addTextFieldToHoverCard(hoverCard) {
    if (hoverCard.querySelector('.hovercard-textfield')) {
      debugLog("Hover card text field already exists.");
      return;
    }
    // Try to extract the username from a link within the hover card.
    let usernameAnchor = await waitForUsernameAnchor(hoverCard);
    // check again to prevent a race condition
    if (hoverCard.querySelector('.hovercard-textfield')) {
      debugLog("Hover card text field already exists.");
      return;
    }
    if (!usernameAnchor) {
      debugLog("No username anchor found in hover card after waiting.");
      return;
    }
    let usernameHref = usernameAnchor.getAttribute('href');
    let username = "@" + usernameHref.slice(1);
    debugLog("Detected username (hover card):", username);

    // Create container for the text field.
    const container = document.createElement('div');
    container.className = 'hovercard-textfield';
    container.style.marginTop = "5px";

    // Create a textarea with similar behavior.
    const ta = document.createElement('textarea');
    ta.style.width = '100%';
    ta.style.boxSizing = 'border-box';
    ta.style.borderRadius = '0 0 10px 10px';
    ta.style.resize = 'none';
    ta.rows = 1;
    ta.placeholder = "Your notes for " + username + " (visible only to you)";
    // Fixed height and scrollable.
    ta.style.height = HOVERCARD_TEXTAREA_HEIGHT + "px";
    ta.style.overflow = "auto";
    ta.addEventListener('input', function() {
      saveTextareaContents(username, ta.value);
      if (debounceTimers[username]) {
        clearTimeout(debounceTimers[username]);
      }
      debounceTimers[username] = setTimeout(() => {
        syncTextareas(username, ta.value);
        delete debounceTimers[username];
      }, 300);
    });
    loadEvents(username).then(events => {
      ta.value = events.join('\n\n');
    });
    container.appendChild(ta);
    registerTextarea(username, ta);

    // Instead of attaching to the Profile Summary button's parent,
    // try to attach to an inner container in the hover card.
    let innerContainer = hoverCard.querySelector('div');
    if (innerContainer) {
      innerContainer.appendChild(container);
      debugLog("Hover card text field inserted into inner container.");
    } else {
      // Fallback: append at the end of the hover card.
      hoverCard.appendChild(container);
      debugLog("Hover card text field inserted at end of hover card.");
    }
  }

  // Observe dynamic hover cards.
  const hoverCardObserver = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      mutation.addedNodes.forEach((node) => {
        if (node.nodeType === Node.ELEMENT_NODE) {
          // Look for a hover card container.
          if (node.hasAttribute("data-testid") && node.getAttribute("data-testid") === "HoverCard") {
            debugLog("HoverCard detected:", node);
            addTextFieldToHoverCard(node);
          } else {
            // Also check descendants.
            let hoverCards = node.querySelectorAll && node.querySelectorAll('[data-testid="HoverCard"]');
            if (hoverCards && hoverCards.length > 0) {
              hoverCards.forEach((hc) => {
                debugLog("HoverCard detected in subtree:", hc);
                addTextFieldToHoverCard(hc);
              });
            }
          }
        }
      });
    });
  });
  hoverCardObserver.observe(document.body, { childList: true, subtree: true });
  debugLog("Hover card observer set up.");
})();
