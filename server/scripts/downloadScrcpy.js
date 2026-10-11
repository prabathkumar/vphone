#!/usr/bin/env node
/**
 * Download scrcpy-server.jar from the official GitHub release.
 * Run: npm run download-scrcpy
 */

'use strict';

const https   = require('https');
const fs      = require('fs');
const path    = require('path');

const VERSION   = process.env.SCRCPY_VERSION || '2.4';
const OUT_DIR   = path.join(__dirname, '../assets');
const OUT_FILE  = path.join(OUT_DIR, 'scrcpy-server.jar');
const RELEASE   = `https://github.com/Genymobile/scrcpy/releases/download/v${VERSION}/scrcpy-server-v${VERSION}`;

if (fs.existsSync(OUT_FILE)) {
  console.log(`✓ scrcpy-server.jar already exists at ${OUT_FILE}`);
  console.log('  Delete it and re-run to refresh.');
  process.exit(0);
}

fs.mkdirSync(OUT_DIR, { recursive: true });

console.log(`Downloading scrcpy-server v${VERSION}...`);
console.log(`  from: ${RELEASE}`);
console.log(`  to:   ${OUT_FILE}`);

function download(url, dest) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    https.get(url, (res) => {
      // Follow redirects (GitHub releases redirect to objects.githubusercontent.com)
      if (res.statusCode === 301 || res.statusCode === 302) {
        file.close();
        fs.unlinkSync(dest);
        return download(res.headers.location, dest).then(resolve).catch(reject);
      }
      if (res.statusCode !== 200) {
        file.close();
        fs.unlinkSync(dest);
        return reject(new Error(`HTTP ${res.statusCode} from ${url}`));
      }

      let bytes = 0;
      res.on('data', chunk => {
        bytes += chunk.length;
        process.stdout.write(`\r  ${(bytes / 1024).toFixed(0)} KB`);
      });
      res.pipe(file);
      file.on('finish', () => { file.close(); console.log('\n✓ Done'); resolve(); });
    }).on('error', (e) => { fs.unlink(dest, () => {}); reject(e); });
  });
}

download(RELEASE, OUT_FILE)
  .then(() => {
    console.log('\nNext step — upload to BrowserStack:');
    console.log('  npm run upload-scrcpy-to-bs');
  })
  .catch(err => {
    console.error('\n✗ Download failed:', err.message);
    process.exit(1);
  });
