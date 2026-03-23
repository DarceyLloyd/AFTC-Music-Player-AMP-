export class AudioPlayer {
  constructor({ onStateChange, onTimeUpdate, onTrackEnd, onError } = {}) {
    this.audio = new Audio();
    this.playlist = [];
    this.currentIndex = -1;
    this.isPlaying = false;
    this.isPaused = false;
    this.onStateChange = onStateChange;
    this.onTimeUpdate = onTimeUpdate;
    this.onTrackEnd = onTrackEnd;
    this.onError = onError;

    this.audio.addEventListener('timeupdate', () => {
      this.onTimeUpdate?.({
        currentTime: this.audio.currentTime || 0,
        duration: this.audio.duration || 0,
        currentLabel: formatTime(this.audio.currentTime || 0),
        durationLabel: formatTime(this.audio.duration || 0)
      });
    });

    this.audio.addEventListener('loadedmetadata', () => {
      this.onTimeUpdate?.({
        currentTime: this.audio.currentTime || 0,
        duration: this.audio.duration || 0,
        currentLabel: formatTime(this.audio.currentTime || 0),
        durationLabel: formatTime(this.audio.duration || 0)
      });
    });

    this.audio.addEventListener('ended', () => {
      this.isPlaying = false;
      this.isPaused = false;
      this.emitState();
      this.onTrackEnd?.();
    });

    this.audio.addEventListener('error', () => {
      this.isPlaying = false;
      this.isPaused = false;
      this.emitState();
      const mediaError = this.audio.error;
      this.onError?.(classifyPlaybackError(mediaError));
    });
  }

  setPlaylist(playlist) {
    this.playlist = Array.isArray(playlist) ? playlist : [];
    if (this.playlist.length === 0) {
      this.currentIndex = -1;
    } else if (this.currentIndex >= this.playlist.length) {
      this.currentIndex = this.playlist.length - 1;
    }
    this.emitState();
  }

  setCurrentIndex(index) {
    if (index < 0 || index >= this.playlist.length) return;
    this.currentIndex = index;
    this.emitState();
  }

  async play(index = null) {
    if (index !== null) {
      if (index < 0 || index >= this.playlist.length) return false;
      this.currentIndex = index;
      this.loadCurrentTrack();
    } else if (!this.audio.src && this.currentIndex >= 0) {
      this.loadCurrentTrack();
    }

    if (this.currentIndex < 0 || this.currentIndex >= this.playlist.length) {
      return false;
    }

    try {
      await this.audio.play();
      this.isPlaying = true;
      this.isPaused = false;
      this.emitState();
      return true;
    } catch (error) {
      this.isPlaying = false;
      this.isPaused = false;
      this.emitState();
      this.onError?.({
        category: 'codec-or-container',
        message: error.message || 'Unable to decode or play this file.'
      });
      return false;
    }
  }

  pause() {
    this.audio.pause();
    this.isPlaying = false;
    this.isPaused = true;
    this.emitState();
  }

  stop() {
    if (this.isPaused || !this.isPlaying) {
      this.audio.currentTime = 0;
      this.isPlaying = false;
      this.isPaused = false;
    } else {
      this.audio.pause();
      this.isPlaying = false;
      this.isPaused = true;
    }
    this.emitState();
  }

  seek(timeInSeconds) {
    if (!Number.isFinite(timeInSeconds)) return;
    this.audio.currentTime = Math.max(0, timeInSeconds);
  }

  setVolume(level0to100) {
    const value = Math.max(0, Math.min(100, Number(level0to100) || 0));
    this.audio.volume = value / 100;
  }

  next() {
    if (this.currentIndex < this.playlist.length - 1) {
      return this.play(this.currentIndex + 1);
    }
    return false;
  }

  previous() {
    if (this.currentIndex > 0) {
      return this.play(this.currentIndex - 1);
    }
    return false;
  }

  loadCurrentTrack() {
    const track = this.playlist[this.currentIndex];
    if (!track) return;
    this.audio.src = pathToFileUrl(track.path);
  }

  emitState() {
    this.onStateChange?.({
      isPlaying: this.isPlaying,
      isPaused: this.isPaused,
      currentIndex: this.currentIndex,
      hasTrack: this.currentIndex >= 0 && this.currentIndex < this.playlist.length
    });
  }
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

function pathToFileUrl(filePath) {
  const normalized = filePath.replace(/\\/g, '/');
  const encoded = normalized
    .split('/')
    .map((part) => encodeURIComponent(part).replace(/%3A/g, ':'))
    .join('/');
  return `file:///${encoded}`;
}

function classifyPlaybackError(mediaError) {
  if (!mediaError) {
    return {
      category: 'unknown',
      message: 'Playback failed for an unknown reason.'
    };
  }

  if (mediaError.code === MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED) {
    return {
      category: 'codec-or-container',
      message: 'Unsupported codec or container for this file.'
    };
  }

  if (mediaError.code === MediaError.MEDIA_ERR_DECODE) {
    return {
      category: 'corrupt-file',
      message: 'The file appears to be corrupted or unreadable.'
    };
  }

  if (mediaError.code === MediaError.MEDIA_ERR_NETWORK) {
    return {
      category: 'access-path',
      message: 'Cannot access this file location.'
    };
  }

  return {
    category: 'unknown',
    message: 'Playback failed. Please try another file.'
  };
}
