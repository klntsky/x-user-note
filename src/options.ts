document.addEventListener('DOMContentLoaded', function () {
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
  const githubButton = document.getElementById('githubButton');

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
        if (key.startsWith('muteBlockEvents-')) {
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
      a.download = 'muteBlockData.json';
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
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
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

        // Clear existing muteBlockEvents- data before importing
        chrome.storage.sync.get(null, function (allItems) {
          if (chrome.runtime.lastError) {
            alert(
              'Error retrieving existing data for clearing: ' +
                (chrome.runtime.lastError.message ?? 'Unknown error')
            );
            return;
          }

          const keysToRemove = Object.keys(allItems).filter((key) =>
            key.startsWith('muteBlockEvents-')
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

  // Populate the textarea on page load.
  populateBackupArea();

  // Event listener for the GitHub button
  if (githubButton) {
    githubButton.addEventListener('click', () => {
      window.open(
        'https://github.com/klntsky/x-user-note',
        '_blank',
        'noopener,noreferrer'
      );
    });
  }
});
