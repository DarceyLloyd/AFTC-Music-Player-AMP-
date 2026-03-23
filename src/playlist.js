export class PlaylistStore {
  constructor() {
    this.tracks = [];
    this.selectedIndex = -1;
    this.expandedPath = null;
  }

  setTracks(tracks) {
    this.tracks = Array.isArray(tracks) ? tracks : [];
    if (this.tracks.length === 0) {
      this.selectedIndex = -1;
      this.expandedPath = null;
      return;
    }

    if (this.expandedPath && !this.tracks.some((track) => track.path === this.expandedPath)) {
      this.expandedPath = null;
    }

    if (this.selectedIndex < 0 || this.selectedIndex >= this.tracks.length) {
      this.selectedIndex = 0;
    }
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

    const next = this.tracks.filter((t) => t.path !== trackPath);
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
