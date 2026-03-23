import { AudioPlayer } from './modules/player.js';
import { PlaylistStore } from './modules/playlist.js';
import { TrackListComponent } from './components/trackListComponent.js';
import { ProgressComponent } from './components/progressComponent.js';
import { syncVolumeIcon } from './components/volumeComponent.js';
import { wireDragAndDrop as setupDragAndDrop } from './components/dragDropComponent.js';

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

const progressComponent = new ProgressComponent({
  seekBar: dom.seekBar,
  startTime: dom.startTime,
  currentTime: dom.currentTime,
  durationTime: dom.durationTime
});

const player = new AudioPlayer({
  onStateChange: handlePlayerStateChange,
  onTimeUpdate: updateProgress,
  onTrackEnd: handleTrackEnd,
  onError: handlePlaybackError
});

const trackListComponent = new TrackListComponent({
  trackListElement: dom.trackList,
  playlistStore,
  player,
  metadataByPath,
  getScrollConfig: () => scrollConfig,
  onPlayTrack: async (index) => {
    await player.play(index);
    trackListComponent.render({ scrollTarget: 'current' });
    updateNowPlaying();
    updatePlayPauseButton();
  },
  onOpenRemoveDialog: openRemoveDialog,
  onSetTrackRating: setTrackRating
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
    syncVolumeIcon(dom.volumeIcon, savedVolume);

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
      trackListComponent.render({ scrollTarget: 'selected', smooth: true });
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
    syncVolumeIcon(dom.volumeIcon, value);
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
  setupDragAndDrop({
    dropOverlayElement: dom.dropOverlay,
    onImportDroppedPaths: async (filePaths) => {
      const result = await window.aftc.importDroppedPaths(filePaths);
      await importResultIntoPlaylist(result, 'Imported from drag-and-drop.');
    }
  });
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
  trackListComponent.render({ scrollTarget: scrollToSelectionOnRender ? 'selected' : 'current' });
  if (scrollToSelectionOnRender) {
    await waitForUiSettle();
  }
  updateNowPlaying();
  resetProgressUi();
}

function setTrackListLoading(isLoading, message = 'Loading...') {
  dom.trackList.classList.toggle('isLoading', isLoading);
  dom.trackList.setAttribute('aria-busy', String(isLoading));

  if (isLoading) {
    dom.trackList.dataset.loadingMessage = message;
    dom.trackList.innerHTML = '';
    return;
  }

  delete dom.trackList.dataset.loadingMessage;
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
    trackListComponent.render({ scrollTarget: 'current' });
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
  trackListComponent.render({ scrollTarget: 'none' });
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

  trackListComponent.render({ scrollTarget: 'none' });
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
  trackListComponent.render({ scrollTarget: 'none' });
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
  trackListComponent.render({ scrollTarget: 'current' });
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
  trackListComponent.render({ scrollTarget: 'current' });
  updatePlayPauseButton();
}

function moveSelection(offset) {
  if (playlistStore.tracks.length === 0) return;

  const next = Math.max(0, Math.min(playlistStore.tracks.length - 1, playlistStore.selectedIndex + offset));
  playlistStore.select(next);
  trackListComponent.render({ scrollTarget: 'none' });
  updateNowPlaying();
}

function handlePlayerStateChange() {
  persistCurrentTrackIfPlaying();
  updatePlayPauseButton();
  trackListComponent.render({ scrollTarget: 'none' });
  updateNowPlaying();
}

async function handleTrackEnd() {
  if (player.currentIndex < playlistStore.tracks.length - 1) {
    await player.play(player.currentIndex + 1);
    playlistStore.select(player.currentIndex);
    persistCurrentTrackIfPlaying();
    trackListComponent.render({ scrollTarget: 'current' });
    updateNowPlaying();
    return;
  }

  // Last track reached: keep it selected, rewind to start, and stop.
  playlistStore.select(player.currentIndex);
  player.seek(0);
  player.isPlaying = false;
  player.isPaused = false;
  player.emitState();
  trackListComponent.render({ scrollTarget: 'none' });
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
  progressComponent.update({ currentTime, duration, currentLabel, durationLabel });
}

function resetProgressUi() {
  progressComponent.reset();
}

function updateNowPlaying() {
  const current = playlistStore.tracks[player.currentIndex];
  if (!current) {
    dom.nowPlaying.textContent = '';
    dom.nowPlaying.classList.remove('isPlaying');
    return;
  }

  const metadata = metadataByPath.get(current.path);
  dom.nowPlaying.textContent = `♪ ${metadata?.artist || 'Unknown Artist'} - ${current.name}`;
  dom.nowPlaying.classList.toggle('isPlaying', player.isPlaying);
}

function updatePlayPauseButton() {
  dom.playPauseBtn.textContent = player.isPlaying ? '⏸ Pause' : '▶ Play';
}


