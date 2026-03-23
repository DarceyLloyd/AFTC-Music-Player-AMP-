import path from 'node:path';
import { parseFile } from 'music-metadata';

export async function readMetadata(filePath) {
  try {
    const metadata = await parseFile(filePath, { duration: true });
    const rating = extractRating(metadata);
    return {
      artist: metadata.common.artist || 'Unknown Artist',
      album: metadata.common.album || 'Unknown Album',
      title: metadata.common.title || path.basename(filePath),
      rating,
      year: metadata.common.year || '',
      durationSeconds: Number.isFinite(metadata.format.duration) ? metadata.format.duration : 0,
      duration: formatTime(metadata.format.duration || 0),
      bitrate: metadata.format.bitrate ? `${Math.round(metadata.format.bitrate / 1000)}kbps` : '',
      sampleRate: metadata.format.sampleRate ? `${(metadata.format.sampleRate / 1000).toFixed(1)}kHz` : '',
      format: path.extname(filePath).slice(1).toUpperCase() || 'UNKNOWN'
    };
  } catch (error) {
    return {
      artist: 'Unknown Artist',
      album: 'Unknown Album',
      title: path.basename(filePath),
      rating: 0,
      year: '',
      durationSeconds: 0,
      duration: '0:00',
      bitrate: '',
      sampleRate: '',
      format: path.extname(filePath).slice(1).toUpperCase() || 'UNKNOWN',
      metadataError: error.message
    };
  }
}

function extractRating(metadata) {
  const native = metadata?.native;
  if (native && typeof native === 'object') {
    for (const tags of Object.values(native)) {
      if (!Array.isArray(tags)) continue;

      for (const tag of tags) {
        const id = String(tag?.id || '').toUpperCase();
        const value = tag?.value;

        if (id === 'POPM' || id.includes('POPULARIMETER')) {
          const parsed = popmToStars(parseNumeric(value));
          if (parsed > 0) return parsed;
        }

        if (id === 'RATING') {
          const parsed = normalizeRating(parseNumeric(value), 5);
          if (parsed > 0) return parsed;
        }

        if (id === 'FMPS_RATING') {
          const parsed = normalizeRating(parseNumeric(value), 1);
          if (parsed > 0) return parsed;
        }
      }
    }
  }

  const commonRating = extractFromCommonRating(metadata?.common?.rating);
  if (commonRating > 0) {
    return commonRating;
  }

  return 0;
}

function extractFromCommonRating(rawRating) {
  if (Array.isArray(rawRating) && rawRating.length > 0) {
    const values = rawRating
      .map((entry) => normalizeRating(parseNumeric(entry?.rating), 1))
      .filter((value) => value > 0);
    return values.length > 0 ? values[0] : 0;
  }

  if (typeof rawRating === 'number') {
    return normalizeRating(rawRating, 1);
  }

  return 0;
}

function parseNumeric(value) {
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : NaN;
  }

  if (value && typeof value === 'object') {
    if (typeof value.rating === 'number') return value.rating;
    if (typeof value.average === 'number') return value.average;
  }

  return NaN;
}

function popmToStars(value) {
  if (!Number.isFinite(value) || value <= 0) return 0;
  const popm = Math.max(1, Math.min(255, Math.round(value)));

  if (popm <= 1) return 1;
  if (popm <= 64) return 2;
  if (popm <= 128) return 3;
  if (popm <= 196) return 4;
  return 5;
}

function normalizeRating(value, maxInput) {
  if (!Number.isFinite(value) || value <= 0) return 0;
  const scaled = maxInput === 1 ? Math.ceil(value * 5) : value;
  return Math.max(1, Math.min(5, Math.round(scaled)));
}

export async function readMetadataBatch(filePaths, concurrency = 4) {
  const safeConcurrency = Math.max(1, Math.min(12, Number(concurrency) || 4));
  const results = new Map();
  let cursor = 0;

  async function worker() {
    while (cursor < filePaths.length) {
      const index = cursor;
      cursor += 1;
      const filePath = filePaths[index];
      results.set(filePath, await readMetadata(filePath));
    }
  }

  const workers = Array.from({ length: safeConcurrency }, () => worker());
  await Promise.all(workers);
  return results;
}

export function formatTime(totalSeconds) {
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
