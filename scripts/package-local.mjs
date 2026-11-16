// Build a self-contained test archive without publishing the patched dependency.
import { execFileSync } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const [libraryPath, version = '0.2.5', destination = tmpdir()] = process.argv.slice(2);
if (!libraryPath || !/^\d+\.\d+\.\d+(?:-[\w.-]+)?$/.test(version)) {
  throw new Error('Usage: node scripts/package-local.mjs <midea-local.tgz> [wrapper-version] [output-directory]');
}
const archive = path.resolve(libraryPath);
const dependency = JSON.parse(execFileSync('tar', ['-xOf', archive, 'package/package.json'], { encoding: 'utf8' }));
if (dependency.name !== 'midea-local' || !/^\d+\.\d+\.\d+(?:-[\w.-]+)?$/.test(dependency.version)) {
  throw new Error('The archive must contain a versioned midea-local package');
}
const stage = mkdtempSync(path.join(tmpdir(), 'midea-wrapper-package-'));
try {
  const manifest = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));
  manifest.version = version;
  manifest.dependencies = { ...manifest.dependencies, 'midea-local': dependency.version };
  manifest.bundleDependencies = ['midea-local'];
  delete manifest.devDependencies;
  writeFileSync(path.join(stage, 'package.json'), JSON.stringify(manifest, null, 2) + '\n');
  for (const file of ['dist', 'README.md', 'LICENSE']) {
    cpSync(path.join(root, file), path.join(stage, file), { recursive: true });
  }
  const npmArgs = ['--ignore-scripts', '--no-audit', '--no-fund', '--cache', path.join(tmpdir(), 'midea-local-package-cache')];
  execFileSync('npm', ['install', ...npmArgs, '--offline', '--no-save', '--package-lock=false', '--omit=dev', archive], { cwd: stage, stdio: 'inherit' });
  const installed = JSON.parse(readFileSync(path.join(stage, 'node_modules/midea-local/package.json'), 'utf8'));
  if (installed.version !== dependency.version) throw new Error('Incorrect bundled library version');
  execFileSync('npm', ['pack', ...npmArgs, '--pack-destination', path.resolve(destination)], { cwd: stage, stdio: 'inherit' });
  console.log(`Created wrapper ${version} with bundled midea-local ${dependency.version}`);
} finally {
  rmSync(stage, { recursive: true, force: true });
}
