import { AudioPlayer } from './player.js';
import { PlaylistStore } from './playlist.js';
import { gsap } from '../node_modules/gsap/index.js';

const dom = {
  appShell: document.getElementById('appShell'),
  trackList: document.getElementById('trackList'),
  importSummary: document.getElementById('importSummary'),
  nowPlaying: document.getElementById('nowPlaying'),
  startTime: document.getElementById('startTime'),
  currentTime: document.getElementById('currentTime'),
  durationTime: document.getElementById('durationTime'),
  seekBar: document.getElementById('seekBar'),
  prevBtn: document.getElementById('prevBtn'),
  playPauseBtn: document.getElementById('playPauseBtn'),
  stopBtn: document.getElementById('stopBtn'),
  nextBtn: document.getElementById('nextBtn'),
  clearBtn: document.getElementById('clearBtn'),
  openFolderBtn: document.getElementById('openFolderBtn'),
  volumeSlider: document.getElementById('volumeSlider'),
  volumeIcon: document.getElementById('volumeIcon'),
  removeDialog: document.getElementById('removeDialog'),
  confirmDeleteDialog: document.getElementById('confirmDeleteDialog'),
  dropOverlay: document.getElementById('dropOverlay')
};

const playlistStore = new PlaylistStore();
const metadataByPath = new Map();
let currentDialogTrackPath = null;
let lastPersistedTrackPath = null;
let scrollConfig = {
  playlistSeconds: 0.5,
  startupSeconds: 1,
  infoToggleSeconds: 0.18
};

const player = new AudioPlayer({
  onStateChange: handlePlayerStateChange,
  onTimeUpdate: updateProgress,
  onTrackEnd: handleTrackEnd,
  onError: handlePlaybackError
});

bootstrap().catch((error) => {
  alert(`Startup failed: ${error.message}`);
});

async function bootstrap() {
  setTrackListLoading(true, 'Loading playlist...');

  wireControls();
  wireKeyboardShortcuts();
  wireMenuBindings();
  wireDragAndDrop();

  try {
    const appConfig = await window.aftc.getAppConfig();
    const configuredPlaylist = Number(appConfig?.ui?.playlistScrollDurationSeconds);
    const configuredStartup = Number(appConfig?.ui?.startupScrollDurationSeconds);
    const configuredInfoToggle = Number(appConfig?.ui?.infoToggleDurationSeconds);
    if (Number.isFinite(configuredPlaylist) && configuredPlaylist >= 0) {
      scrollConfig.playlistSeconds = configuredPlaylist;
    }
    if (Number.isFinite(configuredStartup) && configuredStartup >= 0) {
      scrollConfig.startupSeconds = configuredStartup;
    }
    if (Number.isFinite(configuredInfoToggle) && configuredInfoToggle >= 0) {
      scrollConfig.infoToggleSeconds = configuredInfoToggle;
    }

    const savedVolume = await window.aftc.getSavedVolume();
    dom.volumeSlider.value = `${savedVolume}`;
    player.setVolume(savedVolume);
    syncVolumeIcon(savedVolume);

    const savedPlaylist = await window.aftc.getSavedPlaylist();
    if (savedPlaylist.length > 0) {
      const lastTrackPath = await window.aftc.getLastTrackPath();
      await replacePlaylist(savedPlaylist, {
        sourceLabel: 'Restored previous playlist.',
        preferredTrackPath: lastTrackPath,
        scrollToSelectionOnRender: false
      });
    }
  } finally {
    await waitForUiSettle();
    setTrackListLoading(false);

    // Startup restore scroll can fail while the list is hidden by loading state.
    // Re-run once visible to guarantee last selected track is brought into view.
    if (playlistStore.tracks.length > 0) {
      await waitForUiSettle();
      renderTrackList({ scrollTarget: 'selected', smooth: true });
    }
  }
}

function wireControls() {
  dom.clearBtn.addEventListener('click', async () => {
    clearPlaylist('Playlist cleared.');
    await window.aftc.savePlaylist([]);
  });
  dom.openFolderBtn.addEventListener('click', openFolder);
  dom.playPauseBtn.addEventListener('click', onPlayPauseClicked);
  dom.stopBtn.addEventListener('click', () => {
    player.stop();
    updateNowPlaying();
  });
  dom.prevBtn.addEventListener('click', onPreviousClicked);
  dom.nextBtn.addEventListener('click', onNextClicked);

  dom.seekBar.addEventListener('input', () => {
    const duration = Number(dom.seekBar.dataset.duration || 0);
    const ratio = Number(dom.seekBar.value) / 100;
    player.seek(duration * ratio);
  });

  dom.volumeSlider.addEventListener('input', async () => {
    const value = Number(dom.volumeSlider.value);
    player.setVolume(value);
    syncVolumeIcon(value);
    await window.aftc.saveVolume(value);
  });

  dom.removeDialog.addEventListener('close', onRemoveDialogClosed);
  dom.confirmDeleteDialog.addEventListener('close', onConfirmDeleteDialogClosed);
}

function wireKeyboardShortcuts() {
  document.addEventListener('keydown', (event) => {
    const tag = document.activeElement?.tagName || '';
    if (tag === 'INPUT' || tag === 'TEXTAREA') return;

    if (event.code === 'Space') {
      event.preventDefault();
      onPlayPauseClicked();
      return;
    }

    if (event.code === 'ArrowLeft') {
      player.seek((player.audio.currentTime || 0) - 5);
      return;
    }

    if (event.code === 'ArrowRight') {
      player.seek((player.audio.currentTime || 0) + 5);
      return;
    }

    if (event.code === 'ArrowUp' && !player.isPlaying) {
      event.preventDefault();
      moveSelection(-1);
      return;
    }

    if (event.code === 'ArrowDown' && !player.isPlaying) {
      event.preventDefault();
      moveSelection(1);
      return;
    }

    if (event.code === 'Delete') {
      event.preventDefault();
      const selectedTrack = playlistStore.tracks[playlistStore.selectedIndex];
      if (selectedTrack) {
        openRemoveDialog(selectedTrack.path);
      }
    }
  });
}

function wireMenuBindings() {
  window.aftc.onMenuOpenFolder(() => {
    openFolder();
  });

  window.aftc.onMenuClearPlaylist(async () => {
    clearPlaylist('Playlist cleared.');
    await window.aftc.savePlaylist([]);
  });

  window.aftc.onMenuAbout(() => {
    alert('AFTC Music Player\nDesktop music player for MP3, WAV, and FLAC.');
  });

  window.aftc.onMenuShortcuts(() => {
    alert(
      'Keyboard Shortcuts\n\nSpace: Play/Pause\nLeft/Right: Seek -/+ 5s\nUp/Down: Selection (when stopped)\nDelete: Remove selected\nCtrl+O: Open folder\nCtrl+Q: Quit'
    );
  });

  window.aftc.onTrayControl((command) => {
    if (command === 'stop') {
      player.stop();
      updateNowPlaying();
    }
  });
}

function wireDragAndDrop() {
  const activeClass = 'active';

  window.addEventListener('dragover', (event) => {
    event.preventDefault();
    dom.dropOverlay.classList.add(activeClass);
  });

  window.addEventListener('dragleave', (event) => {
    if (event.relatedTarget === null) {
      dom.dropOverlay.classList.remove(activeClass);
    }
  });

  window.addEventListener('drop', async (event) => {
    event.preventDefault();
    event.stopPropagation();
    dom.dropOverlay.classList.remove(activeClass);

    const filePaths = extractDroppedPaths(event.dataTransfer);

    if (filePaths.length === 0) {
      alert('Drop detected, but no file or folder path could be read from the drag payload.');
      return;
    }

    const result = await window.aftc.importDroppedPaths(filePaths);
    await importResultIntoPlaylist(result, 'Imported from drag-and-drop.');
  });
}

function extractDroppedPaths(dataTransfer) {
  if (!dataTransfer) return [];

  const candidates = new Set();

  for (const file of Array.from(dataTransfer.files || [])) {
    const resolvedPath = resolveDroppedFilePath(file);
    if (resolvedPath) {
      candidates.add(resolvedPath);
    }
  }

  for (const item of Array.from(dataTransfer.items || [])) {
    const file = item.getAsFile?.();
    const resolvedPath = resolveDroppedFilePath(file);
    if (resolvedPath) {
      candidates.add(resolvedPath);
    }
  }

  const uriList = dataTransfer.getData('text/uri-list');
  if (uriList) {
    for (const line of uriList.split(/\r?\n/)) {
      const value = line.trim();
      if (!value || value.startsWith('#')) continue;
      const resolved = uriToPath(value);
      if (resolved) {
        candidates.add(resolved);
      }
    }
  }

  const plainText = dataTransfer.getData('text/plain');
  if (plainText) {
    for (const line of plainText.split(/\r?\n/)) {
      const value = line.trim().replace(/^"|"$/g, '');
      if (!value) continue;

      if (value.startsWith('file:///')) {
        const resolved = uriToPath(value);
        if (resolved) {
          candidates.add(resolved);
        }
        continue;
      }

      if (looksLikeWindowsPath(value)) {
        candidates.add(value.replace(/\//g, '\\'));
      }
    }
  }

  return Array.from(candidates);
}

function uriToPath(uri) {
  if (!uri || !uri.startsWith('file:///')) return '';

  try {
    const withoutScheme = uri.replace('file:///', '');
    const decoded = decodeURIComponent(withoutScheme);
    const withWindowsDrive = decoded.replace(/^\/?([a-zA-Z]:)/, '$1');
    return withWindowsDrive.replace(/\//g, '\\');
  } catch {
    return '';
  }
}

function looksLikeWindowsPath(value) {
  return /^[a-zA-Z]:[\\/]/.test(value) || value.startsWith('\\\\');
}

function resolveDroppedFilePath(file) {
  if (!file) return '';

  if (typeof window.aftc?.getPathForFile === 'function') {
    const resolved = window.aftc.getPathForFile(file);
    if (resolved && looksLikeWindowsPath(resolved)) {
      return resolved;
    }
  }

  if (typeof file.path === 'string' && file.path) {
    return file.path;
  }

  return '';
}

async function openFolder() {
  const result = await window.aftc.selectFolder();
  if (!result || result.canceled) {
    return;
  }
  await importResultIntoPlaylist(result, `Loaded from folder: ${result.source || ''}`);
}

async function importResultIntoPlaylist(result, sourceLabel) {
  const files = result.files || [];
  const failures = result.failures || [];

  if (files.length === 0) {
    const reasonText = failures.map((f) => f.reason).join('\n') || 'No supported files found.';
    alert(`Import failed.\n${reasonText}`);
    return;
  }

  await replacePlaylist(files, { sourceLabel });

  if (failures.length > 0) {
    const preview = failures
      .slice(0, 8)
      .map((f) => `${f.filePath || 'Path'}: ${f.reason}`)
      .join('\n');
    alert(`Some files were skipped:\n\n${preview}`);
  }
}

async function replacePlaylist(files, { sourceLabel, preferredTrackPath = null, scrollToSelectionOnRender = false }) {
  const normalized = files
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));

  playlistStore.setTracks(normalized);

  if (preferredTrackPath) {
    const preferredIndex = playlistStore.findIndexByPath(preferredTrackPath);
    if (preferredIndex >= 0) {
      playlistStore.select(preferredIndex);
    } else if (normalized.length > 0) {
      playlistStore.select(0);
    }
  } else if (playlistStore.selectedIndex < 0 && normalized.length > 0) {
    playlistStore.select(0);
  }

  player.setPlaylist(playlistStore.tracks);
  player.setCurrentIndex(playlistStore.selectedIndex);

  await hydrateMetadata(playlistStore.tracks.map((t) => t.path));
  await window.aftc.savePlaylist(playlistStore.tracks);

  dom.importSummary.textContent = `${sourceLabel} ${normalized.length} tracks loaded.`;
  renderTrackList({ scrollTarget: scrollToSelectionOnRender ? 'selected' : 'current' });
  if (scrollToSelectionOnRender) {
    await waitForUiSettle();
  }
  updateNowPlaying();
  resetProgressUi();
}

function setTrackListLoading(isLoading, message = 'Loading...') {
  dom.trackList.classList.toggle('is-loading', isLoading);
  dom.trackList.setAttribute('aria-busy', String(isLoading));

  if (isLoading) {
    dom.trackList.dataset.loadingMessage = message;
    dom.trackList.innerHTML = '';
    return;
  }

  dom.trackList.removeAttribute('data-loading-message');
}

async function waitForUiSettle() {
  await nextPaint();
  await nextPaint();
}

function nextPaint() {
  return new Promise((resolve) => {
    window.requestAnimationFrame(() => resolve());
  });
}

async function hydrateMetadata(filePaths) {
  const pending = filePaths.filter((p) => !metadataByPath.has(p));
  if (pending.length === 0) return;

  const batch = await window.aftc.getMetadataBatch(pending);
  for (const [filePath, metadata] of Object.entries(batch)) {
    metadataByPath.set(filePath, metadata);
  }
}

function renderTrackList({ scrollTarget = 'none', smooth = false } = {}) {
  dom.trackList.innerHTML = '';
  let currentElement = null;
  let selectedElement = null;

  playlistStore.tracks.forEach((track, index) => {
    const container = document.createElement('article');
    container.className = 'track-item';
    const isCurrentTrack = index === player.currentIndex;
    const isSelected = index === playlistStore.selectedIndex;
    const isPlaying = isCurrentTrack && player.isPlaying;

    if (isCurrentTrack) container.classList.add('selected');
    if (isPlaying) container.classList.add('playing');

    const metadata = metadataByPath.get(track.path);
    const lineLabel = `${index + 1}. ${metadata?.artist ? `${metadata.artist} - ` : ''}${track.name}`;

    const head = document.createElement('div');
    head.className = 'track-head';
    head.dataset.trackPath = track.path;
    head.tabIndex = 0;
    head.setAttribute('role', 'option');
    head.setAttribute('aria-selected', String(isSelected));

    const main = document.createElement('div');
    main.className = 'track-main';
    main.textContent = `${isPlaying ? '♪ ' : ''}${lineLabel}`;

    const actions = document.createElement('div');
    actions.className = 'track-actions';

    const ratingControl = createRatingControl(track.path, metadata?.rating || 0);

    const expandBtn = document.createElement('button');
    expandBtn.type = 'button';
    expandBtn.className = 'icon-btn expand-btn';
    expandBtn.title = 'Expand metadata';
    setExpandButtonState(expandBtn, playlistStore.isExpanded(track.path));

    const removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.className = 'icon-btn delete-btn';
    removeBtn.title = 'Remove or delete track';
    removeBtn.textContent = 'DELETE';

    expandBtn.addEventListener('click', (event) => {
      event.stopPropagation();

      const isExpanded = playlistStore.isExpanded(track.path);
      const existingDetails = container.querySelector('.metadata');

      if (isExpanded) {
        playlistStore.toggleExpanded(track.path);
        setExpandButtonState(expandBtn, false);
        if (existingDetails) {
          animateMetadataCollapse(existingDetails);
        }
        return;
      }

      collapseExpandedMetadataRows(track.path);
      playlistStore.toggleExpanded(track.path);

      // Guard against stale nodes when users toggle quickly during animation.
      container.querySelectorAll('.metadata').forEach((staleDetails) => {
        gsap.killTweensOf(staleDetails);
        staleDetails.remove();
      });

      setExpandButtonState(expandBtn, true);
      const details = createMetadataDetails(track, metadata);
      container.append(details);
      animateMetadataExpand(details);
    });

    expandBtn.addEventListener('dblclick', (event) => {
      event.preventDefault();
      event.stopPropagation();
    });

    removeBtn.addEventListener('click', (event) => {
      event.stopPropagation();
      openRemoveDialog(track.path);
    });

    removeBtn.addEventListener('dblclick', (event) => {
      event.preventDefault();
      event.stopPropagation();
    });

    head.addEventListener('click', () => {
      // Single click is intentionally inert; double click controls track targeting.
    });

    head.addEventListener('dblclick', async () => {
      playlistStore.select(index);
      await player.play(index);
      renderTrackList({ scrollTarget: 'current' });
      updateNowPlaying();
      updatePlayPauseButton();
    });

    actions.append(ratingControl, expandBtn, removeBtn);
    head.append(main, actions);
    container.append(head);

    if (playlistStore.isExpanded(track.path)) {
      const details = createMetadataDetails(track, metadata);
      container.append(details);
    }

    if (isCurrentTrack) {
      currentElement = container;
    }

    if (isSelected) {
      selectedElement = container;
    }

    dom.trackList.append(container);
  });

  if (scrollTarget === 'selected' && selectedElement) {
    scrollTrackIntoView(selectedElement, { block: 'start', smooth });
    return;
  }

  if (scrollTarget === 'current' && currentElement) {
    scrollTrackIntoView(currentElement, { block: 'nearest', smooth });
    return;
  }

  if (scrollTarget === 'auto') {
    if (player.isPlaying && currentElement) {
      scrollTrackIntoView(currentElement, { block: 'nearest', smooth: true });
      return;
    }

    if (selectedElement) {
      scrollTrackIntoView(selectedElement, { block: 'start', smooth: true });
    }
  }
}

function scrollTrackIntoView(targetElement, { block = 'nearest', smooth = false } = {}) {
  if (!targetElement) return;

  const container = dom.trackList;
  if (!container) return;

  const targetTop = targetElement.offsetTop;
  const targetBottom = targetTop + targetElement.offsetHeight;
  const viewTop = container.scrollTop;
  const viewBottom = viewTop + container.clientHeight;

  let fallbackTop = viewTop;
  if (block === 'start') {
    fallbackTop = Math.max(0, targetTop);
  } else if (targetTop < viewTop) {
    fallbackTop = Math.max(0, targetTop);
  } else if (targetBottom > viewBottom) {
    fallbackTop = Math.max(0, targetBottom - container.clientHeight);
  }

  if (smooth) {
    if (Math.abs(fallbackTop - container.scrollTop) <= 1) {
      return;
    }

    gsap.killTweensOf(container);
    gsap.to(container, {
      duration: 1,
      ease: 'power2.out',
      scrollTop: fallbackTop
    });
    return;
  }

  if (Math.abs(fallbackTop - container.scrollTop) <= 1) {
    return;
  }

  const duration = smooth ? scrollConfig.startupSeconds : scrollConfig.playlistSeconds;
  gsap.killTweensOf(container);
  gsap.to(container, {
    duration,
    ease: 'power2.out',
    scrollTop: fallbackTop
  });
}

function createMetadataDetails(track, metadata) {
  const details = document.createElement('div');
  details.className = 'metadata';
  details.append(
    metadataLine('Artist', metadata?.artist || 'Unknown Artist'),
    metadataLine('Album', metadata?.album || 'Unknown Album'),
    metadataLine('Title', metadata?.title || track.name),
    metadataLine('Duration', metadata?.duration || '0:00'),
    metadataLine('Bitrate', metadata?.bitrate || '-'),
    metadataLine('Sample Rate', metadata?.sampleRate || '-'),
    metadataLine('Rating', metadata?.rating ? `${metadata.rating}/5` : 'Unrated'),
    metadataLine('Year', metadata?.year || '-'),
    metadataLine('Format', metadata?.format || track.ext.replace('.', '').toUpperCase())
  );

  return details;
}

function setExpandButtonState(button, isExpanded) {
  button.textContent = isExpanded ? 'Info ▼' : 'Info ▶';
  button.setAttribute('aria-expanded', String(isExpanded));
}

function collapseExpandedMetadataRows(exceptTrackPath) {
  const trackItems = dom.trackList.querySelectorAll('.track-item');
  trackItems.forEach((trackItem) => {
    const head = trackItem.querySelector('.track-head');
    if (!head) return;

    const trackPath = head.dataset.trackPath;
    if (trackPath === exceptTrackPath) return;

    const details = trackItem.querySelector('.metadata');
    if (details) {
      animateMetadataCollapse(details);
    }

    const expandBtn = trackItem.querySelector('.expand-btn');
    if (expandBtn) {
      setExpandButtonState(expandBtn, false);
    }
  });
}

function animateMetadataExpand(detailsElement) {
  const duration = Math.max(0, Number(scrollConfig.infoToggleSeconds) || 0);
  if (duration <= 0) {
    gsap.set(detailsElement, { clearProps: 'height,overflow,opacity' });
    return;
  }

  // Measure natural open height first, then animate from collapsed state.
  gsap.set(detailsElement, {
    height: 'auto',
    opacity: 1,
    paddingTop: 0,
    paddingBottom: 8,
    overflow: 'hidden'
  });
  const targetHeight = detailsElement.getBoundingClientRect().height;

  gsap.set(detailsElement, {
    height: 0,
    opacity: 0,
    paddingTop: 0,
    paddingBottom: 0,
    overflow: 'hidden'
  });

  gsap.killTweensOf(detailsElement);
  gsap.to(detailsElement, {
    duration,
    ease: 'power2.out',
    height: targetHeight,
    opacity: 1,
    paddingTop: 0,
    paddingBottom: 8,
    onComplete: () => {
      gsap.set(detailsElement, { clearProps: 'height,overflow,opacity,paddingTop,paddingBottom' });
    }
  });
}

function animateMetadataCollapse(detailsElement) {
  const duration = Math.max(0, Number(scrollConfig.infoToggleSeconds) || 0);
  if (duration <= 0) {
    detailsElement.remove();
    return;
  }

  gsap.killTweensOf(detailsElement);
  gsap.to(detailsElement, {
    duration,
    ease: 'power2.in',
    height: 0,
    opacity: 0,
    paddingTop: 0,
    paddingBottom: 0,
    overflow: 'hidden',
    onComplete: () => {
      detailsElement.remove();
    }
  });
}

function createRatingControl(trackPath, currentRating) {
  const stars = document.createElement('div');
  stars.className = 'rating-stars';
  stars.setAttribute('role', 'group');
  stars.setAttribute('aria-label', 'Set track rating');

  for (let starValue = 1; starValue <= 5; starValue += 1) {
    const starBtn = document.createElement('button');
    starBtn.type = 'button';
    starBtn.className = 'rating-star-btn';
    starBtn.title = `Set ${starValue} star rating`;
    starBtn.textContent = starValue <= currentRating ? '★' : '☆';
    starBtn.setAttribute('aria-label', `Rate ${starValue} stars`);
    starBtn.classList.toggle('filled', starValue <= currentRating);

    starBtn.addEventListener('click', async (event) => {
      event.stopPropagation();
      const nextRating = starValue === currentRating ? 0 : starValue;
      await setTrackRating(trackPath, nextRating);
    });

    starBtn.addEventListener('dblclick', (event) => {
      event.preventDefault();
      event.stopPropagation();
    });

    stars.append(starBtn);
  }

  return stars;
}

function line(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div;
}

function metadataLine(label, value) {
  const row = document.createElement('div');

  const labelSpan = document.createElement('span');
  labelSpan.className = 'metadata-label';
  labelSpan.textContent = `${label}: `;

  const valueSpan = document.createElement('span');
  valueSpan.className = 'metadata-value';
  valueSpan.textContent = `${value}`;

  row.append(labelSpan, valueSpan);
  return row;
}

function openRemoveDialog(trackPath) {
  currentDialogTrackPath = trackPath;
  dom.removeDialog.showModal();
}

async function onRemoveDialogClosed() {
  if (!currentDialogTrackPath) return;

  if (dom.removeDialog.returnValue === 'remove') {
    await handleRemoveTrack(currentDialogTrackPath);
    currentDialogTrackPath = null;
    return;
  }

  if (dom.removeDialog.returnValue === 'delete') {
    dom.confirmDeleteDialog.showModal();
    return;
  }

  currentDialogTrackPath = null;
}

async function onConfirmDeleteDialogClosed() {
  if (!currentDialogTrackPath) return;

  if (dom.confirmDeleteDialog.returnValue !== 'confirm') {
    currentDialogTrackPath = null;
    return;
  }

  const trackPath = currentDialogTrackPath;
  const result = await window.aftc.deleteTrackFile(trackPath);
  if (!result.ok) {
    alert(`Delete failed: ${result.error}`);
    currentDialogTrackPath = null;
    return;
  }

  await handleRemoveTrack(trackPath);
  currentDialogTrackPath = null;
}

async function handleRemoveTrack(trackPath) {
  const removedIndex = playlistStore.findIndexByPath(trackPath);
  if (removedIndex < 0) {
    return;
  }

  const selectedBefore = playlistStore.selectedIndex;
  const currentBefore = player.currentIndex;
  const wasPlayingBefore = player.isPlaying;

  const removedWasSelected = removedIndex === selectedBefore;
  const removedWasCurrentTrack = removedIndex === currentBefore;

  await window.aftc.removeTrack(trackPath);
  playlistStore.removeByPath(trackPath);

  if (playlistStore.tracks.length === 0) {
    clearPlaylist('Playlist is empty.');
    await window.aftc.savePlaylist([]);
    return;
  }

  // If the removed track was actively playing, only advance to the immediate next track.
  // If there is no next track, stop playback and clear selection.
  if (wasPlayingBefore && removedWasCurrentTrack) {
    const nextIndex = removedIndex;
    const hasNextTrack = nextIndex < playlistStore.tracks.length;

    player.setPlaylist(playlistStore.tracks);

    if (hasNextTrack) {
      playlistStore.select(nextIndex);
      await player.play(nextIndex);
      player.setCurrentIndex(nextIndex);
    } else {
      player.stop();
      player.audio.removeAttribute('src');
      player.audio.load();
      player.currentIndex = -1;
      player.isPlaying = false;
      player.isPaused = false;
      player.emitState();
      playlistStore.selectedIndex = -1;
    }

    await window.aftc.savePlaylist(playlistStore.tracks);
    renderTrackList({ scrollTarget: 'current' });
    updateNowPlaying();
    updatePlayPauseButton();
    return;
  }

  const fallbackIndex = Math.min(removedIndex, playlistStore.tracks.length - 1);

  if (removedWasSelected) {
    playlistStore.select(fallbackIndex);
  } else if (selectedBefore > removedIndex) {
    playlistStore.select(selectedBefore - 1);
  }

  player.setPlaylist(playlistStore.tracks);

  if (removedWasCurrentTrack) {
    player.setCurrentIndex(fallbackIndex);
  } else if (currentBefore > removedIndex) {
    player.setCurrentIndex(currentBefore - 1);
  }

  await window.aftc.savePlaylist(playlistStore.tracks);
  renderTrackList({ scrollTarget: 'none' });
  updateNowPlaying();
  updatePlayPauseButton();
}

async function setTrackRating(trackPath, rating) {
  const trackIndex = playlistStore.findIndexByPath(trackPath);
  if (trackIndex < 0) {
    return;
  }

  const isCurrentTrack = trackIndex === player.currentIndex;
  const wasPlaying = isCurrentTrack && player.isPlaying;
  const resumeTime = isCurrentTrack ? player.audio.currentTime || 0 : 0;

  if (wasPlaying) {
    player.pause();
    player.audio.removeAttribute('src');
    player.audio.load();
  }

  const result = await window.aftc.setTrackRating(trackPath, rating);
  if (!result.ok) {
    alert(`Rating update failed: ${result.error}`);
    if (wasPlaying) {
      player.loadCurrentTrack();
      player.seek(resumeTime);
      await player.play();
    }
    return;
  }

  metadataByPath.delete(trackPath);
  await hydrateMetadata([trackPath]);

  if (wasPlaying) {
    player.loadCurrentTrack();
    player.seek(resumeTime);
    await player.play();
  }

  renderTrackList({ scrollTarget: 'none' });
  updateNowPlaying();
}

function clearPlaylist(summary) {
  playlistStore.clear();
  player.stop();
  player.setPlaylist([]);
  window.aftc.clearLastTrackPath();
  lastPersistedTrackPath = null;
  dom.trackList.innerHTML = '';
  dom.importSummary.textContent = summary;
  updateNowPlaying();
  resetProgressUi();
  updatePlayPauseButton();
}

async function onPlayPauseClicked() {
  if (playlistStore.selectedIndex < 0) {
    return;
  }

  if (player.isPlaying) {
    player.pause();
    updatePlayPauseButton();
    return;
  }

  const selected = playlistStore.selectedIndex;
  const shouldResumePausedTrack = player.isPaused && player.currentIndex === selected;
  if (shouldResumePausedTrack) {
    await player.play();
  } else {
    await player.play(selected);
  }
  updatePlayPauseButton();
  renderTrackList({ scrollTarget: 'none' });
  updateNowPlaying();
}

async function onPreviousClicked() {
  if (player.isPlaying) {
    await player.previous();
    playlistStore.select(player.currentIndex);
  } else {
    moveSelection(-1);
    player.setCurrentIndex(playlistStore.selectedIndex);
  }

  updateNowPlaying();
  renderTrackList({ scrollTarget: 'current' });
  updatePlayPauseButton();
}

async function onNextClicked() {
  if (player.isPlaying) {
    await player.next();
    playlistStore.select(player.currentIndex);
  } else {
    moveSelection(1);
    player.setCurrentIndex(playlistStore.selectedIndex);
  }

  updateNowPlaying();
  renderTrackList({ scrollTarget: 'current' });
  updatePlayPauseButton();
}

function moveSelection(offset) {
  if (playlistStore.tracks.length === 0) return;

  const next = Math.max(0, Math.min(playlistStore.tracks.length - 1, playlistStore.selectedIndex + offset));
  playlistStore.select(next);
  renderTrackList({ scrollTarget: 'none' });
  updateNowPlaying();
}

function handlePlayerStateChange() {
  persistCurrentTrackIfPlaying();
  updatePlayPauseButton();
  renderTrackList({ scrollTarget: 'none' });
  updateNowPlaying();
}

async function handleTrackEnd() {
  if (player.currentIndex < playlistStore.tracks.length - 1) {
    await player.play(player.currentIndex + 1);
    playlistStore.select(player.currentIndex);
    persistCurrentTrackIfPlaying();
    renderTrackList({ scrollTarget: 'current' });
    updateNowPlaying();
    return;
  }

  // Last track reached: keep it selected, rewind to start, and stop.
  playlistStore.select(player.currentIndex);
  player.seek(0);
  player.isPlaying = false;
  player.isPaused = false;
  player.emitState();
  renderTrackList({ scrollTarget: 'none' });
  updateNowPlaying();
  updatePlayPauseButton();
}

function persistCurrentTrackIfPlaying() {
  if (!player.isPlaying) {
    return;
  }

  const currentTrack = playlistStore.tracks[player.currentIndex];
  if (!currentTrack?.path || currentTrack.path === lastPersistedTrackPath) {
    return;
  }

  lastPersistedTrackPath = currentTrack.path;
  window.aftc.saveLastTrackPath(currentTrack.path);
}

function handlePlaybackError(error) {
  const track = playlistStore.tracks[player.currentIndex];
  const fileName = track?.name || 'Unknown file';
  alert(`${fileName}\n\nPlayback failed (${error.category}): ${error.message}`);
}

function updateProgress({ currentTime, duration, currentLabel, durationLabel }) {
  const safeDuration = Number.isFinite(duration) && duration > 0 ? duration : 0;
  const pct = safeDuration > 0 ? (currentTime / safeDuration) * 100 : 0;

  dom.seekBar.dataset.duration = `${safeDuration}`;
  dom.seekBar.value = `${Math.max(0, Math.min(100, pct))}`;
  dom.startTime.textContent = '0:00';
  dom.currentTime.textContent = currentLabel || formatTime(currentTime || 0);
  dom.durationTime.textContent = durationLabel || formatTime(duration || 0);
}

function resetProgressUi() {
  dom.seekBar.value = '0';
  dom.seekBar.dataset.duration = '0';
  dom.startTime.textContent = '0:00';
  dom.currentTime.textContent = '0:00';
  dom.durationTime.textContent = '0:00';
}

function updateNowPlaying() {
  const current = playlistStore.tracks[player.currentIndex];
  if (!current) {
    dom.nowPlaying.textContent = '';
    dom.nowPlaying.classList.remove('is-playing');
    return;
  }

  const metadata = metadataByPath.get(current.path);
  dom.nowPlaying.textContent = `♪ ${metadata?.artist || 'Unknown Artist'} - ${current.name}`;
  dom.nowPlaying.classList.toggle('is-playing', player.isPlaying);
}

function updatePlayPauseButton() {
  dom.playPauseBtn.textContent = player.isPlaying ? '⏸ Pause' : '▶ Play';
}

function syncVolumeIcon(volume) {
  if (volume <= 0) {
    dom.volumeIcon.textContent = '🔇';
    return;
  }
  if (volume <= 33) {
    dom.volumeIcon.textContent = '🔈';
    return;
  }
  if (volume <= 66) {
    dom.volumeIcon.textContent = '🔉';
    return;
  }
  dom.volumeIcon.textContent = '🔊';
}

function formatTime(totalSeconds) {
  if (!Number.isFinite(totalSeconds) || totalSeconds < 0) return '0:00';

  const secs = Math.floor(totalSeconds);
  const hours = Math.floor(secs / 3600);
  const minutes = Math.floor((secs % 3600) / 60);
  const seconds = secs % 60;

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }

  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}
