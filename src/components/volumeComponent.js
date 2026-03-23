export function syncVolumeIcon(volumeIconElement, volume) {
  if (volume <= 0) {
    volumeIconElement.textContent = '🔇';
    return;
  }
  if (volume <= 33) {
    volumeIconElement.textContent = '🔈';
    return;
  }
  if (volume <= 66) {
    volumeIconElement.textContent = '🔉';
    return;
  }
  volumeIconElement.textContent = '🔊';
}
