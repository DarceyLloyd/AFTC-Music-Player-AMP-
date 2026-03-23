import path from 'node:path';

const protectedRoots = [
  'C:\\Windows',
  'C:\\Program Files',
  'C:\\Program Files (x86)',
  'C:\\ProgramData',
  'C:\\System Volume Information',
  'C:\\$Recycle.Bin'
].map((p) => path.normalize(p).toLowerCase());

export function isProtectedPath(targetPath) {
  if (!targetPath || typeof targetPath !== 'string') {
    return true;
  }

  const normalized = path.normalize(targetPath).toLowerCase();
  return protectedRoots.some((root) => normalized === root || normalized.startsWith(`${root}${path.sep}`));
}

export function sanitizeAndValidatePaths(paths) {
  if (!Array.isArray(paths)) {
    return { valid: [], rejected: ['Invalid path payload.'] };
  }

  const valid = [];
  const rejected = [];

  for (const rawPath of paths) {
    if (typeof rawPath !== 'string' || !rawPath.trim()) {
      rejected.push('Ignored empty path.');
      continue;
    }

    const trimmed = rawPath.trim();
    if (isProtectedPath(trimmed)) {
      rejected.push(`Blocked protected path: ${trimmed}`);
      continue;
    }

    valid.push(path.normalize(trimmed));
  }

  return { valid, rejected };
}
