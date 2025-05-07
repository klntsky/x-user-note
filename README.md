# X User Notes - Why Did I Block?

A simple browser extension for x.com (formerly Twitter) that helps you remember *why* you muted or blocked a user and allows you to keep private notes on user profiles and hover cards, visible only to you.

## Why use this extension?

Have you ever come across a profile on x.com and thought, "Why did I mute/block this person?" or wished you could jot down a private reminder about a user? This extension solves that problem.

## Features

* **Automatically logging mute/block events:** When you mute or block a user, the extension saves a timestamp and the tweet you were viewing at the time, giving you context later.
* **Adding private notes fields:** A dedicated text area is added to user profile pages and hover cards where you can write personal notes about that user.
* **Keeping your data private:** All saved notes and mute/block logs are stored locally in your browser's storage and are not sent to any external server.
* **Data Export/Import:** Easily back up your notes and logs or transfer them between browsers.

## Installation

Since this is a custom browser extension, you'll need to install it manually in your browser's developer mode.

1. **Download the code:** Clone or download this repository to your computer.
2. **Open your browser's Extensions page:** Go to `chrome://extensions`
3. **Enable Developer Mode:** On the extensions page, toggle the "Developer mode" switch, usually located in the top right corner.
4. **Load the extension:** Click the "Load unpacked" button (usually in the top left).
5. **Select the extension folder:** Browse to the folder where you downloaded the extension code and select it.

**Firefox:**

* Firefox requires the extension to be packaged as a `.xpi` file for this method. Use `pack.sh` from this repository.

* Firefox Extended Support Release (ESR), Firefox Developer Edition and Nightly versions of Firefox will allow you to override the setting to enforce the extension signing requirement, by changing the preference `xpinstall.signatures.required` to `false` in the Firefox Configuration Editor (about:config page).

* Go to extensions `about:addons`, then click the gear icon and select "Install Add-on From File..."

The extension should now be installed and active.

## How to Use

* **Mute/Block Tracking:** Simply mute or block a user as you normally would on x.com. The extension will automatically capture the event and the relevant tweet context and save it. You can view these logs on the user's profile page in the notes section.
* **Adding Notes:**
  * **On a profile page:** Navigate to any user's profile. A text area labeled "Your notes for @username (visible only to you)" will appear below their join date/bio. Click into this area and start typing your notes. Your changes are saved automatically.
  * **On a hover card:** When you hover over a username to bring up the user's hover card, a text area will appear at the bottom of the card. You can add notes here as well. Notes added here will sync with the notes on the full profile page.
* **Export/Import Data:** Can be accessed on extension's "Options" page. You can export/import notes data in JSON format.

## Data Privacy

Your notes and mute/block logs are stored exclusively in your browser's local storage (`chrome.storage.sync`). This means:

* Only you can see your notes.
* The data does not leave your browser or computer.
  
Note: The extension treats your notes and logs as a single, unified collection for each user, shared across all x.com accounts logged into that specific *browser profile*. It does not separate data based on which of your x.com accounts was active at the time of saving or viewing.

## License

* MIT
