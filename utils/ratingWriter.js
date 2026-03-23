import fs from 'node:fs';
import fsPromises from 'node:fs/promises';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import NodeID3 from 'node-id3';
import flacMetadata from 'flac-metadata';

const { Processor, data } = flacMetadata;

export async function writeTrackRating(filePath, rating) {
  const ext = path.extname(filePath).toLowerCase();
  const normalizedRating = normalizeStars(rating);

  if (ext === '.mp3') {
    await writeMp3Rating(filePath, normalizedRating);
    return;
  }

  if (ext === '.flac') {
    await writeFlacRating(filePath, normalizedRating);
    return;
  }

  throw new Error('Ratings are supported only for MP3 and FLAC files.');
}

function normalizeStars(rating) {
  const numeric = Number(rating);
  if (!Number.isFinite(numeric)) return 0;
  return Math.max(0, Math.min(5, Math.round(numeric)));
}

async function writeMp3Rating(filePath, rating) {
  const popm = starsToPopm(rating);
  const ok = NodeID3.update(
    {
      popularimeter: {
        email: 'aftc@local',
        rating: popm,
        counter: 0
      }
    },
    filePath
  );

  if (!ok) {
    throw new Error('Failed to update MP3 ID3 rating tag.');
  }
}

function starsToPopm(stars) {
  const map = [0, 1, 64, 128, 196, 255];
  return map[stars] ?? 0;
}

async function writeFlacRating(filePath, rating) {
  const tempPath = `${filePath}.aftc-rating.tmp`;
  const processor = new Processor({ parseMetaDataBlocks: true });

  let pendingVorbisBlock = null;
  let injected = false;

  processor.on('preprocess', (mdb) => {
    if (mdb.type === Processor.MDB_TYPE_VORBIS_COMMENT) {
      const vendor = mdb.vendor || 'AFTC Music Player';
      const comments = Array.isArray(mdb.comments) ? mdb.comments : [];
      pendingVorbisBlock = createVorbisWithRating(vendor, comments, rating);
      mdb.remove();
      return;
    }

    if (mdb.isLast && !pendingVorbisBlock) {
      mdb.isLast = false;
      pendingVorbisBlock = createVorbisWithRating('AFTC Music Player', [], rating);
    }
  });

  processor.on('postprocess', function onPostprocess() {
    if (!pendingVorbisBlock || injected) return;
    injected = true;
    this.push(pendingVorbisBlock.publish());
  });

  try {
    await pipeline(fs.createReadStream(filePath), processor, fs.createWriteStream(tempPath));
    await fsPromises.copyFile(tempPath, filePath);
  } finally {
    await fsPromises.unlink(tempPath).catch(() => {});
  }
}

function createVorbisWithRating(vendor, comments, rating) {
  const nextComments = comments.filter((entry) => {
    const key = String(entry).split('=')[0]?.trim().toUpperCase();
    return key !== 'RATING' && key !== 'FMPS_RATING';
  });

  if (rating > 0) {
    nextComments.push(`RATING=${rating}`);
    nextComments.push(`FMPS_RATING=${(rating / 5).toFixed(2)}`);
  }

  return data.MetaDataBlockVorbisComment.create(true, vendor, nextComments);
}