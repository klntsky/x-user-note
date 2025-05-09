(() => {
  const ENABLE_HIGHLIGHT = false;
  const DEBUG_LOG = false;

  /**
   * Logs messages to the console if DEBUG_LOG is true.
   * Prefixes messages with "[X Note addon]:".
   * @param {...string} args - The messages to log.
   */
  const debugLog = (...args: string[]) => {
    if (DEBUG_LOG) {
      console.log('[X Note addon]:', ...args);
    }
  };

  debugLog('Content script started.');

  // --- Helper function to normalize usernames ---
  /**
   * Removes the leading "@" from a username string.
   * @param username The username string to normalize.
   * @returns The normalized username.
   */
  // function normalizeUsername(username: string): string {
  //   return username.replace(/^@/, '');
  // }

  // --- Global tracking for textareas ---
  const trackedTextareas = new Map<string, HTMLTextAreaElement[]>();
  const debounceTimers: Record<string, number | undefined> = {}; // Map of username -> timer ID

  /**
   * Registers a textarea element for a given username.
   * @param username The username associated with the textarea.
   * @param ta The textarea element to register.
   */
  function registerTextarea(username: string, ta: HTMLTextAreaElement) {
    if (!trackedTextareas.has(username)) {
      trackedTextareas.set(username, []);
    }
    const textareas = trackedTextareas.get(username);
    if (textareas) {
      textareas.push(ta);
    }
  }

  /**
   * Unregisters a textarea element for a given username.
   * @param username The username associated with the textarea.
   * @param ta The textarea element to unregister.
   */
  // function unregisterTextarea(username: string, ta: HTMLTextAreaElement) {
  //   const arr = trackedTextareas.get(username);
  //   if (!arr) return; // Guard against arr being undefined
  //   const index = arr.indexOf(ta);
  //   if (index !== -1) {
  //     arr.splice(index, 1);
  //   }
  //   if (arr.length === 0) {
  //     trackedTextareas.delete(username);
  //   }
  // }

  /**
   * Synchronizes the content of all registered textareas for a given username.
   * @param username The username whose textareas need to be synchronized.
   * @param newValue The new value to set for the textareas.
   */
  function syncTextareas(username: string, newValue: string) {
    debugLog('Syncing textareas for', username, newValue);
    if (!trackedTextareas.has(username)) return;
    const arr = trackedTextareas.get(username);
    if (!arr) return;
    const toUpdate = arr.filter((ta: HTMLTextAreaElement) =>
      document.contains(ta)
    );
    trackedTextareas.set(username, toUpdate);
    toUpdate.forEach((ta: HTMLTextAreaElement) => {
      if (ta.value !== newValue) {
        ta.value = newValue;
        autoResizeTextarea(ta);
      }
    });
  }

  // --- Storage helper wrappers using chrome.storage.sync ---
  /**
   * Retrieves data from chrome.storage.sync.
   * @template T The type of the data to retrieve.
   * @param key The key of the data in storage.
   * @param defaultValue The default value to return if the key is not found.
   * @returns A promise that resolves with the retrieved data or the default value.
   */
  async function getStoredData<T>(key: string, defaultValue: T): Promise<T> {
    return new Promise((resolve, reject) => {
      chrome.storage.sync.get({ [key]: defaultValue }, (result) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve(result[key] as T);
        }
      });
    });
  }

  /**
   * Stores data in chrome.storage.sync.
   * @param key The key to store the data under.
   * @param value The data to store.
   * @returns A promise that resolves when the data is successfully stored.
   */
  async function setStoredData(key: string, value: unknown): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      chrome.storage.sync.set({ [key]: value }, () => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve();
        }
      });
    });
  }

  /**
   * Saves an event string for a given username.
   * Prepends the new event to the list of existing events.
   * @param username The username associated with the event.
   * @param eventText The event text to save.
   */
  async function saveEvent(username: string, eventText: string) {
    debugLog('saveEvent called for', username);
    const key = 'muteBlockEvents-' + username;
    const events = await getStoredData<string[]>(key, []);
    debugLog('Existing events for', username, ...events);
    events.unshift(eventText);
    await setStoredData(key, events);
    debugLog('New event saved for', username, eventText);
  }

  /**
   * Loads all event strings for a given username.
   * @param username The username whose events are to be loaded.
   * @returns A promise that resolves with an array of event strings.
   */
  async function loadEvents(username: string) {
    debugLog('loadEvents called for', username);
    const key = 'muteBlockEvents-' + username;
    const events = await getStoredData<string[]>(key, []);
    debugLog('Loaded events for', username, ...events);
    return events;
  }

  // --- Timestamp helper ---
  /**
   * Generates a formatted timestamp string (DD/MM/YYYY HH:MM).
   * @returns The formatted timestamp string.
   */
  function getTimestamp() {
    debugLog('getTimestamp called.');
    const now = new Date();
    const pad = (num: number) => num.toString().padStart(2, '0');
    const day = pad(now.getDate());
    const month = pad(now.getMonth() + 1);
    const year = now.getFullYear().toString();
    const hours = pad(now.getHours());
    const minutes = pad(now.getMinutes());
    const timestamp = `${day}/${month}/${year} ${hours}:${minutes}`;
    debugLog('Timestamp generated:', timestamp);
    return timestamp;
  }

  // --- Auto-resize textarea ---
  // Expands the textarea to fit its content. If more than one line, adds one extra row.
  /**
   * Automatically resizes a textarea element to fit its content.
   * Adds a small padding if the content has more than one line.
   * Ensures a minimum height for the textarea.
   * @param textarea The textarea element to resize.
   */
  function autoResizeTextarea(textarea: HTMLTextAreaElement) {
    debugLog('autoResizeTextarea called for element:', textarea.tagName);
    textarea.style.height = 'auto';
    let newHeight = textarea.scrollHeight;
    const contentLines = textarea.value.split('\n').length;
    // const lineHeight =
    //   parseFloat(window.getComputedStyle(textarea).lineHeight) || 20;
    if (contentLines > 1) newHeight += 5;
    if (newHeight < 20) newHeight = 20;
    textarea.style.height = `${String(newHeight)}px`;
  }

  // --- Profile textarea functions ---
  /**
   * Updates the content of the profile textarea for a given username.
   * Loads events for the user and sets them as the textarea value.
   * @param username The username whose profile textarea needs to be updated.
   */
  async function updateTextareaForProfile(username: string) {
    debugLog('updateTextareaForProfile called for', username);
    const ta = document.getElementById('muteBlockInfoTextarea');
    if (!(ta instanceof HTMLTextAreaElement)) {
      debugLog(
        "Profile textarea with ID 'muteBlockInfoTextarea' not found or not a textarea. Aborting update."
      );
      return;
    }
    const events = await loadEvents(username);
    ta.value = events.join('\n\n');
    autoResizeTextarea(ta);
    debugLog('Profile textarea updated for', username);
  }

  /**
   * Saves the contents of a textarea associated with a username.
   * Splits the value by double newlines and filters out empty strings.
   * @param username The username associated with the textarea.
   * @param value The new content of the textarea.
   */
  async function saveTextareaContents(username: string, value: string) {
    debugLog('saveTextareaContents called for', username);
    const events = value.split('\n\n').filter((s: string) => s.trim() !== '');
    await setStoredData('muteBlockEvents-' + username, events);
    debugLog('Profile textarea contents saved for', username, ...events);
  }

  // Insert the profile textarea under the user description.
  /**
   * Adds a textarea to the user's profile page for storing notes.
   * The textarea is placed under the user's join date information.
   * It handles existing textareas and updates based on username changes.
   */
  function addTextareaToProfile() {
    debugLog('addTextareaToProfile called.');
    const profileAnchorElement = document.querySelector(
      '[data-testid="UserJoinDate"]'
    );
    if (!profileAnchorElement) {
      debugLog('profile anchor element not found. Aborting.');
      return;
    }

    // actually contains human-readable name too
    const userNameContainerElement = document.querySelector<HTMLElement>(
      '[data-testid="UserName"]'
    );
    const userNameElement = userNameContainerElement
      ? [
          ...userNameContainerElement.querySelectorAll<HTMLSpanElement>('span'),
        ].pop()
      : undefined;
    const username = userNameElement?.textContent?.trim() ?? '';
    debugLog('Detected username (profile):', username);

    // Check if container exists.
    let existingContainer = document.getElementById('muteBlockInfoContainer');
    if (existingContainer) {
      // If the container's data-username doesn't match, remove it.
      if (existingContainer.getAttribute('data-username') !== username) {
        debugLog('Existing container belongs to a different user. Removing.');
        existingContainer.remove();
        existingContainer = null;
      } else {
        debugLog('Profile textarea container already exists for', username);
        return;
      }
    }

    const container = document.createElement('div');
    container.id = 'muteBlockInfoContainer';
    container.setAttribute('data-username', username);
    container.style.marginTop = '10px';

    const ta = document.createElement('textarea');
    ta.id = 'muteBlockInfoTextarea';
    ta.style.width = '100%';
    ta.style.boxSizing = 'border-box';
    ta.style.borderRadius = '10px';
    ta.style.padding = '3px';
    ta.style.resize = 'none';
    ta.style.lineHeight = '1.25';
    ta.style.backgroundColor = 'transparent';
    ta.rows = 1;
    ta.placeholder = 'Your notes for ' + username + ' (visible only to you)';
    // Save content on every input event.
    ta.addEventListener('input', function () {
      debugLog('Profile textarea input event triggered.');
      autoResizeTextarea(ta);
      void saveTextareaContents(username, ta.value);
      if (debounceTimers[username]) {
        clearTimeout(debounceTimers[username]);
      }
      debounceTimers[username] = window.setTimeout(() => {
        syncTextareas(username, ta.value);
        debounceTimers[username] = undefined;
      }, 300);
    });
    ta.addEventListener('focus', function () {
      debugLog('Profile textarea focus event triggered. Expanding fully.');
      autoResizeTextarea(ta);
    });
    void loadEvents(username).then((events) => {
      ta.value = events.join('\n\n');
      autoResizeTextarea(ta);
    });
    container.appendChild(ta);
    debugLog('Profile textarea created and populated.');
    registerTextarea(username, ta);
    if (profileAnchorElement.parentElement) {
      profileAnchorElement.parentElement.insertBefore(
        container,
        profileAnchorElement.nextSibling
      );
      debugLog('Profile textarea container added to the profile page.');
    } else {
      debugLog(
        'Error: profileAnchorElement.parentElement is null. Cannot add textarea container.'
      );
    }
  }

  // Observe for profile page content dynamically loaded.

  const profileObserver = new MutationObserver(() => {
    if (/^\/[^/]+\/?$/.test(window.location.pathname)) {
      addTextareaToProfile();
    }
  });
  profileObserver.observe(document.body, { childList: true, subtree: true });

  // --- Find tweet container by tweet ID ---
  /**
   * Finds the tweet container element (article) by its status ID.
   * @param tweetId The status ID of the tweet.
   * @returns The HTMLElement of the tweet container, or null if not found.
   */
  function findTweetContainerByStatusId(tweetId: string): HTMLElement | null {
    debugLog('Searching for tweet container with status id:', tweetId);
    const potentialContainers = document.querySelectorAll<HTMLElement>(
      'article[data-testid="tweet"]'
    );
    for (const container of potentialContainers) {
      const link = container.querySelector(`a[href*="/status/${tweetId}"]`);
      if (link) {
        debugLog('Found tweet container by status id:', container.tagName);
        return container;
      }
    }
    debugLog(`Tweet container not found for statusId: ${tweetId}`);
    return null;
  }

  // --- Clean tweet content ---
  /**
   * Compress the text content of a tweet.
   * @param content The raw tweet content string.
   * @returns The cleaned tweet content string.
   */
  function cleanTweetContent(content: string | null) {
    if (!content) {
      debugLog('No content to clean.');
      return '';
    }
    debugLog('Cleaning tweet content.');
    // Replace newlines with spaces for a more compact display.
    const cleanedContent = content.replace(/\n+/g, ' ').trim();
    // Truncate if too long.
    // if (cleanedContent.length > 100) {
    //   cleanedContent = cleanedContent.substring(0, 97) + '...';
    // }
    debugLog('Cleaned tweet content:', cleanedContent);
    return cleanedContent;
  }

  // --- Button Listener Functions ---
  /**
   * Handles the mouseover event for a mute/block button.
   * Highlights the corresponding tweet container.
   * @param buttonElement The button element.
   */
  function handleMuteBlockButtonMouseOver(
    buttonElement: HTMLElement & { _highlightedTweet?: HTMLElement | null }
  ) {
    debugLog(
      'Mouseover on mute/block button detected. Button tagName:',
      buttonElement.tagName
    );
    const popupContainer =
      buttonElement.closest('[role="menu"]') ?? buttonElement;
    if (!(popupContainer instanceof Element)) return;

    const engagementLink =
      popupContainer.querySelector('a[data-testid="tweetEngagements"]') ??
      popupContainer.querySelector('a[href*="/status/"]');

    if (engagementLink instanceof HTMLAnchorElement) {
      const href = engagementLink.getAttribute('href');
      if (href) {
        debugLog('Engagement link found with href:', href);
        const tweetIdMatch = /\/status\/(\d+)/.exec(href);
        if (tweetIdMatch) {
          const tweetId = tweetIdMatch[1];
          const container = findTweetContainerByStatusId(tweetId);
          if (container && ENABLE_HIGHLIGHT) {
            debugLog(
              'Highlighting tweet container tagName:',
              container.tagName
            );
            container.style.outline = '2px solid red';
            buttonElement._highlightedTweet = container;
          }
        }
      }
    }
  }

  /**
   * Handles the mouseout event for a mute/block button.
   * Removes the highlight from the corresponding tweet container.
   * @param buttonElement The button element.
   */
  function handleMuteBlockButtonMouseOut(
    buttonElement: HTMLElement & { _highlightedTweet?: HTMLElement | null }
  ) {
    debugLog(
      'Mouseout on mute/block button detected. Button tagName:',
      buttonElement.tagName
    );
    const popupContainer =
      buttonElement.closest('[role="menu"]') ?? buttonElement;
    if (popupContainer instanceof HTMLElement) {
      popupContainer.style.outline = '';
    }
    if (buttonElement._highlightedTweet) {
      buttonElement._highlightedTweet.style.outline = '';
      buttonElement._highlightedTweet = null;
    }
  }

  /**
   * Extracts tweet details (URL and text) from the tweet container.
   * @param engagementLink The engagement link element.
   * @returns An object containing the tweet URL and text, or null if details cannot be extracted.
   */
  function extractTweetDetailsFromButton(
    engagementLink: HTMLAnchorElement
  ): { tweetUrl: string; tweetText: string } | null {
    let tweetUrl = '';
    let tweetText = '';
    const href = engagementLink.getAttribute('href');
    if (!href) return null;

    debugLog('Engagement link href:', href);
    const tweetIdMatch = /\/status\/(\d+)/.exec(href);
    if (tweetIdMatch) {
      const tweetId = tweetIdMatch[1];
      const container = findTweetContainerByStatusId(tweetId);
      if (container) {
        const linkInContainer = container.querySelector('a[href*="/status/"]');
        tweetUrl =
          linkInContainer instanceof HTMLAnchorElement
            ? linkInContainer.href
            : href;
        const tweetTextElem = container.querySelector(
          '[data-testid="tweetText"]'
        );
        if (tweetTextElem) {
          tweetText = cleanTweetContent(tweetTextElem.textContent ?? '');
        } else {
          debugLog(
            'WARNING: tweetTextElem not found, falling back to container innerText. Container tagName:',
            container.tagName
          );
          tweetText = cleanTweetContent(container.innerText);
        }
      } else {
        tweetUrl = href; // Fallback to engagement link href if container not found
      }
    } else {
      tweetUrl = href; // Fallback if no tweet ID in engagement link
    }
    return { tweetUrl, tweetText };
  }

  /**
   * Processes the mute or block action.
   * Saves the event and updates the UI if necessary.
   * @param buttonText The text content of the button.
   * @param tweetUrl The URL of the tweet.
   * @param tweetText The text content of the tweet.
   */
  async function processMuteBlockAction(
    buttonText: string | null,
    tweetUrl: string,
    tweetText: string
  ) {
    if (!buttonText) {
      debugLog('Button text is null, cannot process action.');
      return;
    }
    const usernameMatch = /@(\S+)/.exec(buttonText);
    if (!usernameMatch) {
      debugLog('Username not found in button text:', buttonText);
      return;
    }
    const username = '@' + usernameMatch[1];
    const timestamp = getTimestamp();
    const action = buttonText.includes('Mute') ? 'Muted' : 'Blocked';
    const logEntry = `${action} on ${timestamp}. Reason:\n${tweetUrl}\n${tweetText}`;
    await saveEvent(username, logEntry);
    debugLog('Mute/Block event saved for', username, 'Log entry:', logEntry);

    const pathParts = window.location.pathname.split('/');
    if (pathParts.length >= 2 && '@' + pathParts[1] === username) {
      debugLog('Updating profile textarea for current profile', username);
      const muteBlockInfoTextarea = document.getElementById(
        'muteBlockInfoTextarea'
      ) as HTMLTextAreaElement | null;
      if (muteBlockInfoTextarea) {
        await updateTextareaForProfile(username);
        syncTextareas(username, muteBlockInfoTextarea.value);
      } else {
        debugLog('muteBlockInfoTextarea not found on page.');
      }
    }
  }

  /**
   * Handles the click event for a mute/block button.
   * Extracts tweet details, processes the action, and logs the event.
   * @param buttonElement The button element.
   */
  async function handleMuteBlockButtonClick(buttonElement: HTMLElement) {
    debugLog(
      'Mute/Block button click detected. Button tagName:',
      buttonElement.tagName
    );
    const popupContainer =
      buttonElement.closest('[role="menu"]') ?? buttonElement;
    if (!(popupContainer instanceof Element)) return;

    const engagementLink =
      popupContainer.querySelector('a[data-testid="tweetEngagements"]') ??
      popupContainer.querySelector('a[href*="/status/"]');

    let tweetUrl = '';
    let tweetText = '';

    if (engagementLink instanceof HTMLAnchorElement) {
      const details = extractTweetDetailsFromButton(engagementLink);
      if (details) {
        tweetUrl = details.tweetUrl;
        tweetText = details.tweetText;
      } else if (engagementLink.href) {
        // Fallback if details are null but href exists
        tweetUrl = engagementLink.href;
      }
    }
    await processMuteBlockAction(
      buttonElement.textContent,
      tweetUrl,
      tweetText
    );
  }

  /**
   * Attaches mouseover, mouseout, and click event listeners to a mute/block button.
   * Prevents attaching listeners multiple times to the same button.
   * @param buttonElement The HTMLElement of the button.
   */
  function attachListenerToMuteBlockButton(buttonElement: HTMLElement) {
    debugLog(
      'attachListenerToMuteBlockButton called for element with tagName:',
      buttonElement.tagName
    );
    if (buttonElement.getAttribute('data-mute-listener-attached') === 'true') {
      debugLog('Listener already attached to this button.');
      return;
    }
    buttonElement.setAttribute('data-mute-listener-attached', 'true');

    buttonElement.addEventListener('mouseover', (_e: MouseEvent) => {
      handleMuteBlockButtonMouseOver(
        buttonElement as HTMLElement & {
          _highlightedTweet?: HTMLElement | null;
        }
      );
    });
    buttonElement.addEventListener('mouseout', (_e: MouseEvent) => {
      handleMuteBlockButtonMouseOut(
        buttonElement as HTMLElement & {
          _highlightedTweet?: HTMLElement | null;
        }
      );
    });
    buttonElement.addEventListener('click', (_e: MouseEvent) => {
      void handleMuteBlockButtonClick(buttonElement);
    });
  }

  // --- Observe new mute/block buttons ---
  const buttonObserver = new MutationObserver(function (mutations) {
    mutations.forEach(function (mutation) {
      mutation.addedNodes.forEach(function (node) {
        if (node instanceof Element) {
          const elementNode = node;
          if (
            elementNode.getAttribute('role') === 'menuitem' &&
            elementNode.textContent &&
            (elementNode.textContent.includes('Mute') ||
              elementNode.textContent.includes('Block'))
          ) {
            debugLog('Found new mute/block menuitem:', elementNode.tagName);
            attachListenerToMuteBlockButton(elementNode as HTMLElement);
          }
          // Check if querySelectorAll exists before calling it
          if (typeof elementNode.querySelectorAll === 'function') {
            const muteButtons =
              elementNode.querySelectorAll<HTMLElement>('[role="menuitem"]');
            if (muteButtons.length > 0) {
              muteButtons.forEach(function (btn) {
                // btn is an Element here
                if (
                  btn.textContent &&
                  (btn.textContent.includes('Mute') ||
                    btn.textContent.includes('Block'))
                ) {
                  attachListenerToMuteBlockButton(btn);
                }
              });
            }
          }
        }
      });
    });
  });
  buttonObserver.observe(document.body, { childList: true, subtree: true });
  debugLog('[DEBUG] Button observer set up.');

  // On initial load, if on a profile page, insert the profile textarea.
  if (/^\/[^/]+\/?$/.test(window.location.pathname)) {
    debugLog('On initial load: profile page detected.');
    addTextareaToProfile();
  }

  // --- Hover Card Text Field for User Hover ---
  /**
   * Waits for the username anchor element to appear within a hover card.
   * Tries for a limited number of attempts with a delay.
   * @param hoverCard The hover card element to search within.
   * @returns A promise that resolves with the anchor element or null if not found.
   */
  async function waitForUsernameAnchor(hoverCard: Element) {
    for (let i = 0; i < 51; i++) {
      const anchor = hoverCard.querySelector('a[href^="/"]');
      if (anchor) return anchor;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    return null;
  }

  /**
   * Extracts the username from a hover card element.
   * @param hoverCard The hover card element.
   * @returns A promise that resolves to the username (e.g., "@username") or null if not found.
   */
  async function extractUsernameFromHoverCard(
    hoverCard: Element
  ): Promise<string | null> {
    const usernameAnchor = await waitForUsernameAnchor(hoverCard);
    if (!usernameAnchor) {
      debugLog('No username anchor found in hover card after waiting.');
      return null;
    }
    const usernameHref = usernameAnchor.getAttribute('href');
    if (!usernameHref) {
      debugLog('Username anchor found but href is null.');
      return null;
    }
    return '@' + usernameHref.slice(1);
  }

  /**
   * Creates and configures a textarea element for user notes (Hover Card).
   * @param username The username for whom the notes are.
   * @param hoverCard The hovercard DOM element.
   * @returns The configured textarea element.
   */
  function createNotesTextarea(
    username: string,
    hoverCard: Element
  ): HTMLTextAreaElement {
    const ta = document.createElement('textarea');
    ta.style.width = '100%';
    ta.style.boxSizing = 'border-box';
    ta.style.borderRadius = '0 0 10px 10px';
    ta.style.resize = 'none';
    ta.style.lineHeight = '1.25';
    ta.style.paddingLeft = '1em';
    ta.style.paddingRight = '1em';
    ta.style.backgroundColor = 'transparent';
    ta.rows = 1;
    ta.placeholder = 'Your notes for ' + username + ' (visible only to you)';
    ta.style.height = '50px';
    ta.style.overflow = 'hidden';

    // Handler to prevent the hovercard from closing when the textarea is focused
    const preventHovercardCloseHandler = (event: Event) => {
      debugLog(
        '[X Note addon] hovercard.mouseleave listener fired while textarea focused. Stopping propagation.'
      );
      event.stopPropagation();
    };

    ta.addEventListener('focus', () => {
      debugLog(
        `[X Note addon] Textarea for ${username} focused. Adding mouseleave listener to hoverCard.`
      );
      hoverCard.addEventListener(
        'mouseleave',
        preventHovercardCloseHandler,
        true
      ); // Use capture phase
    });

    ta.addEventListener('blur', () => {
      debugLog(
        `[X Note addon] Textarea for ${username} blurred. Removing mouseleave listener from hoverCard.`
      );
      hoverCard.removeEventListener(
        'mouseleave',
        preventHovercardCloseHandler,
        true
      );
    });

    ta.addEventListener('input', function () {
      void saveTextareaContents(username, ta.value);
      if (debounceTimers[username]) {
        clearTimeout(debounceTimers[username]);
      }
      debounceTimers[username] = window.setTimeout(() => {
        syncTextareas(username, ta.value);
        debounceTimers[username] = undefined;
      }, 300);
    });

    void loadEvents(username).then((events) => {
      ta.value = events.join('\n\n');
    });

    registerTextarea(username, ta);
    return ta;
  }

  /**
   * Creates a container div for the notes textarea.
   * @returns The container div element.
   */
  function createTextareaContainer(): HTMLDivElement {
    const container = document.createElement('div');
    container.className = 'hovercard-textfield';
    return container;
  }

  /**
   * Adds a textarea to a user hover card for storing notes about the user.
   * Extracts the username from the hover card, creates a textarea,
   * loads existing notes, and sets up event listeners for saving and syncing.
   * @param hoverCard The hover card element (must be an Element).
   */
  async function addTextFieldToHoverCard(hoverCard: Element) {
    if (hoverCard.querySelector('.hovercard-textfield')) {
      debugLog('Hover card text field already exists.');
      return;
    }

    const username = await extractUsernameFromHoverCard(hoverCard);
    if (!username) {
      debugLog('Could not extract username from hover card.');
      return;
    }
    // check again to prevent a race condition
    if (hoverCard.querySelector('.hovercard-textfield')) {
      debugLog('Hover card text field already exists (race condition check).');
      return;
    }
    debugLog('Detected username (hover card):', username);

    const container = createTextareaContainer();
    const ta = createNotesTextarea(username, hoverCard);
    container.appendChild(ta);

    // Instead of attaching to the Profile Summary button's parent,
    // try to attach to an inner container in the hover card.
    const innerContainer = hoverCard.querySelector('div'); // hoverCard is Element, so this is fine
    if (innerContainer) {
      innerContainer.appendChild(container);
      debugLog('Hover card text field inserted into inner container.');
    } else {
      // Fallback: append at the end of the hover card.
      hoverCard.appendChild(container); // appendChild is on Node, Element extends Node
      debugLog('Hover card text field inserted at end of hover card.');
    }
  }

  // Observe dynamic hover cards.
  const hoverCardObserver = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      mutation.addedNodes.forEach((node) => {
        if (node instanceof Element) {
          const elementNode = node;
          // Look for a hover card container.
          if (
            elementNode.hasAttribute('data-testid') &&
            elementNode.getAttribute('data-testid') === 'HoverCard'
          ) {
            debugLog('HoverCard detected:', elementNode.tagName);
            void addTextFieldToHoverCard(elementNode);
          } else {
            // Also check descendants.
            // Check if querySelectorAll exists before calling it
            if (typeof elementNode.querySelectorAll === 'function') {
              const hoverCards = elementNode.querySelectorAll(
                '[data-testid="HoverCard"]'
              );
              if (hoverCards.length > 0) {
                hoverCards.forEach((hc: Element) => {
                  // hc is an Element
                  debugLog('HoverCard detected in subtree:', hc.tagName);
                  void addTextFieldToHoverCard(hc);
                });
              }
            }
          }
        }
      });
    });
  });

  hoverCardObserver.observe(document.body, { childList: true, subtree: true });
  debugLog('Hover card observer set up.');
})();
