import { formatAudioTime } from '../../utils/time.js';

export function createTimeSnapshot(audio) {
  return {
    currentTime: audio.currentTime || 0,
    duration: audio.duration || 0,
    currentLabel: formatAudioTime(audio.currentTime || 0),
    durationLabel: formatAudioTime(audio.duration || 0)
  };
}
