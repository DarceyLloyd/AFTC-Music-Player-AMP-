# AFTC Music Player

A Windows-first desktop music player built with Electron, focused on clean UI, safe file handling, and stable local playback.

## Why This Project

AFTC Music Player is designed for everyday desktop listening with a practical feature set and strict security boundaries.

- Built for Windows 11 experience first
- Supports local audio libraries with folder import and drag/drop import
- Keeps renderer isolated from filesystem and privileged operations
- Uses recycle bin deletion, not permanent delete

## Features

### Playback and Library

- Supported formats: MP3, WAV, FLAC
- Playlist sorted alphabetically by filename
- First track auto-selected on load
- Now Playing row, seek bar, transport controls, and volume slider
- Track metadata display with graceful fallback when tags are missing
- Per-track star rating

### File and Playlist Actions

- Remove from list without touching file on disk
- Delete file with explicit confirmation
- Delete moves files to recycle bin
- Playlist persistence and startup validation for missing files

### Desktop Integration

- App menu with Open Folder, Clear Playlist, About, and Shortcuts
- Keyboard shortcuts
- Tray integration with restore, stop, and exit actions
- Window bounds persistence with display-fingerprint safety checks

## Security Model

Security boundaries are intentionally strict.

- Context isolation enabled
- No direct filesystem access from renderer
- Preload exposes explicit IPC allowlist only
- Protected/system paths are blocked during import operations
- Privileged operations are restricted to main process

## Tech Stack

- Electron 41
- ESM JavaScript across main, preload, and renderer integration paths
- electron-store for persistence
- music-metadata for metadata extraction
- trash for recycle-bin behavior
- electron-builder for packaging

## Getting Started

## 1) Prerequisites

- Node.js 20+ recommended
- npm 10+
- Windows, macOS, or Linux for local development

## 2) Install

```bash
npm install
```

## 3) Run In Development

```bash
npm run dev
```

This launches the Electron app using the current workspace source.

## Build And Package

All build commands use Electron Builder.

| Goal | Command | Notes |
| --- | --- | --- |
| Build Windows package | npm run build | Default Windows build (same as build:win) |
| Build Windows package (explicit) | npm run build:win | NSIS installer output |
| Build macOS package | npm run build:mac | Requires macOS-compatible build environment for signing/distribution workflows |
| Build Linux package | npm run build:linux | Linux target packaging |
| Build Windows and verify trash helper | npm run build:verify | Runs build and helper verification |

Build outputs are generated under the dist directory.

## Windows Trash Helper Verification

To verify packaged Windows delete-to-recycle-bin helper placement:

```bash
npm run verify:trash-helper
```

This checks for expected helper executables in unpacked app resources after build.

## Project Layout

```text
main.js
preload.js
package.json
src/
  index.html
  renderer.js
  player.js
  playlist.js
  styles/main.css
utils/
  fileScanner.js
  metadataReader.js
  pathPolicy.js
  ratingWriter.js
  tray.js
scripts/
  verify-trash-helper.mjs
```

## Troubleshooting

### Delete action fails in packaged Windows app

- Run npm run build:verify and confirm helper verification passes
- Ensure you are testing a newly built installer/package
- If needed, use npm run dev to validate source behavior independently from packaged output

## License

MIT. See LICENSE.
