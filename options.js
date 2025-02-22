document.addEventListener('DOMContentLoaded', function() {
  const backupArea = document.getElementById("backupArea");
  const downloadButton = document.getElementById("exportButton"); // Button title will be updated in HTML.
  const loadButton = document.getElementById("importButton");     // Button title will be updated in HTML.
  const importFile = document.getElementById("importFile");

  // Helper function to get backup data as a JSON string.
  function getBackupData(callback) {
    chrome.storage.sync.get(null, function(items) {
      if (chrome.runtime.lastError) {
        alert("Error retrieving data: " + chrome.runtime.lastError);
        return;
      }
      let data = {};
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
    getBackupData(function(dataStr) {
      backupArea.value = dataStr;
    });
  }

  // Download backup data as a file.
  function downloadBackup() {
    getBackupData(function(dataStr) {
      backupArea.value = dataStr;
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

  downloadButton.addEventListener("click", downloadBackup);

  loadButton.addEventListener("click", function() {
    importFile.click();
  });

  importFile.addEventListener("change", function() {
    const file = importFile.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function(evt) {
      try {
        const data = JSON.parse(evt.target.result);
        chrome.storage.sync.set(data, function() {
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
