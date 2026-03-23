function isExternalFileDrop(dataTransfer) {
  if (!dataTransfer) return false;

  const types = Array.from(dataTransfer.types || []);
  if (types.includes('Files') || types.includes('text/uri-list')) {
    return true;
  }

  const hasFileItem = Array.from(dataTransfer.items || []).some((item) => item.kind === 'file');
  return hasFileItem;
}

function uriToPath(uri) {
  if (!uri || !uri.startsWith('file:///')) return '';

  try {
    const withoutScheme = uri.replace('file:///', '');
    const decoded = decodeURIComponent(withoutScheme);
    const withWindowsDrive = decoded.replace(/^\/?([a-zA-Z]:)/, '$1');
    return withWindowsDrive.replace(/\//g, '\\');
  } catch {
    return '';
  }
}

function looksLikeWindowsPath(value) {
  return /^[a-zA-Z]:[\\/]/.test(value) || value.startsWith('\\\\');
}

function resolveDroppedFilePath(file) {
  if (!file) return '';

  if (typeof window.aftc?.getPathForFile === 'function') {
    const resolved = window.aftc.getPathForFile(file);
    if (resolved && looksLikeWindowsPath(resolved)) {
      return resolved;
    }
  }

  if (typeof file.path === 'string' && file.path) {
    return file.path;
  }

  return '';
}

function extractDroppedPaths(dataTransfer) {
  if (!dataTransfer) return [];

  const candidates = new Set();

  for (const file of Array.from(dataTransfer.files || [])) {
    const resolvedPath = resolveDroppedFilePath(file);
    if (resolvedPath) {
      candidates.add(resolvedPath);
    }
  }

  for (const item of Array.from(dataTransfer.items || [])) {
    const file = item.getAsFile?.();
    const resolvedPath = resolveDroppedFilePath(file);
    if (resolvedPath) {
      candidates.add(resolvedPath);
    }
  }

  const uriList = dataTransfer.getData('text/uri-list');
  if (uriList) {
    for (const line of uriList.split(/\r?\n/)) {
      const value = line.trim();
      if (!value || value.startsWith('#')) continue;
      const resolved = uriToPath(value);
      if (resolved) {
        candidates.add(resolved);
      }
    }
  }

  const plainText = dataTransfer.getData('text/plain');
  if (plainText) {
    for (const line of plainText.split(/\r?\n/)) {
      const value = line.trim().replace(/^"|"$/g, '');
      if (!value) continue;

      if (value.startsWith('file:///')) {
        const resolved = uriToPath(value);
        if (resolved) {
          candidates.add(resolved);
        }
        continue;
      }

      if (looksLikeWindowsPath(value)) {
        candidates.add(value.replace(/\//g, '\\'));
      }
    }
  }

  return Array.from(candidates);
}

export function wireDragAndDrop({ dropOverlayElement, onImportDroppedPaths }) {
  const activeClass = 'active';

  window.addEventListener('dragover', (event) => {
    if (!isExternalFileDrop(event.dataTransfer)) {
      dropOverlayElement.classList.remove(activeClass);
      return;
    }

    event.preventDefault();
    dropOverlayElement.classList.add(activeClass);
  });

  window.addEventListener('dragleave', (event) => {
    if (event.relatedTarget === null) {
      dropOverlayElement.classList.remove(activeClass);
    }
  });

  window.addEventListener('drop', async (event) => {
    if (!isExternalFileDrop(event.dataTransfer)) {
      dropOverlayElement.classList.remove(activeClass);
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    dropOverlayElement.classList.remove(activeClass);

    const filePaths = extractDroppedPaths(event.dataTransfer);

    if (filePaths.length === 0) {
      alert('Drop detected, but no file or folder path could be read from the drag payload.');
      return;
    }

    await onImportDroppedPaths(filePaths);
  });
}
