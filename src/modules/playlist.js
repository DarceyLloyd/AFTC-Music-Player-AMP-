import {
  hasTrackPath,
  normalizeSelectionIndex,
  normalizeTracks,
  removeTrackByPath
} from '../services/playlist/stateUtils.js';

export class PlaylistStore {
  constructor() {
    this.tracks = [];
    this.selectedIndex = -1;
    this.expandedPath = null;
  }

  setTracks(tracks) {
    this.tracks = normalizeTracks(tracks);
    if (this.tracks.length === 0) {
      this.selectedIndex = -1;
      this.expandedPath = null;
      return;
    }

    if (this.expandedPath && !hasTrackPath(this.tracks, this.expandedPath)) {
      this.expandedPath = null;
    }

    this.selectedIndex = normalizeSelectionIndex(this.selectedIndex, this.tracks.length);
  }

  clear() {
    this.tracks = [];
    this.selectedIndex = -1;
    this.expandedPath = null;
  }

  select(index) {
    if (index >= 0 && index < this.tracks.length) {
      this.selectedIndex = index;
    }
  }

  removeByPath(trackPath) {
    if (this.expandedPath === trackPath) {
      this.expandedPath = null;
    }

    const next = removeTrackByPath(this.tracks, trackPath);
    this.setTracks(next);
  }

  toggleExpanded(trackPath) {
    if (this.expandedPath === trackPath) {
      this.expandedPath = null;
      return false;
    }

    this.expandedPath = trackPath;
    return true;
  }

  isExpanded(trackPath) {
    return this.expandedPath === trackPath;
  }

  findIndexByPath(trackPath) {
    return this.tracks.findIndex((t) => t.path === trackPath);
  }
}
