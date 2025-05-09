document.addEventListener('DOMContentLoaded', function () {
  const backupArea = document.getElementById("backupArea") as HTMLTextAreaElement | null;
  const downloadButton = document.getElementById("exportButton") as HTMLButtonElement | null;
  const loadButton = document.getElementById("importButton") as HTMLButtonElement | null;
  const importFile = document.getElementById("importFile") as HTMLInputElement | null;

  // Helper function to get backup data as a JSON string.
  function getBackupData(callback: (dataStr: string) => void) {
    chrome.storage.sync.get(null, function (items) {
      if (chrome.runtime.lastError) {
        alert("Error retrieving data: " + chrome.runtime.lastError);
        return;
      }
      let data: Record<string, string[] | boolean> = {};
      for (let key in items) {
        if (key.startsWith("muteBlockEvents-")) {
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
      const blob = new Blob([dataStr], { type: "application/json" });
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

  downloadButton?.addEventListener("click", downloadBackup);

  loadButton?.addEventListener("click", function () {
    importFile?.click();
  });
  importFile?.addEventListener("change", function () {
    const file = importFile?.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function (evt) {
      try {
        if (!evt.target) {
          throw new Error("File read failed: No data available");
        }
        const result = evt.target.result;
        if (typeof result !== 'string') {
          throw new Error("File read failed: Invalid data format");
        }
        const data = JSON.parse(result);
        chrome.storage.sync.set(data, function () {
          if (chrome.runtime.lastError) {
            alert("Import failed: " + chrome.runtime.lastError);
          } else {
            alert("Import successful!");
            populateBackupArea();
          }
        });
      } catch (e) {
        alert("Import failed: invalid file.");
      }
    };
    reader.readAsText(file);
  });

  // Populate the textarea on page load.
  populateBackupArea();
});
