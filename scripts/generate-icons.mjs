import { rmSync, mkdirSync, copyFileSync, existsSync, readFileSync, renameSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import iconGen from 'icon-gen';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.join(__dirname, '..');
const workspaceRoot = path.join(projectRoot, '..', '..');
const outputDir = path.join(projectRoot, 'build', 'icons');
const iconsDir = path.join(outputDir, 'icons');
const pngOutputDir = iconsDir;
const macOutputDir = iconsDir;
const winOutputDir = iconsDir;
const pngSizes = [16, 32, 64, 128, 256, 512, 1024];
const windowsIcoSizes = [16, 32, 64, 128, 256];
const assetsDir = path.join(workspaceRoot, 'assets');

function getPngDimensions(filePath) {
  const buffer = readFileSync(filePath);
  if (buffer.length < 24) {
    throw new Error(`File ${filePath} is too small to be a valid PNG.`);
  }
  const signature = buffer.toString('ascii', 12, 16);
  if (signature !== 'IHDR') {
    throw new Error(`File ${filePath} is not a valid PNG (missing IHDR chunk).`);
  }
  const width = buffer.readUInt32BE(16);
  const height = buffer.readUInt32BE(20);
  return { width, height };
}

rmSync(outputDir, { recursive: true, force: true });
mkdirSync(iconsDir, { recursive: true });

console.log('Copying pre-generated PNG icons...');
for (const size of pngSizes) {
  const sourceName = `logo@${size}.png`;
  const sourcePath = path.join(assetsDir, sourceName);
  if (!existsSync(sourcePath)) {
    throw new Error(`Missing ${sourceName} inside ${assetsDir}`);
  }
  const { width, height } = getPngDimensions(sourcePath);
  if (width !== size || height !== size) {
    console.warn(
      `\tWARNING: ${sourceName} is ${width}x${height}, expected ${size}x${size}.`
    );
  }
  const targetName = `${size}.png`;
  const targetPath = path.join(pngOutputDir, targetName);
  copyFileSync(sourcePath, targetPath);
  console.log(`Copied ${sourceName} -> ${targetName}`);
}

await iconGen(pngOutputDir, macOutputDir, {
  icns: { name: 'icon', sizes: pngSizes },
  report: true,
});

await iconGen(pngOutputDir, winOutputDir, {
  ico: { name: 'icon', sizes: windowsIcoSizes },
  report: true,
});

console.log('Renaming PNGs to Electron format');
for (const size of pngSizes) {
  const tmpName = `${size}.png`;
  const finalName = `${size}x${size}.png`;
  const from = path.join(pngOutputDir, tmpName);
  const to = path.join(pngOutputDir, finalName);
  // The PNGs are only needed in Electron's NxN naming convention after icon-gen runs.
  renameSync(from, to);
  console.log(`Renamed ${tmpName} -> ${finalName}`);
}

console.log('\n ALL DONE');
