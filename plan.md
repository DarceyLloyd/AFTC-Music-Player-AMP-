# AFTC Music Player - Electron Application Plan

## Overview
A desktop music player built with Electron capable of playing MP3, FLAC, and WAV audio files with a clean, classic music player interface.

### Existing Reference Application
- There is an existing Electron application at: `W:\Dev\AI Gateway`
- It is a useful implementation guide for Electron app structure and packaging, but it does **not** fully meet this music player's requirements
- Minimize to notification tray is expected to be reusable from that project/build history
- Use it as a pattern source, not as a direct copy base
- If required non-code assets (for example icon image files) are missing or cannot be generated in this repository, copy placeholder versions from `W:\Dev\AI Gateway` and replace/refine them later.

### Build and Dependency Workflow Preference
- Use `npm run dev` for local validation and watch the console during test runs.
- `npm run build` must default to Windows packaging.
- Keep additional platform scripts available: `npm run build:mac` and `npm run build:linux`.
- Keep `npm run verify:trash-helper` available to validate packaged Windows trash helper binaries after build.
- If warnings come from direct dependencies in `package.json` being deprecated/outdated, prefer upgrading to latest stable versions and re-validate compile/build behavior.

### Interactive Debug Workflow (Copilot + User)
- Copilot runs `npm run dev` (preferred) or `npm run start` to launch the app for interactive debugging.
- User operates the application UI and reproduces issues, then reports observed behavior back in chat.
- Copilot continuously monitors terminal output for startup/runtime errors while the user is testing.
- User may close/exit the app at any time using either GUI controls or terminal interruption; this is expected behavior during debug loops.
- After each repro cycle, Copilot summarizes console findings and applies focused fixes before the next run.

### Documentation Maintenance Requirement
- Keep this plan and `.github/copilot-instructions.md` synchronized whenever project behavior, scripts, dependencies, build targets, security policy, or UX contracts change.
- If implementation diverges from this plan, update the plan in the same change set so future work uses current decisions.
- Treat documentation updates as required project work, not optional cleanup.

### Relevant Findings From AI Gateway Source Review
- Main process architecture is centralized in `main.js` with explicit menu construction and window lifecycle hooks
- Dynamic menu/template generation from configuration data is used and can inform flexible menu design for this player
- User feedback via native dialogs is used for update checks and errors; this aligns with this project's error-alert requirement
- Context menu handling and shell URL policies are implemented and provide examples for controlled navigation behavior
- Build pipeline already uses Electron Builder for Windows packaging (NSIS target), which is relevant to this project's packaging flow

### AI Gateway Patterns To Reuse
- Explicit app menu template construction and assignment in main process
- Strong user-notification flow via native dialog boxes for failures and status
- Clear startup flow (`app.whenReady` -> create window -> attach handlers)
- Windows packaging conventions (appId/productName/build targets)

### AI Gateway Patterns To Avoid Copying
- `contextIsolation: false` should not be used in this project (must remain true)
- `webviewTag: true` should be avoided unless a hard requirement emerges
- Broad renderer privileges should be replaced by a strict preload IPC allowlist

### Reference Scope Notes
- No top-level `src` directory was found in `W:\Dev\AI Gateway` at review time; implementation is primarily rooted in main entry files
- If tray/minimize behavior source is in another branch/folder/artifact, import that logic pattern only after security-hardening it for this project

### Minimize-To-Tray Migration Checklist (From Existing App Pattern)
- [ ] Locate the exact tray implementation source (current branch, historical branch/tag, or packaged build source archive)
- [ ] Extract only tray/window lifecycle logic (do not copy unrelated webview/navigation logic)
- [ ] Keep single tray instance guarantees (`if (!tray) tray = createTray(...)`)
- [ ] Ensure minimize action hides to tray and tray click restores/focuses the main window
- [ ] Ensure close action fully exits app (unless future setting says otherwise)
- [ ] Add tray context menu actions: Stop and Exit
- [ ] Add `before-quit` guard flag so close/minimize handlers do not block intentional quit
- [ ] Verify no duplicate tray icons across repeated minimize/restore cycles
- [ ] Verify behavior matches Windows user expectations (minimize, restore, exit, taskbar state)
- [ ] Add manual QA script for tray behavior before release

### Additional Scan Outcome (AI Gateway)
- Confirmed relevant root files: `main.js`, `preload.js`, `init.js`, `package.json`
- Confirmed packaging baseline is usable (`electron-builder`, NSIS, Windows icon config)
- Did **not** find tray/minimize implementation in currently readable root sources; expected tray logic is likely in another branch/history/artifact
- Because of that, tray migration should proceed using the checklist above plus revalidation against this project's security policy

---

## Technology Stack

### Core Technologies
- **Electron**: Latest version (2026)
- **Node.js**: LTS version (latest version 2026)
- **HTML5/CSS3**: For the GUI
- **JavaScript**: For application logic

### Runtime and Module Strategy (2026 Best Practice)
- Use **ESM-first** project configuration (`"type": "module"`) for compatibility with modern Electron ecosystem packages
- Keep **main process and preload lean**, with all privileged actions behind explicit IPC contracts
- Use **async/non-blocking APIs** in all I/O paths (scan, metadata reads, persistence)
- Code samples in this document follow ESM style to match the runtime strategy

### Key Dependencies
- **electron**: Main framework
- **trash**: For moving files to recycle bin instead of permanent delete
- **music-metadata**: For reading audio file metadata (ID3 tags, FLAC metadata, WAV info)
- **electron-store**: For persistent storage (volume, playlist)

### Audio Playback
Electron's `<audio>` element will be used. It supports:
- MP3 (MPEG Audio)
- WAV (PCM)
- FLAC (Free Lossless Audio Codec) - Native support in Chromium 96+ (Electron 17+)

**Playback Compatibility Policy:**
- If a file fails to decode/play, show a user-facing error alert with filename and reason
- Track unsupported/failed files during scan/load and show a post-import summary dialog
- If a supported extension fails (mp3, wav, flac), classify failure as codec/container/decode issue and present actionable guidance
- Add optional fallback strategy planning for decode failures (transcoding path), but keep it disabled unless explicitly enabled by user

**Format Scope Decision:**
- Current target formats remain: MP3, WAV, FLAC
- MP4 is intentionally out of scope for now to reduce complexity and avoid new codec edge cases

**FFmpeg Guidance (Optional):**
- FFmpeg is not required for baseline MP3/WAV/FLAC playback in Electron
- FFmpeg becomes useful only if you want automatic fallback transcoding for unsupported or problematic files
- If FFmpeg is added later, treat it as an optional advanced feature with explicit user opt-in, clear failure reporting, and packaging/licensing review

---

## GUI Layout (Updated)

```
┌──────────────────────────────────────────────────────────────────────┐
│  File  Edit  View  Help                    [─] [□] [×]              │
├──────────────────────────────────────────────────────────────────────┤
│                                                                      │
│                      ROW 1: TRACK LIST (~70% height)                 │
│                    ┌────────────────────────────┐                    │
│                    │ 1.  Artist - TrackName.mp3    │ [▶]    [X]       │
│                    │    ├─ Artist: Artist Name    │ [▼]               │
│                   │    ├─ Album: Album Name      │                   │
│                   │    ├─ Duration: 3:45         │                   │
│                   │    ├─ Bitrate: 320kbps       │                   │
│                   │    └─ Year: 2024             │                   │
│                   │ 2.  AnotherTrack.flac      │ [X]               │
│                   │ 3.  Song.wav               │ [X]               │
│                   │         ...                │                    │
│                   │        ▼                   │                    │
│                   └────────────────────────────┘                    │
│                                                                      │
├──────────────────────────────────────────────────────────────────────┤
│                   ROW 2: NOW PLAYING INFO                            │
│                   ♪ Now Playing: Artist - TrackName.mp3              │
├──────────────────────────────────────────────────────────────────────┤
│                   ROW 3: PROGRESS BAR / SEEK                         │
│                   0:00 ────●──────────────────── 3:45                 │
│                           0:45 (current time)                         │
├──────────────────────────────────────────────────────────────────────┤
│                   ROW 4: CONTROL BUTTONS                             │
│                                                                      │
│         [◀◀ Prev] [▶ Play/Pause] [■ Stop] [▶▶ Next]    [📁 Open]    │
│              (center aligned)                         (right)        │
├──────────────────────────────────────────────────────────────────────┤
│                   ROW 5: VOLUME SLIDER                               │
│                                                                      │
│   🔈 ─────────────●────────────────── 🔊                           │
│   (Volume slider - full width with padding, 0-100%)                 │
│                                                                      │
└──────────────────────────────────────────────────────────────────────┘
```

### Professional UI Direction (Desktop-First)

**Visual Goals:**
- Clean, professional, modern desktop look (not toy-like, not overly flashy)
- Strong readability for long listening sessions
- Clear visual hierarchy between playlist, transport controls, and playback status

**Typography:**
- Primary UI font: `Segoe UI Variable`, fallback `Segoe UI`, `Tahoma`, sans-serif
- Title/primary labels: semibold
- Secondary metadata: regular, reduced contrast
- Monospaced time labels (optional): `Cascadia Mono` fallback for stable timer width

**Spacing and Rhythm:**
- Base spacing unit: `8px`
- Row/container padding: `12px` to `16px`
- Control cluster gaps: `8px`
- Expand/collapse and delete action gap: `10px` to `12px` minimum to prevent accidental clicks

**Color and Surface System:**
- Neutral base surfaces with subtle elevation differences between rows
- Accent color reserved for active states (playing/progress/focus)
- Error/destructive color used only for delete and file failure alerts
- Maintain minimum contrast ratio for readability (target WCAG AA)

**List Row Behavior (Professional Desktop Pattern):**
- Track left content uses `overflow: hidden`, `text-overflow: ellipsis`, `white-space: nowrap`
- Right action area uses fixed width and does not shrink
- Hover state is subtle; selected and playing states are clearly distinct
- Keyboard focus ring must be visible and consistent across interactive controls

**Motion and Interaction:**
- Keep motion subtle (150-220ms transitions)
- Progress updates smooth but efficient (avoid heavy repaint loops)
- Button states: default, hover, active, disabled all visually distinct

**Desktop QA Visual Checklist:**
- No clipped controls at 75% default window size
- No overlap between long filenames and action buttons
- All controls remain legible and clickable at 125% and 150% display scaling
- Time labels remain stable (no layout jump) while playback updates

---

## Detailed Component Specifications

### Row 1: Track List (~70% height - adjusted for new rows)

**Features:**
- Scrollable list of tracks
- Tracks ordered alphabetically by filename (ascending: A-Z)
- First track automatically highlighted/selected on load
- Each row contains:
  - **Left side**: Track number + File name
  - **Right side**: Expand/collapse triangle [▶]/[▼] + X button (remove/delete action)
- Long text in the left content area must be clipped with overflow hidden to prevent overlap with action buttons
- Keep right-side action area fixed-width so text clipping never collides with expand/collapse or delete controls
- Add small spacing between expand/collapse and delete controls to reduce accidental clicks

**Track Row States:**
- **Normal**: Default appearance
- **Selected**: Highlighted (different background color)
- **Playing**: Now playing indicator (e.g., music note icon ♪ or speaker icon 🔊)
- **Selected + Playing**: Combined visual treatment

**Expandable Metadata Row:**
```
Collapsed: 1. Artist - TrackName.mp3              [▶]    [X]
Expanded:  1. Artist - TrackName.mp3              [▼]    [X]
              ├─ Artist: Artist Name
              ├─ Album: Album Name
              ├─ Title: Track Title
              ├─ Duration: 3:45
              ├─ Bitrate: 320kbps
              ├─ Sample Rate: 44.1kHz
              ├─ Year: 2024
              └─ Format: MP3
```

**X Button Modal:**
```
┌─────────────────────────────────┐
│  Remove Track                   │
│                                 │
│  What would you like to do?     │
│                                 │
│  [Remove from List]  [Delete]   │
│           [Cancel]              │
└─────────────────────────────────┘
```
- **Remove from List**: Removes track from playlist only
- **Delete File**: Opens confirmation modal (`OK` / `Cancel`), then moves file to system recycle bin (using `trash` npm package) only if confirmed
- **Cancel**: Closes modal with no action

---

### Row 2: Now Playing Info

**Features:**
- Displays currently playing track information
- Format: `♪ Now Playing: Artist - TrackName.mp3`
- Center aligned text
- Subtle styling (smaller font, muted color or accent color)
- Updates automatically when track changes

---

### Row 3: Progress Bar / Seek

**Features:**
- Full width slider with padding
- **Left side**: Start time anchor (always `0:00`)
- **Center**: Draggable progress slider
- **Right side**: Total track duration (e.g., `3:45`)
- **Under slider (centered)**: Current playback time (e.g., `0:45`)
- Clickable/draggable to seek to any position
- Visual progress fill showing playback position

**Time Format:**
- Under 1 hour: `M:SS` (e.g., 3:45)
- Over 1 hour: `H:MM:SS` (e.g., 1:23:45)

**Row 3 Display Rules:**
- Left label remains fixed at `0:00`
- Right label remains fixed to loaded track duration
- Center-below value updates continuously during playback and while seeking

---

### Row 4: Control Buttons

**Layout:**
- Center aligned: Previous, Play/Pause, Stop, Next
- Right aligned: Open Folder

**Button Styles:**
- Classic music player aesthetic
- Clear icons with hover effects
- Consistent sizing
- Visual feedback on click

**Button Specifications:**

| Button | Icon | Behavior |
|--------|------|----------|
| **Previous (◀◀)** | Skip backward | If playing: Play previous track from start<br>If not playing: Move selection up one track<br>Cannot go above track 1 |
| **Play/Pause (▶/⏸)** | Play/Pause toggle | Plays the currently highlighted/selected track<br>If playing: Pauses playback<br>If paused: Resumes playback |
| **Stop (■)** | Stop | First click: Stops playback at current position<br>Second click: Rewinds to start of track |
| **Next (▶▶)** | Skip forward | If playing: Play next track<br>If not playing: Move selection down one track<br>At bottom: Does nothing (continues playing if already playing) |
| **Open Folder (📁)** | Folder icon | Opens native folder picker dialog, clears current playlist, loads new files |

---

### Row 5: Volume Slider

**Features:**
- Full width with padding (10-15px from edges)
- Range: 0% to 100%
- Dynamic volume icon based on level:
  - 0%: 🔇 (muted)
  - 1-33%: 🔈 (low)
  - 34-66%: 🔉 (medium)
  - 67-100%: 🔊 (high)
- **State Persistence**: Volume level saved automatically
- Restored on app reopen

---

## Menu Bar

**File Menu:**
- Open Folder... (opens folder picker)
- Clear Playlist (clears all tracks from list)
- Exit (quits application)

**Edit Menu:**
- (Reserved for future use)

**View Menu:**
- (Reserved for future use)

**Help Menu:**
- About AFTC Music Player
- Keyboard Shortcuts

---

## Additional Features

### 1. Drag & Drop Support

**Folder Drop:**
- Entire application window accepts folder drag and drop
- Visual feedback when dragging over window (border highlight)
- On drop: Scans folder recursively for audio files
- Clears existing playlist, loads new files
- Enforce safe-folder policy (user-chosen/drop-originated paths only; reject protected OS/system directories)

**File Drop:**
- Accepts single or multiple file drops
- Supported formats: `.mp3`, `.wav`, `.flac`
- Clears existing playlist, loads dropped files
- Files sorted alphabetically by filename
- Unsupported files are skipped and reported in a summary alert

### 2. System Tray

**Minimize Behavior:**
- Clicking minimize button [─]: Window hides, app continues in system tray
- Tray icon shows application status

**Tray Icon Right-Click Menu:**
```
┌─────────────────┐
│ Stop            │
│ Exit            │
└─────────────────┘
```
- **Stop**: Stops current playback
- **Exit**: Completely quits the application

**Tray Icon Click:**
- Single click: Restores window

### 3. Close Button Behavior

- Clicking close button [×]: Completely quits the application (not minimize to tray)

---

## Data Persistence

### Using electron-store

```javascript
import fs from 'node:fs/promises';
import Store from 'electron-store';
const store = new Store();

// Default configuration
const defaultConfig = {
  volume: 75,
  playlist: [],
  lastFolder: null
};

// Save volume
store.set('volume', volumeLevel);

// Save playlist
store.set('playlist', playlistTracks);

// Load on startup
const savedVolume = store.get('volume', 75);
const savedPlaylist = store.get('playlist', []);

// Validate persisted playlist paths on startup (non-blocking)
async function validatePlaylistPaths(playlist) {
  const checks = playlist.map(async (track) => {
    try {
      if (!track?.path) return null;
      await fs.access(track.path);
      return track;
    } catch {
      return null;
    }
  });

  const resolved = await Promise.all(checks);
  return resolved.filter(Boolean);
}

const validPlaylist = await validatePlaylistPaths(savedPlaylist);

if (validPlaylist.length !== savedPlaylist.length) {
  store.set('playlist', validPlaylist);
  // Show non-blocking alert/toast: some missing files were removed from playlist
}
```

### Persisted Data:
- Volume level (0-100)
- Playlist (array of file paths)
- Window position/size (stored and restored)
- Last known invalid/missing file cleanup summary (optional)

### Window State and Display Rules

- Default window width on first run: `primaryDisplayWorkAreaWidth * 0.75`
- Default window height on first run: `primaryDisplayWorkAreaHeight * 0.75`
- On resize/move/close: persist latest window bounds (x, y, width, height)
- On next open: restore persisted bounds only if display resolution and scale context match prior launch
- If display resolution (or effective display context) changes between launches:
  - Recompute initial size using 75% width/height rule
  - Clear stored window position and size state
  - Open centered using the recomputed size
- If stored bounds are off-screen (for example monitor removed), clear bounds and open centered with 75% sizing

---

## File Structure

```
aftc-music-player/
├── package.json
├── main.js                    # Main Electron process
├── preload.js                 # Preload script for IPC
├── src/
│   ├── index.html             # Main window HTML
│   ├── styles/
│   │   └── main.css           # Application styles
│   ├── renderer.js            # Renderer process logic
│   ├── player.js              # Audio player class
│   ├── playlist.js            # Playlist management
│   └── assets/
│       ├── icons/
│       │   ├── play.svg
│       │   ├── pause.svg
│       │   ├── stop.svg
│       │   ├── next.svg
│       │   ├── prev.svg
│       │   ├── folder.svg
│       │   ├── tray-icon.png
│       │   └── icon.ico
│       └── sounds/            # Optional UI sounds
└── utils/
    ├── fileScanner.js         # Recursive file scanning
    ├── metadataReader.js      # Audio metadata extraction
    └── tray.js                # System tray creation and lifecycle
```

---

## Implementation Steps

### Phase 1: Project Setup
- [ ] Initialize npm project with `npm init`
- [ ] Install Electron and dependencies (stable, actively maintained versions)
- [ ] Create basic file structure
- [ ] Set up main.js with BrowserWindow
- [ ] Create preload.js for secure IPC
- [ ] Set up electron-store for persistence
- [ ] Configure ESM (`"type": "module"`) and lockfile

### Phase 2: GUI Structure
- [ ] Create HTML layout with 5 rows
- [ ] Define design tokens (colors, spacing, typography, radius, shadows)
- [ ] Style track list with CSS
- [ ] Style control buttons with icons
- [ ] Style progress bar/seek slider
- [ ] Style volume slider
- [ ] Add now playing info row
- [ ] Create modal component for remove/delete
- [ ] Implement desktop accessibility states (hover/focus/disabled/active)
- [ ] Validate visual quality on standard Windows scaling levels (100/125/150%)

### Phase 3: Core Audio Functionality
- [ ] Implement AudioPlayer class
- [ ] Play/Pause/Stop functionality
- [ ] Next/Previous track navigation
- [ ] Volume control
- [ ] Progress tracking and seeking
- [ ] Time display updates
- [ ] Add playback failure handling with user alerts and retry-safe state transitions
- [ ] Classify decode failures and show actionable error messages (unsupported codec, corrupt file, access issue)

### Phase 4: Playlist Management
- [ ] Implement folder scanning (recursive, async/non-blocking)
- [ ] Implement file drag and drop
- [ ] Implement folder drag and drop
- [ ] Alphabetical sorting by filename
- [ ] Track selection and highlighting
- [ ] Double-click to play
- [ ] Remove from list functionality
- [ ] Delete to recycle bin functionality with explicit confirmation modal (OK/Cancel)
- [ ] Playlist persistence
- [ ] Startup validation and cleanup of invalid/missing playlist paths
- [ ] Safe-folder policy checks (reject protected OS/system directories)

### Phase 5: Metadata
- [ ] Install and configure music-metadata
- [ ] Extract metadata from MP3 (ID3)
- [ ] Extract metadata from FLAC
- [ ] Extract metadata from WAV
- [ ] Display metadata in expandable rows
- [ ] Handle files without metadata gracefully
- [ ] Run metadata extraction with concurrency limits to avoid UI jank

### Phase 6: System Integration
- [ ] Create system tray icon
- [ ] Implement minimize to tray with single tray instance lifecycle
- [ ] Implement tray menu (Stop, Exit)
- [ ] Implement close button = quit
- [ ] Create application menu (File, Edit, View, Help)
- [ ] Ensure native-feeling Windows behavior for minimize/restore/focus/quit
- [ ] Implement window state persistence (size/position) with display-change invalidation logic

### Phase 7: Polish & Testing
- [ ] Add loading states
- [ ] Add visual feedback/animations
- [ ] Error handling for corrupt files
- [ ] Error handling for missing files
- [ ] Keyboard shortcuts
- [ ] Testing on Windows
- [ ] Final styling adjustments
- [ ] Security validation (CSP, IPC allowlist, path policy)
- [ ] Professional UI pass (consistency, spacing, visual hierarchy, typography)
- [ ] Decide and document whether optional FFmpeg fallback mode is enabled (default off)

---

## Technical Implementation Details

### Audio Player Class

```javascript
import { pathToFileURL } from 'node:url';

class AudioPlayer {
  constructor() {
    this.audio = new Audio();
    this.playlist = [];
    this.currentIndex = 0;
    this.isPlaying = false;
    this.isPaused = false;
    
    // Event listeners
    this.audio.addEventListener('timeupdate', () => this.updateProgress());
    this.audio.addEventListener('ended', () => this.next());
    this.audio.addEventListener('loadedmetadata', () => this.updateDuration());
  }

  loadTrack(filePath) {
    // Use proper file URL conversion for Windows-safe and encoded paths
    this.audio.src = pathToFileURL(filePath).href;
  }

  play(index = null) {
    if (index !== null) {
      this.currentIndex = index;
      this.loadTrack(this.playlist[index].path);
    }
    this.audio.play()
      .then(() => {
        this.isPlaying = true;
        this.isPaused = false;
      })
      .catch((err) => {
        this.isPlaying = false;
        this.isPaused = false;
        // Show user alert with actionable message
        this.onError?.(`Unable to play file: ${err.message}`);
      });
  }

  pause() {
    this.audio.pause();
    this.isPlaying = false;
    this.isPaused = true;
  }

  stop() {
    if (this.isPaused || !this.isPlaying) {
      // Second click or not playing - rewind
      this.audio.currentTime = 0;
      this.isPlaying = false;
      this.isPaused = false;
    } else {
      // First click - stop at position
      this.audio.pause();
      this.isPaused = true;
      this.isPlaying = false;
    }
  }

  next() {
    if (this.currentIndex < this.playlist.length - 1) {
      this.play(this.currentIndex + 1);
    }
    // If at last track and playing, do nothing (continue playing)
  }

  previous() {
    if (this.currentIndex > 0) {
      this.play(this.currentIndex - 1);
    }
  }

  seek(time) {
    this.audio.currentTime = time;
  }

  setVolume(level) {
    this.audio.volume = level / 100;
  }

  updateProgress() {
    const elapsed = this.audio.currentTime;
    const duration = this.audio.duration;
    // Emit event or callback for UI update
  }
}
```

### File Scanner

```javascript
import fs from 'node:fs/promises';
import path from 'node:path';

async function scanFolder(folderPath) {
  const files = [];
  const extensions = ['.mp3', '.wav', '.flac'];
  
  async function scan(dir) {
    try {
      const items = await fs.readdir(dir);
      for (const item of items) {
        const fullPath = path.join(dir, item);
        const stat = await fs.stat(fullPath);
        if (stat.isDirectory()) {
          await scan(fullPath);
        } else if (extensions.includes(path.extname(item).toLowerCase())) {
          files.push({
            name: item,
            path: fullPath,
            ext: path.extname(item).toLowerCase()
          });
        }
      }
    } catch (err) {
      console.error(`Error scanning ${dir}:`, err);
    }
  }
  
  await scan(folderPath);
  
  // Sort alphabetically by filename (ascending A-Z)
  return files.sort((a, b) => a.name.localeCompare(b.name, undefined, { 
    numeric: true, 
    sensitivity: 'base' 
  }));
}
```

### Metadata Reader

```javascript
import musicMetadata from 'music-metadata';
import path from 'node:path';

async function getMetadata(filePath) {
  try {
    const metadata = await musicMetadata.parseFile(filePath);
    return {
      artist: metadata.common.artist || 'Unknown Artist',
      album: metadata.common.album || 'Unknown Album',
      title: metadata.common.title || path.basename(filePath),
      year: metadata.common.year || '',
      duration: formatTime(metadata.format.duration),
      bitrate: metadata.format.bitrate ? `${Math.round(metadata.format.bitrate / 1000)}kbps` : '',
      sampleRate: metadata.format.sampleRate ? `${(metadata.format.sampleRate / 1000).toFixed(1)}kHz` : '',
      format: path.extname(filePath).toUpperCase().replace('.', '')
    };
  } catch (err) {
    console.error('Error reading metadata:', err);
    return null;
  }
}

function formatTime(seconds) {
  if (!seconds) return '0:00';
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  
  if (hrs > 0) {
    return `${hrs}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}
```

### System Tray Setup

```javascript
import { app, Tray, Menu, nativeImage } from 'electron';
import path from 'node:path';

let tray = null;

function createTray(mainWindow) {
  const iconPath = path.join(__dirname, 'src/assets/icons/tray-icon.png');
  const trayIcon = nativeImage.createFromPath(iconPath);
  
  tray = new Tray(trayIcon.resize({ width: 16, height: 16 }));
  
  const contextMenu = Menu.buildFromTemplate([
    { 
      label: 'Stop', 
      click: () => mainWindow.webContents.send('control', 'stop')
    },
    { type: 'separator' },
    { 
      label: 'Exit', 
      click: () => {
        mainWindow.destroy();
        app.quit();
      }
    }
  ]);
  
  tray.setToolTip('AFTC Music Player');
  tray.setContextMenu(contextMenu);
  
  tray.on('click', () => {
    mainWindow.show();
    mainWindow.focus();
  });

  return tray;
}

export { createTray };
```

### Main Process (main.js)

```javascript
import { app, BrowserWindow, ipcMain, dialog, Menu, screen } from 'electron';
import path from 'node:path';
import Store from 'electron-store';
import { scanFolder } from './utils/fileScanner.js';
import { createTray } from './utils/tray.js';

const store = new Store();
let mainWindow;
let tray;
let isQuitting = false;

function getDisplayFingerprint(display) {
  // Keep a compact signature to detect display environment changes between runs.
  return {
    width: display.size.width,
    height: display.size.height,
    scaleFactor: display.scaleFactor
  };
}

function getInitialWindowBounds() {
  const primaryDisplay = screen.getPrimaryDisplay();
  const workArea = primaryDisplay.workAreaSize;

  const defaultWidth = Math.floor(workArea.width * 0.75);
  const defaultHeight = Math.floor(workArea.height * 0.75);

  const savedBounds = store.get('windowBounds');
  const savedDisplay = store.get('windowDisplay');
  const currentDisplay = getDisplayFingerprint(primaryDisplay);

  const displayChanged =
    !savedDisplay ||
    savedDisplay.width !== currentDisplay.width ||
    savedDisplay.height !== currentDisplay.height ||
    savedDisplay.scaleFactor !== currentDisplay.scaleFactor;

  if (displayChanged) {
    store.delete('windowBounds');
    store.set('windowDisplay', currentDisplay);
    return { width: defaultWidth, height: defaultHeight, center: true };
  }

  if (savedBounds && Number.isFinite(savedBounds.width) && Number.isFinite(savedBounds.height)) {
    const displays = screen.getAllDisplays();
    const isVisibleOnAnyDisplay = displays.some((display) => {
      const area = display.workArea;
      return (
        savedBounds.x + savedBounds.width > area.x &&
        savedBounds.x < area.x + area.width &&
        savedBounds.y + savedBounds.height > area.y &&
        savedBounds.y < area.y + area.height
      );
    });

    if (isVisibleOnAnyDisplay) {
      return { ...savedBounds, center: false };
    }

    store.delete('windowBounds');
    return { width: defaultWidth, height: defaultHeight, center: true };
  }

  return { width: defaultWidth, height: defaultHeight, center: true };
}

function createWindow() {
  const initialBounds = getInitialWindowBounds();

  mainWindow = new BrowserWindow({
    width: initialBounds.width,
    height: initialBounds.height,
    x: initialBounds.center ? undefined : initialBounds.x,
    y: initialBounds.center ? undefined : initialBounds.y,
    center: initialBounds.center,
    minWidth: 400,
    minHeight: 300,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  const persistBounds = () => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    store.set('windowBounds', mainWindow.getBounds());
  };

  mainWindow.on('resize', persistBounds);
  mainWindow.on('move', persistBounds);
  mainWindow.on('close', persistBounds);
  
  mainWindow.loadFile('src/index.html');
  
  // Create tray on minimize
  mainWindow.on('minimize', (event) => {
    event.preventDefault();
    mainWindow.hide();
    if (!tray) tray = createTray(mainWindow);
  });
  
  // Close = Quit (not minimize to tray)
  mainWindow.on('close', (event) => {
    if (!isQuitting) {
      isQuitting = true;
      event.preventDefault();
      app.quit();
    }
  });

  // Build and apply application menu
  const menu = Menu.buildFromTemplate([
    {
      label: 'File',
      submenu: [
        { label: 'Open Folder...', click: () => mainWindow.webContents.send('menu-open-folder') },
        { label: 'Clear Playlist', click: () => mainWindow.webContents.send('menu-clear-playlist') },
        { type: 'separator' },
        { role: 'quit' }
      ]
    },
    { label: 'Edit', submenu: [] },
    { label: 'View', submenu: [] },
    {
      label: 'Help',
      submenu: [
        { label: 'Keyboard Shortcuts', click: () => mainWindow.webContents.send('menu-shortcuts') },
        { label: 'About AFTC Music Player', click: () => mainWindow.webContents.send('menu-about') }
      ]
    }
  ]);
  Menu.setApplicationMenu(menu);
}

// IPC Handlers
ipcMain.handle('select-folder', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory']
  });
  
  if (!result.canceled && result.filePaths.length > 0) {
    const files = await scanFolder(result.filePaths[0]);
    return { folder: result.filePaths[0], files };
  }
  return null;
});

ipcMain.handle('get-saved-volume', () => {
  return store.get('volume', 75);
});

ipcMain.handle('save-volume', (event, volume) => {
  store.set('volume', volume);
});

ipcMain.handle('get-saved-playlist', () => {
  return store.get('playlist', []);
});

ipcMain.handle('save-playlist', (event, playlist) => {
  store.set('playlist', playlist);
});

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
  isQuitting = true;
});
```

---

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| Space | Play/Pause |
| Left Arrow | Seek backward 5 seconds |
| Right Arrow | Seek forward 5 seconds |
| Up Arrow | Previous track (when not playing) |
| Down Arrow | Next track (when not playing) |
| Delete | Remove selected track from list |
| Ctrl+O | Open folder |
| Ctrl+Q | Quit application |

---

## Dependencies (package.json)

```json
{
  "name": "aftc-music-player",
  "version": "1.0.0",
  "description": "A desktop music player built with Electron",
  "main": "main.js",
  "scripts": {
    "start": "electron .",
    "dev": "electron .",
    "build": "electron-builder --win",
    "build:win": "electron-builder --win",
    "build:mac": "electron-builder --mac",
    "build:linux": "electron-builder --linux",
    "verify:trash-helper": "node scripts/verify-trash-helper.mjs",
    "build:verify": "npm run build && npm run verify:trash-helper"
  },
  "type": "module",
  "dependencies": {
    "electron-store": "^11.0.2",
    "music-metadata": "^11.9.0",
    "trash": "^10.0.0"
  },
  "devDependencies": {
    "electron": "^41.0.3",
    "electron-builder": "^26.8.1"
  },
  "build": {
    "appId": "com.aftc.musicplayer",
    "productName": "AFTC Music Player",
    "win": {
      "target": "nsis",
      "icon": "src/assets/icons/icon.ico"
    },
    "mac": {
      "icon": "src/assets/icons/Icon-256.png"
    },
    "linux": {
      "icon": "src/assets/icons/Icon-256.png"
    }
  }
}
```

**Dependency Policy (recommended):**
- Use latest stable major versions at project creation time and commit lockfile
- Validate package module format compatibility (ESM/CJS) before freezing versions
- Avoid unmaintained plugins; prioritize official Electron APIs and actively maintained packages

---

## Security and File Access Policy

- Renderer process must never directly read/write filesystem paths
- Files/folders can only enter the app via explicit user action (Open Folder dialog or drag-and-drop)
- Reject known protected OS/system directories from scan targets
- Preload exposes minimal, allowlisted IPC methods only
- Add strict Content Security Policy in renderer HTML
- All file operations occur in main process with validated paths and structured error responses
- Any unhandled exception must surface to user as an alert/toast with clear recovery steps

---

## Final Decisions Summary

| Feature | Decision |
|---------|----------|
| Initial track selection | First track highlighted (alphabetical order A-Z) |
| Double-click behavior | Plays the clicked track |
| Now playing indicator | Yes, separate row above progress bar |
| Progress bar with seek | Yes, with fixed left `0:00`, fixed right duration, and centered current time below slider |
| Playlist persistence | Yes, saved between sessions |
| Close button | Quits application completely |
| Minimize button | Minimizes to system tray |
| Open folder behavior | Clears current playlist, loads new |
| Drag-drop support | Folders AND individual files |
| Metadata display | Expandable rows with triangle toggle |
| Tray right-click menu | Stop and Exit only |
| Format scope (v1) | MP3, WAV, FLAC only (MP4 out of scope) |

---

*Document updated: March 2026*
*Electron version target: v33.x (latest stable)*
*Target platform: Windows 11*
