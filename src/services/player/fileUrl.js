export function pathToFileUrl(filePath) {
  const normalized = filePath.replace(/\\/g, '/');
  const encoded = normalized
    .split('/')
    .map((part) => encodeURIComponent(part).replace(/%3A/g, ':'))
    .join('/');
  return `file:///${encoded}`;
}
