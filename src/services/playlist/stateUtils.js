export function normalizeTracks(tracks) {
  return Array.isArray(tracks) ? tracks : [];
}

export function hasTrackPath(tracks, trackPath) {
  return tracks.some((track) => track.path === trackPath);
}

export function normalizeSelectionIndex(selectedIndex, totalTracks) {
  if (totalTracks <= 0) return -1;
  if (selectedIndex < 0 || selectedIndex >= totalTracks) return 0;
  return selectedIndex;
}

export function removeTrackByPath(tracks, trackPath) {
  return tracks.filter((track) => track.path !== trackPath);
}
