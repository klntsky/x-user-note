(async () => {
  const ENABLE_HIGHLIGHT = true;

  // Retrieve debug flag from storage; default to true.
  async function getDebugFlag() {
    return new Promise((resolve, reject) => {
      chrome.storage.sync.get({ DEBUG_LOG: true }, (result) => {
        if (chrome.runtime.lastError) {
          reject(chrome.runtime.lastError);
        } else {
          resolve(result.DEBUG_LOG);
        }
      });
    });
  }

  let DEBUG_LOG = await getDebugFlag();

  function debugLog(...args) {
    if (DEBUG_LOG) console.log(...args);
  }

  debugLog("[DEBUG] Content script started.");

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
    debugLog("[DEBUG] saveEvent called for", username);
    const key = 'muteBlockEvents-' + username;
    let events = await getStoredData(key, []);
    debugLog("[DEBUG] Existing events for", username, events);
    events.unshift(eventText);
    await setStoredData(key, events);
    debugLog("[DEBUG] New event saved for", username, eventText);
  }

  async function loadEvents(username) {
    debugLog("[DEBUG] loadEvents called for", username);
    let events = await getStoredData('muteBlockEvents-' + username, []);
    debugLog("[DEBUG] Loaded events for", username, events);
    return events;
  }

  async function exportAllData() {
    debugLog("[DEBUG] exportAllData called.");
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
            debugLog("[DEBUG] Exporting key:", key, data[key]);
          }
        }
        resolve(data);
      });
    });
  }

  async function importAllData(data) {
    debugLog("[DEBUG] importAllData called with data:", data);
    return new Promise((resolve, reject) => {
      chrome.storage.sync.set(data, () => {
        if (chrome.runtime.lastError) reject(chrome.runtime.lastError);
        else resolve();
      });
    });
  }

  // --- Timestamp helper ---
  function getTimestamp() {
    debugLog("[DEBUG] getTimestamp called.");
    const now = new Date();
    const pad = num => num.toString().padStart(2, '0');
    const day = pad(now.getDate());
    const month = pad(now.getMonth() + 1);
    const year = now.getFullYear();
    const hours = pad(now.getHours());
    const minutes = pad(now.getMinutes());
    const timestamp = `${day}/${month}/${year} ${hours}:${minutes}`;
    debugLog("[DEBUG] Timestamp generated:", timestamp);
    return timestamp;
  }

  // --- Auto-resize textarea ---
  // Expands the textarea to fit its content. If more than one line, adds one extra row.
  function autoResizeTextarea(textarea) {
    debugLog("[DEBUG] autoResizeTextarea called for element:", textarea);
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
    debugLog("[DEBUG] updateTextareaForProfile called for", username);
    const ta = document.getElementById('muteBlockInfoTextarea');
    if (!ta) {
      debugLog("[DEBUG] Textarea not found, aborting update.");
      return;
    }
    const events = await loadEvents(username);
    ta.value = events.join('\n\n');
    autoResizeTextarea(ta);
    debugLog("[DEBUG] Textarea updated for", username);
  }

  async function saveTextareaContents(username, value) {
    debugLog("[DEBUG] saveTextareaContents called for", username);
    const events = value.split('\n\n').filter(s => s.trim() !== '');
    await setStoredData('muteBlockEvents-' + username, events);
    debugLog("[DEBUG] Textarea contents saved for", username, events);
  }

  // addTextareaToProfile() now uses a MutationObserver to re-add it whenever a profile is loaded dynamically
  function addTextareaToProfile() {
    debugLog("[DEBUG] addTextareaToProfile called.");
    const userDesc = document.querySelector('[data-testid="UserDescription"]');
    if (!userDesc) {
      debugLog("[DEBUG] UserDescription element not found. Aborting.");
      return;
    }
    if (!document.getElementById('muteBlockInfoContainer')) {
      const pathParts = window.location.pathname.split('/');
      if (pathParts.length < 2 || !pathParts[1]) {
        debugLog("[DEBUG] Unable to determine username from URL. Aborting.");
        return;
      }
      const username = "@" + pathParts[1];
      debugLog("[DEBUG] Detected username:", username);

      const container = document.createElement('div');
      container.id = 'muteBlockInfoContainer';
      container.style.marginTop = "10px";

      const ta = document.createElement('textarea');
      ta.id = 'muteBlockInfoTextarea';
      ta.style.width = '100%';
      ta.style.boxSizing = 'border-box';
      ta.rows = 1;
      ta.placeholder = "Your mute/block history for " + username;
      // Save content on every input event.
      ta.addEventListener('input', function() {
        debugLog("[DEBUG] Textarea input event triggered.");
        autoResizeTextarea(ta);
        saveTextareaContents(username, ta.value);
      });
      ta.addEventListener('focus', function() {
        debugLog("[DEBUG] Textarea focus event triggered. Expanding fully.");
        autoResizeTextarea(ta);
      });
      loadEvents(username).then(events => {
        ta.value = events.join('\n\n');
        autoResizeTextarea(ta);
      });
      container.appendChild(ta);
      debugLog("[DEBUG] Textarea created and populated.");

      userDesc.parentElement.insertBefore(container, userDesc.nextSibling);
      debugLog("[DEBUG] Mute/Block info container added to the profile page.");
    } else {
      debugLog("[DEBUG] Mute/Block info container already exists.");
    }
  }

  // Observe for profile page content dynamically loaded.
  const profileObserver = new MutationObserver((mutations) => {
    if (/^\/[^\/]+\/?$/.test(window.location.pathname)) {
      if (!document.getElementById('muteBlockInfoContainer')) {
        debugLog("[DEBUG] Profile detected but textarea container missing. Re-adding...");
        addTextareaToProfile();
      }
    }
  });
  profileObserver.observe(document.body, { childList: true, subtree: true });

  // --- Find tweet container by tweet ID ---
  function findTweetContainerByStatusId(tweetId) {
    debugLog("[DEBUG] Searching for tweet container with status id:", tweetId);
    let tweetLink = document.querySelector(`article[data-testid="tweet"] a[href*="/status/${tweetId}"]`);
    if (tweetLink) {
      let container = tweetLink.closest('article[data-testid="tweet"]');
      debugLog("[DEBUG] Found tweet container by status id:", container);
      return container;
    }
    debugLog("[DEBUG] No tweet container found for status id:", tweetId);
    return null;
  }

  // --- Clean tweet content ---
  function cleanTweetContent(content) {
    debugLog("[DEBUG] Cleaning tweet content.");
    // Remove the first "·" (separator)
    content = content.replace("·", "");
    let lines = content.split("\n");
    // Remove trailing lines that contain only numbers.
    while (lines.length > 0 && /^\s*\d+[KM]?\s*$/.test(lines[lines.length - 1])) {
      lines.pop();
    }
    return lines.join("\n").trim();
  }

  // --- Button Listener Functions ---
  function attachListenerToMuteBlockButton(buttonElement) {
    debugLog("[DEBUG] attachListenerToMuteBlockButton called for element:", buttonElement);
    if (buttonElement.getAttribute('data-mute-listener-attached') === "true") {
      debugLog("[DEBUG] Listener already attached to this button.");
      return;
    }
    buttonElement.setAttribute('data-mute-listener-attached', 'true');

    // Mouseover: find the engagement link and highlight the corresponding tweet container.
    buttonElement.addEventListener('mouseover', function(e) {
      debugLog("[DEBUG] Mouseover on mute/block button detected.");
      let popupContainer = buttonElement.closest('[role="menu"]') || buttonElement;
      let engagementLink = popupContainer.querySelector('a[data-testid="tweetEngagements"]') ||
                             popupContainer.querySelector('a[href*="/status/"]');
      if (engagementLink) {
        let href = engagementLink.getAttribute('href');
        debugLog("[DEBUG] Engagement link found with href:", href);
        let tweetIdMatch = href.match(/\/status\/(\d+)/);
        if (tweetIdMatch) {
          let tweetId = tweetIdMatch[1];
          let container = findTweetContainerByStatusId(tweetId);
          if (container && ENABLE_HIGHLIGHT) {
            debugLog("[DEBUG] Highlighting tweet container:", container);
            container.style.outline = "2px solid red";
            buttonElement._highlightedTweet = container;
          }
        }
      }
    });
    buttonElement.addEventListener('mouseout', function(e) {
      debugLog("[DEBUG] Mouseout on mute/block button detected.");
      let popupContainer = buttonElement.closest('[role="menu"]') || buttonElement;
      popupContainer.style.outline = "";
      if (buttonElement._highlightedTweet) {
        buttonElement._highlightedTweet.style.outline = "";
        buttonElement._highlightedTweet = null;
      }
    });
    buttonElement.addEventListener('click', async function(e) {
      debugLog("[DEBUG] Mute/Block button click detected:", buttonElement);
      let popupContainer = buttonElement.closest('[role="menu"]') || buttonElement;
      let engagementLink = popupContainer.querySelector('a[data-testid="tweetEngagements"]') ||
                             popupContainer.querySelector('a[href*="/status/"]');
      let tweetUrl = "";
      let tweetText = "";
      if (engagementLink) {
        let href = engagementLink.getAttribute('href');
        debugLog("[DEBUG] Engagement link href:", href);
        let tweetIdMatch = href.match(/\/status\/(\d+)/);
        if (tweetIdMatch) {
          let tweetId = tweetIdMatch[1];
          let container = findTweetContainerByStatusId(tweetId);
          if (container) {
            let linkInContainer = container.querySelector('a[href*="/status/"]');
            tweetUrl = linkInContainer ? linkInContainer.href : href;
            tweetText = cleanTweetContent(container.innerText);
          } else {
            tweetUrl = href;
            tweetText = "";
          }
        } else {
          tweetUrl = href;
          tweetText = "";
        }
      } else {
        tweetUrl = "";
        tweetText = "";
      }
      const txt = buttonElement.textContent;
      const usernameMatch = txt.match(/@(\S+)/);
      if (!usernameMatch) {
        debugLog("[DEBUG] Username not found in button text:", txt);
        return;
      }
      const username = "@" + usernameMatch[1];
      const timestamp = getTimestamp();
      const action = txt.includes("Mute") ? "Muted" : "Blocked";
      const logEntry = `${action} on ${timestamp}. Reason:\n${tweetUrl}\n${tweetText}`;
      await saveEvent(username, logEntry);
      debugLog("[DEBUG] Mute/Block event saved for", username, logEntry);

      // If we are on that user's profile, update the textarea instantly.
      const pathParts = window.location.pathname.split('/');
      if (pathParts.length >= 2 && ("@" + pathParts[1]) === username) {
        debugLog("[DEBUG] Updating textarea for current profile", username);
        await updateTextareaForProfile(username);
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
            debugLog("[DEBUG] Found new mute/block menuitem:", node);
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

  // On initial load, if on a profile page, insert the textarea.
  if (/^\/[^\/]+\/?$/.test(window.location.pathname)) {
    debugLog("[DEBUG] On initial load: profile page detected.");
    addTextareaToProfile();
  }
})();
