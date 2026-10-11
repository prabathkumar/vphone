#!/usr/bin/env node
/**
 * Upload scrcpy-server.jar to BrowserStack App Automate.
 * The returned bs:// URL is what goes in browserstack.js DEVICE_POOL payloads.
 *
 * Run: npm run upload-scrcpy-to-bs
 * Requires: BS_USER and BS_KEY in .env (or environment)
 */

'use strict';

require('dotenv').config();

const https    = require('https');
const fs       = require('fs');
const path     = require('path');
const { execSync } = require('child_process');

const BS_USER = process.env.BS_USER;
const BS_KEY  = process.env.BS_KEY;
const JAR     = path.join(__dirname, '../assets/scrcpy-server.jar');

if (!BS_USER || !BS_KEY) {
  console.error('✗ BS_USER and BS_KEY must be set in .env');
  process.exit(1);
}

if (!fs.existsSync(JAR)) {
  console.error(`✗ scrcpy-server.jar not found at ${JAR}`);
  console.error('  Run: npm run download-scrcpy');
  process.exit(1);
}

console.log('Uploading scrcpy-server.jar to BrowserStack...');
console.log(`  User: ${BS_USER}`);
console.log(`  File: ${JAR}`);

// BrowserStack upload requires multipart/form-data.
// Node's built-in https can't do multipart easily — use curl which is
// always available in any Unix dev/deploy environment.
try {
  const result = execSync(
    `curl -s -u "${BS_USER}:${BS_KEY}" ` +
    `-X POST "https://api-cloud.browserstack.com/app-automate/upload" ` +
    `-F "file=@${JAR}" ` +
    `-F "custom_id=scrcpy-vphone"`,
    { encoding: 'utf8' }
  );

  const json = JSON.parse(result);

  if (json.app_url) {
    console.log('\n✓ Upload successful!');
    console.log(`  app_url:   ${json.app_url}`);
    console.log(`  custom_id: scrcpy-vphone`);
    console.log('\nIn browserstack.js the app field is already set to "bs://scrcpy-vphone"');
    console.log('(custom_id means you can re-upload without changing the config)');
  } else {
    console.error('\n✗ Unexpected response:', JSON.stringify(json, null, 2));
    process.exit(1);
  }
} catch (err) {
  console.error('\n✗ Upload failed:', err.message);
  process.exit(1);
}
