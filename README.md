# X User Notes - Why Did I Block?

A simple browser extension for x.com (formerly Twitter) that helps you remember *why* you muted or blocked a user and allows you to keep private notes on user profiles, visible only to you.

## Why use this extension?

Have you ever come across a profile on x.com and thought, "Why did I mute/block this person?" or wished you could jot down a private reminder about a user? This extension solves that problem.

## Features

* **Automatically logging mute/block events:** When you mute or block a user, the extension saves a timestamp and the tweet you were viewing at the time, giving you context later.
* **Adding private notes fields:** A dedicated text area is added to user profile pages and hover cards where you can write personal notes about that user.
* **Keeping your data private:** All saved notes and mute/block logs are stored locally in your browser's storage and are not sent to any external server.
* **Data Export/Import:** Easily back up your notes and logs or transfer them between browsers.

## How to Use

* **Mute/Block Tracking:** Simply mute or block a user as you normally would on x.com. The extension will automatically capture the event and the relevant tweet context and save it. You can view these logs on the user's profile page in the notes section.
* **Adding Notes:**
  * **On a profile page:** Navigate to any user's profile. A text area labeled "Your notes for @username (visible only to you)" will appear below their join date/bio. Click into this area and start typing your notes. Your changes are saved automatically.
  * **On a hover card:** When you hover over a username to bring up the user's hover card, a text area will appear at the bottom of the card. You can add notes here as well. Notes added here will sync with the notes on the full profile page.
* **Export/Import Data:** Can be accessed on extension's "Options" page. You can export/import notes data in JSON format.

## Data Privacy

Your notes and mute/block logs are stored exclusively in your browser profile synced storage (`chrome.storage.sync`).

* Only you can see your notes.
* The data is synced between devices if you log in to the same browser profile

## License

* MIT
