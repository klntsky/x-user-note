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
- **Expected Outcome:** The notes are populated with the current backup data.
- **Scenario:** Click the export button.
- **Expected Outcome:** A file download is triggered, and the backup data is saved in the file.
- **Scenario:** Modify the backup file externally and click the import button.
- **Expected Outcome:** The notes update to reflect the imported backup data. Import should not delete any already existing profiles on options page.

## 6. Navigation and Page Reload After Mute/Block Actions

### After Mute

- **Scenario:** Mute a user on a tweet, then navigate to a different profile page and back to the muted user's profile page.
- **Expected Outcome:** The note associated with the muted user should persist and be visible on their profile and hover card.
- **Scenario:** Mute a user on a tweet, then reload the current page (e.g., the timeline or the user's profile).
- **Expected Outcome:** The note associated with the muted user should persist and be visible.

### After Block

- **Scenario:** Block a user on a tweet, then navigate to a different profile page and back to the (now inaccessible) blocked user's profile page.
- **Expected Outcome:** The note associated with the blocked user should persist internally, even if the profile page is not fully accessible. If a hover card can still be triggered (e.g., on a mention), the note should be visible there.
- **Scenario:** Block a user on a tweet, then reload the current page.
- **Expected Outcome:** The note associated with the blocked user should persist. Verify its presence if accessible (e.g., through hover cards on mentions if tweets are still visible, or by checking extension storage if direct UI verification is not possible).
