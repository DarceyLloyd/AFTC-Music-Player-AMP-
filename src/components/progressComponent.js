import { formatAudioTime } from '../utils/time.js';

export class ProgressComponent {
  constructor({ seekBar, startTime, currentTime, durationTime }) {
    this.seekBar = seekBar;
    this.startTime = startTime;
    this.currentTime = currentTime;
    this.durationTime = durationTime;
  }

  update({ currentTime, duration, currentLabel, durationLabel }) {
    const safeDuration = Number.isFinite(duration) && duration > 0 ? duration : 0;
    const pct = safeDuration > 0 ? (currentTime / safeDuration) * 100 : 0;

    this.seekBar.dataset.duration = `${safeDuration}`;
    this.seekBar.value = `${Math.max(0, Math.min(100, pct))}`;
    this.startTime.textContent = '0:00';
    this.currentTime.textContent = currentLabel || formatAudioTime(currentTime || 0);
    this.durationTime.textContent = durationLabel || formatAudioTime(duration || 0);
  }

  reset() {
    this.seekBar.value = '0';
    this.seekBar.dataset.duration = '0';
    this.startTime.textContent = '0:00';
    this.currentTime.textContent = '0:00';
    this.durationTime.textContent = '0:00';
  }
}
