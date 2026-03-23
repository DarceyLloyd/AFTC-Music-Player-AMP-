# Copilot Instructions

This repository builds a Windows-first Electron desktop music player with a professional UI and strict security boundaries.

## Project Priorities

- Keep the app stable, responsive, and desktop-native on Windows 11.
- Prefer clean, maintainable ESM JavaScript over clever abstractions.
- Implement only scoped formats for v1: mp3, wav, flac.
- Do not add mp4 support unless explicitly requested.

## Architecture Rules

- Use ESM across the project, including main process and utilities.
- Keep privileged operations in main process only.
- Keep preload minimal and expose an explicit IPC allowlist.
- Renderer must never directly access filesystem APIs.
- Use async, non-blocking IO for scanning, metadata, and persistence flows.

## Security Rules (Non-Negotiable)

- Keep contextIsolation enabled.
- Do not enable broad renderer privileges.
- Avoid webview usage unless a strict requirement appears.
- Add and maintain a strict CSP in renderer HTML.
- Accept files and folders only from explicit user actions:
	- Open Folder dialog
	- Drag and drop into app window
- Validate incoming paths and reject protected OS/system directories.
- Return structured errors from main process and show clear user-facing recovery guidance.

## Required UX and Behavior Contracts

- Primary layout has 5 rows:
	- Track list
	- Now playing
	- Progress and seek
	- Transport controls plus open folder
	- Volume slider
- Track list:
	- Alphabetical by filename (A-Z)
	- First track auto-selected on load
	- Support selected, playing, and selected+playing states
	- Prevent filename overlap with action controls (ellipsis and fixed action area)
- Metadata row is expandable per track and must degrade gracefully when tags are missing.
- Playback controls:
	- Previous and Next follow specified edge behavior
	- Stop is two-phase: first stop at position, second rewind to start
- Progress row:
	- Left time anchor fixed at 0:00
	- Right duration fixed to loaded track duration
	- Center-below current time updates continuously
- Volume:
	- 0-100 range
	- Icon reflects level bucket
	- Persist and restore across launches

## Delete and Remove File Policy

- Track row X action must open a choice modal with:
	- Remove from list
	- Delete file
	- Cancel
- Remove from list must only remove playlist entry.
- Delete file must:
	- Require explicit confirmation (OK/Cancel) before execution
	- Move file to recycle bin using trash package
	- Never permanently delete directly
- After delete/remove, keep selection/playback state coherent and update persisted playlist.

## Tray and Window Lifecycle Rules

- Minimize button hides window to system tray.
- Tray must use a single-instance lifecycle (no duplicate tray icons).
- Tray click restores and focuses main window.
- Tray context menu contains Stop and Exit.
- Close button must quit app (not minimize to tray).
- Use before-quit guard logic so intentional app quit is not blocked by close/minimize handlers.

## Persistence Rules

- Persist at minimum:
	- Volume
	- Playlist
	- Window bounds and display context fingerprint
- On startup, validate saved playlist file paths and remove missing entries non-blockingly.
- Restore window bounds only when display context still matches.
- If display context changed or saved bounds are off-screen, clear stale bounds and open centered at 75 percent of primary work area width and height.

## Metadata and Playback Error Handling

- Extract metadata via music-metadata for mp3, wav, flac.
- Always handle files with missing metadata gracefully.
- If playback fails, surface filename and reason to user.
- Classify and communicate likely failure type where possible:
	- Unsupported codec/container
	- Corrupt file
	- Access/path issues
- Track unsupported or failed files during import and show a summary alert.

## UI Quality Expectations

- Maintain clean professional desktop styling, not toy-like visuals.
- Keep strong visual hierarchy and readability for long listening sessions.
- Preserve desktop accessibility states (hover, focus, active, disabled).
- Ensure controls remain legible and non-overlapping at 100, 125, and 150 percent scaling.
- Keep motion subtle (roughly 150 to 220 ms), avoiding heavy repaint loops.

## Menus and Shortcuts

- App menu must include:
	- File: Open Folder, Clear Playlist, Exit
	- Edit: reserved
	- View: reserved
	- Help: About, Keyboard Shortcuts
- Implement planned keyboard shortcuts and preserve expected desktop behavior.

## Packaging and Dependency Guidance

- Use Electron Builder for Windows packaging with NSIS target.
- Keep dependencies actively maintained and avoid stale plugins.
- Commit lockfile and preserve module-format compatibility decisions.
- FFmpeg fallback transcoding is optional and off by default unless explicitly enabled.
- If required binary/non-code assets are missing (for example icon image files), copy temporary placeholders from `W:\Dev\AI Gateway` and replace them later.
- Use `npm run dev` for local runtime verification and keep the console under observation while testing.
- Keep `npm run build` mapped to Windows packaging by default, with explicit `build:mac` and `build:linux` scripts also present.
- Keep `npm run verify:trash-helper` available to verify packaged Windows trash helper executables after build.

## Debug Collaboration Protocol

- During interactive debugging, Copilot should run `npm run dev` (or `npm run start` if requested) and keep terminal output under active review.
- User drives in-app testing and reports reproduction steps or outcomes back in chat.
- Copilot should treat GUI-exit and terminal-exit by the user as normal debug flow and resume from the next requested step.
- After each repro attempt, Copilot should report observed console errors/warnings and propose or apply targeted fixes.

## Working Style for Future Changes

- Reuse architecture patterns from the reference app only when they meet this repository security rules.
- Do not copy insecure patterns from reference code.
- Favor small, testable increments aligned to phase goals in plan.
- When behavior choices conflict, prioritize:
	- Security policy
	- Explicit UX contracts above
	- Windows-native lifecycle expectations

## Instruction Maintenance Protocol

- Keep this file and `plan.md` synchronized with actual implementation decisions.
- Any change to scripts, dependencies, build targets, security boundaries, UX contracts, or asset policy must include instruction updates in the same change.
- Do not leave stale guidance after code changes; update outdated sections immediately.
- If temporary placeholders are introduced (icons/assets), document source and replacement intent here until finalized.

