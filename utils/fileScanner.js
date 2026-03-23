import fs from 'node:fs/promises';
import path from 'node:path';
import { isProtectedPath } from './pathPolicy.js';

const SUPPORTED_EXTENSIONS = new Set(['.mp3', '.wav', '.flac']);

export function isSupportedAudioFile(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return SUPPORTED_EXTENSIONS.has(ext);
}

export async function scanFolderRecursive(folderPath) {
  const queue = [folderPath];
  const files = [];
  const failures = [];

  while (queue.length > 0) {
    const current = queue.shift();

    try {
      if (isProtectedPath(current)) {
        failures.push({ filePath: current, reason: 'Blocked protected folder.' });
        continue;
      }

      const dirents = await fs.readdir(current, { withFileTypes: true });

      for (const dirent of dirents) {
        const fullPath = path.join(current, dirent.name);

        if (dirent.isDirectory()) {
          queue.push(fullPath);
          continue;
        }

        if (!dirent.isFile()) {
          continue;
        }

        if (isSupportedAudioFile(fullPath)) {
          files.push(toTrackItem(fullPath));
        }
      }
    } catch (error) {
      failures.push({ filePath: current, reason: `Scan failed: ${error.message}` });
    }
  }

  files.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));

  return { files, failures };
}

export async function collectFromMixedPaths(paths) {
  const files = [];
  const failures = [];

  for (const inputPath of paths) {
    try {
      if (isProtectedPath(inputPath)) {
        failures.push({ filePath: inputPath, reason: 'Blocked protected path.' });
        continue;
      }

      const stat = await fs.stat(inputPath);
      if (stat.isDirectory()) {
        const result = await scanFolderRecursive(inputPath);
        files.push(...result.files);
        failures.push(...result.failures);
        continue;
      }

      if (stat.isFile()) {
        if (isSupportedAudioFile(inputPath)) {
          files.push(toTrackItem(inputPath));
        } else {
          failures.push({ filePath: inputPath, reason: 'Unsupported file extension.' });
        }
      }
    } catch (error) {
      failures.push({ filePath: inputPath, reason: `Path access failed: ${error.message}` });
    }
  }

  const dedup = deduplicateTracks(files);
  dedup.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));
  return { files: dedup, failures };
}

function deduplicateTracks(tracks) {
  const seen = new Set();
  return tracks.filter((track) => {
    if (seen.has(track.path)) {
      return false;
    }
    seen.add(track.path);
    return true;
  });
}

function toTrackItem(filePath) {
  const name = path.basename(filePath);
  return {
    id: `${filePath}`,
    name,
    path: filePath,
    ext: path.extname(filePath).toLowerCase()
  };
}
