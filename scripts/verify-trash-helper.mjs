import fs from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const candidates = [
  path.join(root, 'dist', 'win-unpacked', 'resources', 'app.asar.unpacked', 'node_modules', 'trash', 'lib', 'windows-trash.exe'),
  path.join(root, 'dist', 'win-unpacked', 'resources', 'app.asar.unpacked', 'node_modules', 'recycle-bin', 'recycle-bin.exe')
];

async function exists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

const found = [];
for (const candidate of candidates) {
  if (await exists(candidate)) {
    found.push(candidate);
  }
}

if (found.length > 0) {
  console.log('Trash helper verification passed. Found:');
  for (const filePath of found) {
    console.log(`- ${filePath}`);
  }
  process.exit(0);
}

console.error('Trash helper verification failed. No Windows trash helper executable was found.');
console.error('Expected one of:');
for (const candidate of candidates) {
  console.error(`- ${candidate}`);
}
process.exit(1);
