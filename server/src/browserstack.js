/**
 * VPhone — BrowserStack device backend (dev/testing phase)
 *
 * Each VPhone session = one BrowserStack Automate real-device session.
 * The device runs scrcpy-server, streams via WebRTC through our signalling server.
 *
 * Phase 1: BrowserStack (real devices, immediate, uses existing licence)
 * Phase 2: Replace with QEMU/KVM on Mumbai VM for production
 */

const https = require('https');

// Set BS_USER and BS_KEY in your .env — never hard-code credentials
const BS_USER = process.env.BS_USER;
const BS_KEY  = process.env.BS_KEY;
const BS_AUTH = Buffer.from(`${BS_USER}:${BS_KEY}`).toString('base64');

// Preferred Indian Android devices on BrowserStack
const DEVICE_POOL = [
  { device: 'Samsung Galaxy S23',   os_version: '13.0' },
  { device: 'OnePlus 11R',          os_version: '13.0' },
  { device: 'Samsung Galaxy S22',   os_version: '12.0' },
  { device: 'Xiaomi Redmi Note 11', os_version: '11.0' },
  { device: 'Samsung Galaxy A53',   os_version: '12.0' },
];

// In-memory map of instanceId → BS session
const sessions = new Map();

// ---------------------------------------------------------------------------
// Create a BrowserStack session for a VPhone instance
// ---------------------------------------------------------------------------

async function createSession(instanceId) {
  const device = DEVICE_POOL[Math.floor(Math.random() * DEVICE_POOL.length)];

  const payload = JSON.stringify({
    devices: [`${device.device}-${device.os_version}`],
    app: 'bs://scrcpy-vphone',   // pre-uploaded scrcpy APK (see uploadScrcpy())
    project: 'VPhone',
    build: 'dev',
    name: `vphone-${instanceId}`,
    // Keep session alive while client is streaming
    idleTimeout: 300,
    deviceLogs: false,
    video: false,               // we stream via WebRTC, not BS video
    networkLogs: false,
  });

  const data = await bsRequest('POST', '/app-automate/sessions', payload);
  const sessionId = data?.automation_session?.hashed_id;

  if (!sessionId) throw new Error('BrowserStack session creation failed');

  sessions.set(instanceId, {
    sessionId,
    device: device.device,
    osVersion: device.os_version,
    status: 'booting',
    createdAt: new Date().toISOString(),
  });

  return { sessionId, device: device.device, osVersion: device.os_version };
}

// ---------------------------------------------------------------------------
// Get session status
// ---------------------------------------------------------------------------

async function getSessionStatus(instanceId) {
  const s = sessions.get(instanceId);
  if (!s) return null;

  const data = await bsRequest('GET', `/app-automate/sessions/${s.sessionId}.json`);
  const status = data?.automation_session?.status;

  // Map BS statuses → VPhone statuses
  const statusMap = {
    running:   'running',
    queued:    'booting',
    timeout:   'error',
    stopped:   'stopped',
    error:     'error',
  };

  s.status = statusMap[status] ?? 'booting';
  return s;
}

// ---------------------------------------------------------------------------
// Stop a session
// ---------------------------------------------------------------------------

async function stopSession(instanceId) {
  const s = sessions.get(instanceId);
  if (!s) return;

  await bsRequest('PUT', `/app-automate/sessions/${s.sessionId}.json`,
    JSON.stringify({ status: 'passed', reason: 'VPhone session ended' })
  );

  sessions.delete(instanceId);
}

// ---------------------------------------------------------------------------
// List active sessions for a user
// ---------------------------------------------------------------------------

function listSessions() {
  return Array.from(sessions.entries()).map(([id, s]) => ({
    id,
    ...s,
  }));
}

// ---------------------------------------------------------------------------
// Upload scrcpy APK to BrowserStack (run once during server setup)
// ---------------------------------------------------------------------------

async function uploadScrcpy(apkPath) {
  // Uses multipart form — handled separately via curl in setup.sh
  // Returns the bs:// URL to put in DEVICE_POOL payloads
  console.log('Upload scrcpy APK via:');
  console.log(`curl -u "${BS_USER}:${BS_KEY}" \\`);
  console.log(`  -X POST "https://api-cloud.browserstack.com/app-automate/upload" \\`);
  console.log(`  -F "file=@${apkPath}" \\`);
  console.log(`  -F "custom_id=scrcpy-vphone"`);
}

// ---------------------------------------------------------------------------
// Get available devices
// ---------------------------------------------------------------------------

async function getDevices() {
  return bsRequest('GET', '/app-automate/devices.json');
}

// ---------------------------------------------------------------------------
// HTTP helper
// ---------------------------------------------------------------------------

function bsRequest(method, path, body) {
  return new Promise((resolve, reject) => {
    const opts = {
      hostname: 'api-cloud.browserstack.com',
      path,
      method,
      headers: {
        Authorization: `Basic ${BS_AUTH}`,
        'Content-Type': 'application/json',
        ...(body ? {'Content-Length': Buffer.byteLength(body)} : {}),
      },
    };

    const req = https.request(opts, (res) => {
      let raw = '';
      res.on('data', c => raw += c);
      res.on('end', () => {
        try { resolve(JSON.parse(raw)); }
        catch { resolve(raw); }
      });
    });

    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

module.exports = { createSession, getSessionStatus, stopSession, listSessions, getDevices, uploadScrcpy };
