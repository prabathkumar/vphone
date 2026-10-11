/**
 * VPhone — Android Instance Manager
 *
 * Backend is selected via ANDROID_BACKEND env var:
 *   "browserstack"  — BrowserStack real devices (dev / testing phase)
 *   "qemu"          — QEMU/KVM on a Mumbai VM (production)
 *
 * Default: browserstack (so development works out of the box)
 */

const { execSync, spawn } = require('child_process');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const fs   = require('fs');

const BACKEND       = process.env.ANDROID_BACKEND || 'browserstack';
const IMAGES_DIR    = process.env.ANDROID_IMAGES_DIR || '/opt/vphone/android-images';
const INSTANCES_DIR = process.env.INSTANCES_DIR      || '/opt/vphone/instances';

// Lazy-load the BrowserStack module only when needed
const bs = BACKEND === 'browserstack' ? require('./browserstack') : null;

// Signalling server WebSocket URL (bridge connects back to self)
const SIGNALLING_WS = process.env.SIGNALLING_WS_URL || 'ws://localhost:3000/ws';

// Active bridges: instanceId → ScrcpyBridge
const bridges = new Map();

// Lazy-require bridge (depends on wrtc which is optional in dev)
function getBridgeClass() {
  try { return require('./scrcpyBridge').ScrcpyBridge; }
  catch (e) { console.warn('[InstanceManager] ScrcpyBridge unavailable:', e.message); return null; }
}

// In-memory store (replace with Redis/DB in production)
const instances = new Map();

/**
 * Create a new Android instance for a user.
 */
async function create({ region, plan, androidVersion, userId }) {
  const id = uuidv4();

  const instance = {
    id,
    userId,
    region: region || 'india-mumbai',
    plan:   plan   || 'basic',
    androidVersion: androidVersion || 13,
    status: 'booting',
    backend: BACKEND,
    createdAt: new Date().toISOString(),
    sessionToken: uuidv4(),
  };

  instances.set(id, instance);

  if (BACKEND === 'browserstack') {
    // BrowserStack real-device session
    bs.createSession(id)
      .then(async ({ sessionId, device, osVersion, adbSerial }) => {
        const inst = instances.get(id);
        if (!inst) return;

        inst.bsSessionId = sessionId;
        inst.device      = device;
        inst.osVersion   = osVersion;
        inst.status      = 'running';
        console.log(`BS session ${sessionId} ready for instance ${id} on ${device}`);

        // Start the scrcpy WebRTC bridge for this session
        const BridgeClass = getBridgeClass();
        if (BridgeClass) {
          // adbSerial is provided by BrowserStack's remote ADB endpoint
          // If not returned, fall back to a placeholder (manual setup needed)
          const serial = adbSerial || inst.adbSerial || `bs-${sessionId}`;
          const bridge = new BridgeClass(id, serial, SIGNALLING_WS);
          bridges.set(id, bridge);
          bridge.start().catch(err => {
            console.error(`Bridge start failed for ${id}:`, err.message);
            inst.status = 'error';
          });
        } else {
          console.warn(`[InstanceManager] No bridge — video won't stream for ${id}`);
        }
      })
      .catch(err => {
        console.error(`BrowserStack boot failed for ${id}:`, err.message);
        const inst = instances.get(id);
        if (inst) inst.status = 'error';
      });
  } else {
    // QEMU/KVM path (production Mumbai VM)
    const port = await getFreePort();
    instance.port = port;
    bootAndroid(id, port, androidVersion || 13).catch(err => {
      console.error(`QEMU boot failed for ${id}:`, err);
      const inst = instances.get(id);
      if (inst) inst.status = 'error';
    });
  }

  return { id, status: 'starting', region, androidVersion };
}

/**
 * Get instance details (only for owning user).
 */
async function get(id, userId) {
  const inst = instances.get(id);
  if (!inst) return null;
  if (inst.userId !== userId) return null;
  return inst;
}

/**
 * Destroy an instance.
 */
async function destroy(id, userId) {
  const inst = instances.get(id);
  if (!inst || inst.userId !== userId) throw new Error('Not found');

  // Stop scrcpy bridge
  const bridge = bridges.get(id);
  if (bridge) { bridge.stop(); bridges.delete(id); }

  // Stop BrowserStack session
  if (BACKEND === 'browserstack' && inst.bsSessionId && bs) {
    bs.stopSession(id).catch(e => console.error(`BS stop failed for ${id}:`, e.message));
  }

  // Kill QEMU process
  try {
    execSync(`pkill -f "vphone-${id}"`, { stdio: 'ignore' });
  } catch (_) { /* already dead */ }

  // Clean up disk image
  const diskPath = path.join(INSTANCES_DIR, `${id}.qcow2`);
  if (fs.existsSync(diskPath)) fs.unlinkSync(diskPath);

  instances.delete(id);
}

/**
 * Boot Android in QEMU with scrcpy-server for screen streaming.
 */
async function bootAndroid(id, port, androidVersion) {
  const inst = instances.get(id);
  const diskPath = path.join(INSTANCES_DIR, `${id}.qcow2`);
  const isoPath  = path.join(IMAGES_DIR, `android-${androidVersion}.iso`);

  if (!fs.existsSync(isoPath)) {
    throw new Error(`Android ${androidVersion} image not found at ${isoPath}. Run: npm run download-image`);
  }

  // Create a fresh 8GB disk image for this instance
  execSync(`qemu-img create -f qcow2 ${diskPath} 8G`);

  // Launch QEMU (ARM64 for Oracle Ampere, x86_64 for AWS/GCP)
  const qemuBin = process.env.QEMU_BIN || 'qemu-system-x86_64';
  const args = [
    '-name', `vphone-${id}`,
    '-m', '2048',
    '-smp', '2',
    '-enable-kvm',
    '-cpu', 'host',
    '-hda', diskPath,
    '-cdrom', isoPath,
    '-boot', 'd',
    '-net', 'nic',
    '-net', `user,hostfwd=tcp::${port}-:5555`,  // ADB port
    '-vga', 'virtio',
    '-display', 'none',  // headless — we stream via scrcpy
    '-serial', 'none',
    '-parallel', 'none',
  ];

  const proc = spawn(qemuBin, args, {
    detached: true,
    stdio: 'ignore',
  });
  proc.unref();

  inst.pid = proc.pid;
  inst.adbPort = port;

  // Wait for ADB to be available (~30s for boot)
  await waitForAdb(port, 60000);

  // Push scrcpy-server and start streaming
  execSync(`adb connect 127.0.0.1:${port}`);
  execSync(`adb -s 127.0.0.1:${port} push ./scrcpy-server.jar /data/local/tmp/`);

  inst.status = 'running';
  console.log(`Instance ${id} is running on ADB port ${port}`);
}

/**
 * Poll ADB port until Android boots.
 */
function waitForAdb(port, timeoutMs) {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const check = () => {
      try {
        execSync(`nc -z 127.0.0.1 ${port}`, { stdio: 'ignore' });
        resolve();
      } catch {
        if (Date.now() - start > timeoutMs) {
          reject(new Error(`ADB timeout on port ${port}`));
        } else {
          setTimeout(check, 2000);
        }
      }
    };
    setTimeout(check, 5000);
  });
}

let nextPort = 5600;
async function getFreePort() {
  return nextPort++;
}

function listForUser(userId) {
  return Array.from(instances.values()).filter((i) => i.userId === userId);
}

module.exports = { create, get, destroy, listForUser };
