# Manual Testing Scenarios

## 1. Mute/Block Action UI Feedback
- **Scenario:** Click the "Mute" or "Block" button on a tweet.
- **Expected Outcome:** The tweet’s URL and text (with the first "·" removed and trailing numbers stripped) are correctly captured and will be used for the note entry.

## 2. Profile Textarea Insertion and Behavior
- **Scenario:** Visit a user’s profile page.
- **Expected Outcome:** A notes textarea appears below the user description with the appropriate placeholder.
- **Scenario:** Type into the profile textarea.
- **Expected Outcome:** The textarea automatically resizes as you type and shows your notes.

## 3. Hover Card Text Field Behavior
- **Scenario:** Hover over a username to display the hover card.
- **Expected Outcome:** A fixed-height (120px) text field appears inside the hover card without causing the hover to disappear. The field should be scrollable if content exceeds 120px.
- **Scenario:** Click into the hover card text field.
- **Expected Outcome:** The hover card remains visible while you interact with the text field.

## 4. Synchronization of Notes Across UI Elements
- **Scenario:** Enter or modify a note in the profile textarea.
- **Expected Outcome:** When you open the hover card for the same user, the hover card text field shows the same note.
- **Scenario:** Update the note in one location and then verify it appears identically in the other location.
- **Expected Outcome:** Both the profile and hover card text fields display the same content.

## 5. Backup and Restore Functionality (Options Page)
- **Scenario:** Open the extension’s settings page.
- **Expected Outcome:** The backup textarea is populated with the current backup data.
- **Scenario:** Click the "Download backup to file" button.
- **Expected Outcome:** A file download is triggered, and the backup data is saved in the file.
- **Scenario:** Modify the backup file externally and click the "Load backup from file" button.
- **Expected Outcome:** The backup textarea updates to reflect the imported backup data.
