(() => {
  const ENABLE_HIGHLIGHT = false;
  const DEBUG_LOG = false;
  const USER_PROFILE_REGEX = /^\/[A-Za-z0-9_]{1,15}\/?$/;

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
  function normalizeUsername(username: string): string {
    return username.replace(/^@/, '');
  }

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

    const stillAttachedTextareas: HTMLTextAreaElement[] = [];
    arr.forEach((ta: HTMLTextAreaElement) => {
      if (document.contains(ta)) {
        if (ta.value !== newValue) {
          ta.value = newValue;
          autoResizeTextarea(ta);
        }
        stillAttachedTextareas.push(ta); // Keep it if attached
      }
      // If not contained in document, it's effectively pruned from the next set for this username
    });

    if (stillAttachedTextareas.length > 0) {
      trackedTextareas.set(username, stillAttachedTextareas);
    } else {
      // If no textareas remain attached for this user, remove the entry from the map
      trackedTextareas.delete(username);
      debugLog(
        'Removed username from trackedTextareas as no instances remain:',
        username
      );
    }
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
   * Saves a note for a given username.
   * Prepends the new note to the existing notes.
   * @param username The username associated with the note.
   * @param noteText The note text to save.
   */
  async function saveNote(username: string, noteText: string) {
    debugLog('saveNote called for', username);
    const key = 'muteBlockNotes-' + username;
    const existingNote = await getStoredData<string>(key, '');
    debugLog('Existing note for', username, existingNote);
    const updatedNote = noteText + (existingNote ? '\n\n' + existingNote : '');
    await setStoredData(key, updatedNote);
    debugLog('New note saved for', username, noteText);
  }

  /**
   * Loads note string for a given username.
   * @param username The username whose note is to be loaded.
   * @returns A promise that resolves with the user's note string.
   */
  async function loadNote(username: string) {
    debugLog('loadNote called for', username);
    const key = 'muteBlockNotes-' + username;
    const note = await getStoredData<string>(key, '');
    debugLog('Loaded note for', username, note);
    return note;
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
  /**
   * Automatically resizes a textarea element to fit its content.
   * Adds a small padding if the content has more than one line.
   * Respects the min-height and max-height CSS properties of the element.
   * Shows scrollbars when content exceeds max-height.
   * @param textarea The textarea element to resize.
   */
  function autoResizeTextarea(textarea: HTMLTextAreaElement) {
    debugLog('autoResizeTextarea called for element:', textarea.tagName);
    // Reset height to auto so we can measure the scrollHeight correctly
    textarea.style.height = 'auto';

    // Get the computed style to check for max-height
    const computedStyle = window.getComputedStyle(textarea);
    const maxHeight = parseInt(computedStyle.maxHeight, 10);

    // Calculate the new height
    let newHeight = textarea.scrollHeight;
    const contentLines = textarea.value.split('\n').length;
    if (contentLines > 1) newHeight += 5;

    // If newHeight exceeds maxHeight, set to maxHeight and ensure scrollbar appears
    if (!isNaN(maxHeight) && newHeight > maxHeight) {
      newHeight = maxHeight;
      textarea.style.overflowY = 'auto';
    } else {
      // Only hide vertical scrollbar when not at max height
      textarea.style.overflowY = 'hidden';
    }

    // Set the new height
    textarea.style.height = `${String(newHeight)}px`;
  }

  // --- Profile textarea functions ---
  /**
   * Updates the content of the profile textarea for a given username.
   * Loads note for the user and sets it as the textarea value.
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
    const note = await loadNote(username);
    ta.value = note;
    autoResizeTextarea(ta);
    debugLog('Profile textarea updated for', username);
  }

  /**
   * Saves the contents of a textarea associated with a username.
   * @param username The username associated with the textarea.
   * @param value The new content of the textarea.
   */
  async function saveTextareaContents(username: string, value: string) {
    debugLog('saveTextareaContents called for', username);
    await setStoredData('muteBlockNotes-' + username, value);
    debugLog('Profile textarea contents saved for', username, value);
  }

  // Insert the profile textarea under the user description.
  /**
   * Adds a textarea to the user's profile page for storing notes.
   * The textarea is placed under the user's join date information.
   * It handles existing textareas and updates based on username changes.
   */
  function addTextareaToProfile() {
    debugLog('addTextareaToProfile called.');
    const userNameContainerElement = document.querySelector<HTMLElement>(
      '[data-testid="UserName"]'
    );
    const userNameElement = userNameContainerElement
      ? [...userNameContainerElement.querySelectorAll<HTMLSpanElement>('span')]
          .map((span) => span.textContent?.trim())
          .filter((text) => text?.startsWith('@'))
          .pop()
      : undefined;
    const username = userNameElement?.trim() ?? '';
    debugLog('Detected username (profile):', username);
    if (!username) {
      debugLog('No username found. Aborting.');
      return;
    }
    const profileAnchorElement = document.querySelector(
      `[href="/${normalizeUsername(username)}/verified_followers"]`
    );
    if (!profileAnchorElement) {
      debugLog('profile anchor element not found. Aborting.');
      return;
    }
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
    ta.style.border = '1px solid #ccc';
    ta.style.lineHeight = '1.25';
    ta.style.minHeight = '20px';
    ta.style.maxHeight = '500px';
    ta.style.overflowY = 'auto';
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
    void loadNote(username).then((note) => {
      ta.value = note;
      autoResizeTextarea(ta);
    });
    container.appendChild(ta);
    debugLog('Profile textarea created and populated.');
    registerTextarea(username, ta);
    const insertionContainer =
      profileAnchorElement?.parentElement?.parentElement?.parentElement;
    if (insertionContainer) {
      insertionContainer.insertBefore(
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
   * Saves the note and updates the UI if necessary.
   * @param buttonText The text content of the button.
   * @param tweetUrl The URL of the tweet.
   * @param tweetText The text content of the tweet.
   */
  async function processMuteBlockAction(
    buttonText: string | null,
    username: string,
    tweetUrl: string | null,
    tweetText: string | null
  ) {
    if (!buttonText) {
      debugLog('Button text is null, cannot process action.');
      return;
    }
    username = '@' + username;
    const timestamp = getTimestamp();
    const action = buttonText.includes('Mute') ? 'Muted' : 'Blocked';
    const logEntry = tweetUrl
      ? `${action} on ${timestamp}. Reason:\n${tweetUrl}\n${tweetText}`
      : `${action} on ${timestamp}.`;
    await saveNote(username, logEntry);
    debugLog('Mute/Block note saved for', username, 'Log entry:', logEntry);

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

  function detectUsername(popupContainer: Element): string | void {
    // try using engagement link
    const engagementLink: HTMLAnchorElement | null =
      popupContainer.querySelector('a[data-testid="tweetEngagements"]') ??
      popupContainer.querySelector('a[href*="/status/"]');

    let username = '';
    if (engagementLink === null) {
      // try using lists link
      const listsLink: HTMLAnchorElement | null =
        popupContainer.querySelector('a[href$="/lists"]');
      if (listsLink === null) {
        // try using topics link
        const topicsLink: HTMLAnchorElement | null =
          popupContainer.querySelector('a[href$="/topics"]');
        if (topicsLink === null) {
          debugLog("engagementLink not found, couldn't detect username");
          return;
        } else {
          username = topicsLink.href.split('/')[3];
        }
      } else {
        username = listsLink.href.split('/')[3];
      }
    } else {
      username = engagementLink.href.split('/')[3];
    }

    return username;
  }

  /**
   * Waits for the block confirmation dialog and attaches a click listener
   * to the confirm button to save the note only after confirmation.
   * @param username The username being blocked.
   * @param tweetUrl The URL of the tweet (if applicable).
   * @param tweetText The text content of the tweet (if applicable).
   */
  function waitForBlockConfirmation(
    username: string,
    tweetUrl: string | null,
    tweetText: string | null
  ) {
    debugLog('Waiting for block confirmation dialog...');

    // Set up a MutationObserver to watch for the confirmation button
    const confirmationObserver = new MutationObserver((mutations, observer) => {
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (!(node instanceof Element)) continue;

          // Look for the confirmation button in the added node or its descendants
          const confirmButton = node.matches(
            '[data-testid="confirmationSheetConfirm"]'
          )
            ? node
            : node.querySelector('[data-testid="confirmationSheetConfirm"]');

          if (confirmButton instanceof HTMLElement) {
            debugLog('Block confirmation button found.');

            // Avoid attaching multiple listeners
            if (
              confirmButton.getAttribute('data-block-confirm-listener') ===
              'true'
            ) {
              debugLog('Confirmation listener already attached.');
              return;
            }
            confirmButton.setAttribute('data-block-confirm-listener', 'true');

            confirmButton.addEventListener('click', () => {
              debugLog('Block confirmation button clicked, saving note...');
              void processMuteBlockAction(
                'Block',
                username,
                tweetUrl,
                tweetText
              );
            });

            // Stop observing once we've found and set up the button
            observer.disconnect();
            debugLog('Confirmation observer disconnected.');
            return;
          }
        }
      }
    });

    // Start observing for the confirmation dialog
    confirmationObserver.observe(document.body, {
      childList: true,
      subtree: true,
    });

    // Set a timeout to disconnect the observer if the dialog doesn't appear
    setTimeout(() => {
      confirmationObserver.disconnect();
      debugLog(
        'Block confirmation observer timed out after 10 seconds, disconnected.'
      );
    }, 10000);
  }

  /**
   * Handles the click event for a mute/block button.
   * Extracts tweet details, processes the action, and logs the event.
   * For Mute actions, saves the note immediately.
   * For Block actions, waits for the confirmation dialog before saving.
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

    const username = detectUsername(popupContainer);
    if (!username) {
      debugLog('Username not found, cannot process action.');
      return;
    }

    let tweetUrl = null;
    let tweetText = null;

    const engagementLink: HTMLAnchorElement | null =
      popupContainer.querySelector('a[data-testid="tweetEngagements"]') ??
      popupContainer.querySelector('a[href*="/status/"]');

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

    const buttonText = buttonElement.textContent;
    const isBlockAction = buttonText?.includes('Block');

    if (isBlockAction) {
      // For Block actions, wait for the confirmation dialog
      debugLog('Block action detected, waiting for confirmation...');
      waitForBlockConfirmation(username, tweetUrl, tweetText);
    } else {
      // For Mute actions, save immediately
      debugLog('Mute action detected, saving immediately...');
      await processMuteBlockAction(buttonText, username, tweetUrl, tweetText);
    }
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
    if (ENABLE_HIGHLIGHT) {
      buttonElement.addEventListener('mouseover', () => {
        handleMuteBlockButtonMouseOver(
          buttonElement as HTMLElement & {
            _highlightedTweet?: HTMLElement | null;
          }
        );
      });
      buttonElement.addEventListener('mouseout', () => {
        handleMuteBlockButtonMouseOut(
          buttonElement as HTMLElement & {
            _highlightedTweet?: HTMLElement | null;
          }
        );
      });
    }
    buttonElement.addEventListener('click', () => {
      void handleMuteBlockButtonClick(buttonElement);
    });
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
    ta.style.border = '1px solid #ccc';
    ta.rows = 1;
    ta.placeholder = 'Your notes for ' + username + ' (visible only to you)';
    ta.style.minHeight = '55px';
    ta.style.maxHeight = '140px';
    ta.style.overflowY = 'auto';

    // Handler to prevent the hovercard from closing when the textarea is focused
    const preventHovercardCloseHandler = (event: Event) => {
      debugLog(
        '[X Note addon] hovercard.mouseleave listener fired while textarea focused. Stopping propagation.'
      );
      event.stopPropagation();
      event.stopImmediatePropagation();
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
      autoResizeTextarea(ta);
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

    void loadNote(username).then((note) => {
      ta.value = note;
      autoResizeTextarea(ta);
    });

    registerTextarea(username, ta);
    return ta;
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

    const anchorElement = hoverCard.querySelector(
      `[href="/${normalizeUsername(username)}/verified_followers"]`
    );
    if (!anchorElement) {
      debugLog('Anchor element not found. Aborting.');
      return;
    }

    const container = document.createElement('div');
    container.className = 'hovercard-textfield';
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

  // --- Consolidated Mutation Observer ---
  const globalObserver = new MutationObserver((mutations) => {
    let profileNeedsCheck = false;

    mutations.forEach((mutation) => {
      mutation.addedNodes.forEach((node) => {
        if (!(node instanceof Element)) return;
        const elementNode = node as Element;

        // --- Logic from buttonObserver ---
        if (
          elementNode.getAttribute('role') === 'menuitem' &&
          elementNode.textContent &&
          (elementNode.textContent.includes('Mute') ||
            elementNode.textContent.includes('Block'))
        ) {
          debugLog(
            'Found new mute/block menuitem via combined observer:',
            elementNode.tagName
          );
          attachListenerToMuteBlockButton(elementNode as HTMLElement);
        }
        // Check descendants for mute/block buttons
        if (typeof elementNode.querySelectorAll === 'function') {
          const muteButtons =
            elementNode.querySelectorAll<HTMLElement>('[role="menuitem"]');
          muteButtons.forEach(function (btn) {
            if (
              btn.textContent &&
              (btn.textContent.includes('Mute') ||
                btn.textContent.includes('Block'))
            ) {
              attachListenerToMuteBlockButton(btn);
            }
          });
        }

        // --- Logic from hoverCardObserver ---
        if (
          elementNode.hasAttribute('data-testid') &&
          elementNode.getAttribute('data-testid') === 'HoverCard'
        ) {
          debugLog(
            'HoverCard detected via combined observer:',
            elementNode.tagName
          );
          void addTextFieldToHoverCard(elementNode);
        } else {
          // Also check descendants for hover cards
          if (typeof elementNode.querySelectorAll === 'function') {
            const hoverCards = elementNode.querySelectorAll<Element>(
              '[data-testid="HoverCard"]'
            );
            hoverCards.forEach((hc) => {
              debugLog(
                'HoverCard detected in subtree via combined observer:',
                hc.tagName
              );
              void addTextFieldToHoverCard(hc);
            });
          }
        }
      });
      // If any childList mutation happened, it's worth re-checking profile state
      if (mutation.type === 'childList') {
        profileNeedsCheck = true;
      }
    });

    // --- Logic from profileObserver ---
    if (
      profileNeedsCheck &&
      USER_PROFILE_REGEX.test(window.location.pathname)
    ) {
      addTextareaToProfile();
    }
  });

  globalObserver.observe(document.body, { childList: true, subtree: true });
  debugLog('[DEBUG] Combined observer set up.');

  // On initial load, if on a profile page, insert the profile textarea.
  if (USER_PROFILE_REGEX.test(window.location.pathname)) {
    debugLog('On initial load: profile page detected.');
    addTextareaToProfile();
  }
})();
