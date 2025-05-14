document.addEventListener('DOMContentLoaded', function () {
  // Theme detection and handling
  function applyThemeBasedOnSystemPreference() {
    // This function is for potential additional theme-related logic
    // The actual theme switching is handled by CSS media queries
    console.log(
      'Applied theme based on system preference:',
      window.matchMedia('(prefers-color-scheme: dark)').matches
        ? 'dark'
        : 'light'
    );
  }

  // Initial theme application
  applyThemeBasedOnSystemPreference();

  // Listen for system theme changes
  window
    .matchMedia('(prefers-color-scheme: dark)')
    .addEventListener('change', applyThemeBasedOnSystemPreference);

  // Rest of the options page initialization
  const backupArea = document.getElementById(
    'backupArea'
  ) as HTMLTextAreaElement | null;
  const downloadButton = document.getElementById(
    'exportButton'
  ) as HTMLButtonElement | null;
  const loadButton = document.getElementById(
    'importButton'
  ) as HTMLButtonElement | null;
  const importFile = document.getElementById(
    'importFile'
  ) as HTMLInputElement | null;
  const notesContainer = document.getElementById('notes-container');

  // Helper function to set the state of the notes container
  function setNotesContainerState(
    state: 'loading' | 'error' | 'empty' | 'clear',
    message?: string
  ) {
    if (!notesContainer) return;

    // Clear previous content
    while (notesContainer.firstChild) {
      notesContainer.removeChild(notesContainer.firstChild);
    }

    if (state === 'loading') {
      const loadingDiv = document.createElement('div');
      loadingDiv.className = 'loading-indicator';
      loadingDiv.textContent = message || 'Loading your notes...';
      notesContainer.appendChild(loadingDiv);
    } else if (state === 'error') {
      const errorDiv = document.createElement('div');
      errorDiv.className = 'empty-state'; // Assuming same class for styling
      errorDiv.textContent =
        'Error loading notes: ' + (message ?? 'Unknown error');
      notesContainer.appendChild(errorDiv);
    } else if (state === 'empty') {
      const emptyDiv = document.createElement('div');
      emptyDiv.className = 'empty-state';
      emptyDiv.textContent =
        message ||
        "You don't have any notes yet. Notes will appear here when you mute or block users on X.";
      notesContainer.appendChild(emptyDiv);
    }
    // 'clear' state is handled by the clearing logic at the beginning
  }

  // Interface for user note data
  interface UserNote {
    username: string; // With @ prefix
    content: string;
    key: string;
  }

  // Helper function to get backup data as a JSON string.
  function getBackupData(callback: (dataStr: string) => void) {
    chrome.storage.sync.get(null, function (items) {
      if (chrome.runtime.lastError) {
        alert(
          'Error retrieving data: ' +
            (chrome.runtime.lastError.message ?? 'Unknown error')
        );
        return;
      }
      const data: Record<string, unknown> = {};
      for (const key in items) {
        if (key.startsWith('muteBlockNotes-')) {
          data[key] = items[key];
        }
      }
      callback(JSON.stringify(data, null, 2));
    });
  }

  // Populate the backup textarea with the current backup data.
  function populateBackupArea() {
    getBackupData(function (dataStr) {
      if (backupArea) {
        backupArea.value = dataStr;
      }
    });
  }

  // Download backup data as a file.
  function downloadBackup() {
    getBackupData(function (dataStr) {
      if (backupArea) {
        backupArea.value = dataStr;
      }
      const blob = new Blob([dataStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;

      // Create a timestamp for the filename
      const now = new Date();
      const timestamp = now.toISOString().split('T')[0]; // YYYY-MM-DD format

      a.download = `x-user-notes-backup-${timestamp}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    });
  }

  downloadButton?.addEventListener('click', downloadBackup);

  loadButton?.addEventListener('click', function () {
    importFile?.click();
  });
  importFile?.addEventListener('change', function () {
    const file = importFile?.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function (evt) {
      try {
        if (!evt.target) {
          throw new Error('File read failed: No data available');
        }
        const result = evt.target.result;
        if (typeof result !== 'string') {
          throw new Error('File read failed: Invalid data format');
        }
        const parsedData = JSON.parse(result) as Record<string, unknown>;
        const dataToImport: Record<string, unknown> = parsedData;

        // Clear existing data before importing
        chrome.storage.sync.get(null, function (allItems) {
          if (chrome.runtime.lastError) {
            alert(
              'Error retrieving existing data for clearing: ' +
                (chrome.runtime.lastError.message ?? 'Unknown error')
            );
            return;
          }

          const keysToRemove = Object.keys(allItems).filter((key) =>
            key.startsWith('muteBlockNotes-')
          );

          if (keysToRemove.length > 0) {
            chrome.storage.sync.remove(keysToRemove, function () {
              if (chrome.runtime.lastError) {
                alert(
                  'Error clearing existing data: ' +
                    (chrome.runtime.lastError.message ?? 'Unknown error')
                );
                return;
              }
              // Proceed to set new data after clearing
              chrome.storage.sync.set(dataToImport, function () {
                if (chrome.runtime.lastError) {
                  alert(
                    'Import failed: ' +
                      (chrome.runtime.lastError.message ?? 'Unknown error')
                  );
                } else {
                  alert('Import successful! Data replaced.');
                  populateBackupArea();
                  loadAllUserNotes(); // Refresh the notes display
                }
              });
            });
          } else {
            // No relevant keys to remove, just set the new data
            chrome.storage.sync.set(dataToImport, function () {
              if (chrome.runtime.lastError) {
                alert(
                  'Import failed: ' +
                    (chrome.runtime.lastError.message ?? 'Unknown error')
                );
              } else {
                alert('Import successful! Data added.');
                populateBackupArea();
                loadAllUserNotes(); // Refresh the notes display
              }
            });
          }
        });
      } catch (error) {
        alert(`Import failed: invalid file. ${String(error)}`);
      }
    };
    reader.readAsText(file);
  });

  // Function to load all user notes from storage
  function loadAllUserNotes() {
    if (!notesContainer) return;

    // Show loading indicator
    setNotesContainerState('loading');

    chrome.storage.sync.get(null, function (items) {
      if (chrome.runtime.lastError) {
        setNotesContainerState(
          'error',
          chrome.runtime.lastError.message ?? 'Unknown error'
        );
        return;
      }

      // Extract notes with the 'muteBlockNotes-' prefix
      const userNotes: UserNote[] = [];
      for (const key in items) {
        if (key.startsWith('muteBlockNotes-')) {
          const username = key.replace('muteBlockNotes-', '');
          const content = items[key] as string;
          if (content && typeof content === 'string') {
            userNotes.push({
              username,
              content,
              key,
            });
          }
        }
      }

      // Sort notes alphabetically by username
      userNotes.sort((a, b) => a.username.localeCompare(b.username));

      // Check if there are any notes
      if (userNotes.length === 0) {
        setNotesContainerState('empty');
        return;
      }

      // Clear the container
      setNotesContainerState('clear');

      // Create UI for each note
      userNotes.forEach((note) => {
        const noteElement = createNoteElement(note);
        notesContainer.appendChild(noteElement);
      });
    });
  }

  // Function to create a note element with avatar
  function createNoteElement(note: UserNote): HTMLElement {
    const noteDiv = document.createElement('div');
    noteDiv.className = 'user-note';
    noteDiv.setAttribute('data-username', note.username);

    // Add avatar component
    const avatarDiv = createAvatarElement(note.username);
    noteDiv.appendChild(avatarDiv);

    // Add content component
    const contentDiv = createContentElement(note);
    noteDiv.appendChild(contentDiv);

    return noteDiv;
  }

  // Function to create avatar element
  function createAvatarElement(username: string): HTMLElement {
    const avatarDiv = document.createElement('div');
    avatarDiv.className = 'user-avatar';

    // Get Twitter avatar (handle both @ prefixed and non-prefixed usernames)
    const cleanUsername = username.replace(/^@/, '');
    const avatarImg = document.createElement('img');
    avatarImg.alt = username;
    // Use Twitter's API to get avatar
    avatarImg.src = `https://unavatar.io/twitter/${cleanUsername}`;
    avatarImg.onerror = function () {
      // Fallback if Twitter avatar can't be loaded
      avatarImg.src =
        'https://abs.twimg.com/sticky/default_profile_images/default_profile_400x400.png';
    };
    avatarDiv.appendChild(avatarImg);

    return avatarDiv;
  }

  // Function to create the content element (header + textarea)
  function createContentElement(note: UserNote): HTMLElement {
    const contentDiv = document.createElement('div');
    contentDiv.className = 'user-content';

    // Create header with username and actions
    const headerDiv = createHeaderElement(note.username);
    contentDiv.appendChild(headerDiv);

    // Get references to elements needed for event handlers
    const usernameSpan = headerDiv.querySelector('.username') as HTMLElement;
    const saveButton = headerDiv.querySelector(
      '.save-note'
    ) as HTMLButtonElement;
    const deleteButton = headerDiv.querySelector(
      '.delete-note'
    ) as HTMLButtonElement;

    // Create and set up textarea
    const textarea = createNoteTextarea(note.content);
    contentDiv.appendChild(textarea);

    // Set up event handlers
    setupTextareaEvents(textarea, saveButton);
    setupSaveButtonEvent(saveButton, textarea, note.key, usernameSpan);
    setupDeleteButtonEvent(deleteButton, note.username, note.key);

    return contentDiv;
  }

  // Function to create the header element with username and action buttons
  function createHeaderElement(username: string): HTMLElement {
    const headerDiv = document.createElement('div');
    headerDiv.className = 'user-header';

    // Username with link to profile
    const usernameSpan = document.createElement('div');
    usernameSpan.className = 'username';

    const cleanUsername = username.replace(/^@/, '');
    const usernameLink = document.createElement('a');
    usernameLink.href = `https://x.com/${cleanUsername}`;
    usernameLink.target = '_blank';
    usernameLink.textContent = username;
    usernameSpan.appendChild(usernameLink);
    headerDiv.appendChild(usernameSpan);

    // Actions buttons
    const actionsDiv = document.createElement('div');
    actionsDiv.className = 'note-actions';

    const saveButton = document.createElement('button');
    saveButton.className = 'save-note';
    saveButton.textContent = 'Save';
    saveButton.style.display = 'none'; // Initially hidden

    const deleteButton = document.createElement('button');
    deleteButton.className = 'delete-note';
    deleteButton.textContent = 'Delete';

    actionsDiv.appendChild(saveButton);
    actionsDiv.appendChild(deleteButton);
    headerDiv.appendChild(actionsDiv);

    return headerDiv;
  }

  // Function to create and configure the textarea
  function createNoteTextarea(content: string): HTMLTextAreaElement {
    const textarea = document.createElement('textarea');
    textarea.className = 'note-textarea';
    textarea.value = content;
    textarea.readOnly = true; // Initially read-only
    textarea.style.overflowY = 'hidden'; // Hide vertical scrollbar

    return textarea;
  }

  // Function to handle textarea resizing
  function resizeTextarea(textarea: HTMLTextAreaElement): void {
    textarea.style.height = 'auto';
    textarea.style.height = `${textarea.scrollHeight}px`;

    // Show scrollbar only if content exceeds max-height
    const computedStyle = window.getComputedStyle(textarea);
    const maxHeight = parseInt(computedStyle.maxHeight, 10);

    if (!isNaN(maxHeight) && textarea.scrollHeight > maxHeight) {
      textarea.style.overflowY = 'auto'; // Show scrollbar when needed
    } else {
      textarea.style.overflowY = 'hidden'; // Hide scrollbar
    }
  }

  // Function to set up textarea event listeners
  function setupTextareaEvents(
    textarea: HTMLTextAreaElement,
    saveButton: HTMLButtonElement
  ): void {
    // Add input event for auto-resizing
    textarea.addEventListener('input', () => {
      resizeTextarea(textarea);
    });

    // Initial resize
    setTimeout(() => resizeTextarea(textarea), 0);

    // Make textarea editable on click
    textarea.addEventListener('click', function () {
      if (textarea.readOnly) {
        textarea.readOnly = false;
        textarea.focus();
        saveButton.style.display = 'block';
        resizeTextarea(textarea);
      }
    });

    // Also resize on focus to ensure proper display
    textarea.addEventListener('focus', () => resizeTextarea(textarea));
  }

  // Function to handle the save button event
  function setupSaveButtonEvent(
    saveButton: HTMLButtonElement,
    textarea: HTMLTextAreaElement,
    storageKey: string,
    usernameSpan: HTMLElement
  ): void {
    saveButton.addEventListener('click', function () {
      const newContent = textarea.value;

      // Save to storage
      chrome.storage.sync.set({ [storageKey]: newContent }, function () {
        if (chrome.runtime.lastError) {
          alert(
            'Error saving note: ' +
              (chrome.runtime.lastError.message ?? 'Unknown error')
          );
          return;
        }

        // Update UI
        textarea.readOnly = true;
        saveButton.style.display = 'none';

        // Show success message
        showSaveConfirmation(usernameSpan);
      });
    });
  }

  // Function to show save confirmation
  function showSaveConfirmation(container: HTMLElement): void {
    const successMessage = document.createElement('span');
    successMessage.textContent = 'Saved!';
    successMessage.style.color = '#28a745';
    successMessage.style.marginLeft = '10px';
    container.appendChild(successMessage);

    // Remove success message after 3 seconds
    setTimeout(() => {
      container.removeChild(successMessage);
    }, 3000);
  }

  // Function to handle the delete button event
  function setupDeleteButtonEvent(
    deleteButton: HTMLButtonElement,
    username: string,
    storageKey: string
  ): void {
    deleteButton.addEventListener('click', function () {
      if (
        confirm(`Are you sure you want to delete the note for ${username}?`)
      ) {
        chrome.storage.sync.remove(storageKey, function () {
          if (chrome.runtime.lastError) {
            alert(
              'Error deleting note: ' +
                (chrome.runtime.lastError.message ?? 'Unknown error')
            );
            return;
          }

          // Remove from UI - find the parent .user-note element
          const userNoteElement = deleteButton.closest('.user-note');
          if (userNoteElement) {
            userNoteElement.remove();

            // Check if there are any notes left
            if (
              notesContainer &&
              notesContainer.querySelectorAll('.user-note').length === 0
            ) {
              setNotesContainerState('empty');
            }
          } else {
            console.error('Could not find .user-note element to remove');
          }
        });
      }
    });
  }

  // Populate the notes on page load
  loadAllUserNotes();

  // Populate the textarea on page load.
  populateBackupArea();
});
