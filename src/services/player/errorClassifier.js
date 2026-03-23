export function classifyPlaybackError(mediaError) {
  if (!mediaError) {
    return {
      category: 'unknown',
      message: 'Playback failed for an unknown reason.'
    };
  }

  if (mediaError.code === MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED) {
    return {
      category: 'codecOrContainer',
      message: 'Unsupported codec or container for this file.'
    };
  }

  if (mediaError.code === MediaError.MEDIA_ERR_DECODE) {
    return {
      category: 'corruptFile',
      message: 'The file appears to be corrupted or unreadable.'
    };
  }

  if (mediaError.code === MediaError.MEDIA_ERR_NETWORK) {
    return {
      category: 'accessPath',
      message: 'Cannot access this file location.'
    };
  }

  return {
    category: 'unknown',
    message: 'Playback failed. Please try another file.'
  };
}
