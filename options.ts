document.addEventListener('DOMContentLoaded', function() {
  const backupArea = document.getElementById("backupArea") as HTMLTextAreaElement | null;
  const downloadButton = document.getElementById("exportButton") as HTMLButtonElement | null;
  const loadButton = document.getElementById("importButton") as HTMLButtonElement | null;
  const importFile = document.getElementById("importFile") as HTMLInputElement | null;

  // Helper function to get backup data as a JSON string.
  function getBackupData(callback: (data: string) => void): void {
    chrome.storage.sync.get(null, (items: { [key: string]: any }) => {
      if (chrome.runtime.lastError) {
        alert("Error retrieving data: " + chrome.runtime.lastError.message);
        return;
      }
      let data: { [key: string]: any } = {};
      for (let key in items) {
        if (key.startsWith("muteBlockEvents-")) {
          data[key] = items[key];
        }
      }
      callback(JSON.stringify(data, null, 2));
    });
  }

  // Populate the backup textarea with the current backup data.
  function populateBackupArea(): void {
    getBackupData((dataStr: string) => {
      if (backupArea) {
        backupArea.value = dataStr;
      }
    });
  }

  // Download backup data as a file.
  function downloadBackup(): void {
    getBackupData((dataStr: string) => {
      if (backupArea) {
        backupArea.value = dataStr;
      }
      const blob = new Blob([dataStr], {type: "application/json"});
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "muteBlockData.json";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    });
  }

  if (downloadButton) {
    downloadButton.addEventListener("click", downloadBackup);
  }

  if (loadButton && importFile) {
    loadButton.addEventListener("click", function() {
      importFile.click();
    });

    importFile.addEventListener("change", function() {
      if (!importFile.files || importFile.files.length === 0) return;
      const file = importFile.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = function(evt: ProgressEvent<FileReader>) {
        if (!evt.target || typeof evt.target.result !== 'string') {
          alert("Import failed: could not read file contents.");
          return;
        }
        try {
          const data = JSON.parse(evt.target.result);
          chrome.storage.sync.set(data, function() {
            if (chrome.runtime.lastError) {
              alert("Import failed: " + chrome.runtime.lastError.message);
            } else {
              alert("Import successful!");
              populateBackupArea();
            }
          });
        } catch (e: any) {
          alert("Import failed: invalid file. " + e.message);
        }
      };
      reader.readAsText(file);
    });
  }

  // Populate the textarea on page load.
  populateBackupArea();
}); 