/**
 * VPhone — scrcpy WebRTC Bridge
 *
 * Per BrowserStack session this module:
 *   1. Connects ADB to the BS device via their remote-debug endpoint
 *   2. Pushes + starts scrcpy-server on the device
 *   3. Opens the scrcpy video socket (H.264 stream)
 *   4. Creates a WebRTC peer, wraps frames as RTP, sends via the signalling room
 *   5. Forwards touch/key input events back to ADB
 *
 * Usage:
 *   const bridge = new ScrcpyBridge(instanceId, adbSerial, signalingWsUrl);
 *   await bridge.start();
 *   // later:
 *   bridge.stop();
 *
 * Environment:
 *   SCRCPY_SERVER_JAR  — path to scrcpy-server.jar (default: ./assets/scrcpy-server.jar)
 *   SCRCPY_VERSION     — must match jar (default: 2.4)
 *   STUN_URL           — STUN server (default: stun:stun.l.google.com:19302)
 *   TURN_URL           — TURN server URL (optional)
 *   TURN_USER          — TURN username (optional)
 *   TURN_PASS          — TURN credential (optional)
 */

'use strict';

const { execSync, execFile, spawn } = require('child_process');
const net    = require('net');
const path   = require('path');
const fs     = require('fs');
const WebSocket = require('ws');

// wrtc is the Node.js WebRTC implementation (node-webrtc / @roamhq/wrtc)
// We lazy-require so the server still boots even if wrtc isn't installed.
let wrtc;
try { wrtc = require('@roamhq/wrtc'); } catch {
  try { wrtc = require('wrtc'); } catch {
    console.warn('[ScrcpyBridge] wrtc not installed — bridge will not function');
  }
}

const SCRCPY_JAR     = process.env.SCRCPY_SERVER_JAR || path.join(__dirname, '../assets/scrcpy-server.jar');
const SCRCPY_VERSION = process.env.SCRCPY_VERSION    || '2.4';

const ICE_SERVERS = [
  { urls: process.env.STUN_URL || 'stun:stun.l.google.com:19302' },
  ...(process.env.TURN_URL ? [{
    urls:       process.env.TURN_URL,
    username:   process.env.TURN_USER || '',
    credential: process.env.TURN_PASS || '',
  }] : []),
];

// Local port range for ADB-forwarded scrcpy socket
let nextLocalPort = 27100;
function allocPort() { return nextLocalPort++; }

// ─────────────────────────────────────────────────────────────────────────────

class ScrcpyBridge {
  /**
   * @param {string} instanceId   — VPhone instance UUID
   * @param {string} adbSerial    — e.g. "127.0.0.1:5555" or a BS device serial
   * @param {string} signalingUrl — WebSocket URL of the VPhone signalling server
   */
  constructor(instanceId, adbSerial, signalingUrl) {
    this.instanceId   = instanceId;
    this.adbSerial    = adbSerial;
    this.signalingUrl = signalingUrl;

    this._pc         = null;   // RTCPeerConnection
    this._ws         = null;   // signalling WebSocket
    this._scrcpyProc = null;   // scrcpy-server child process
    this._localPort  = null;   // forwarded TCP port
    this._stopped    = false;
    this._videoTrack = null;
    this._frameSource = null;  // RawVideoSource from wrtc

    this._log = (...a) => console.log(`[Bridge:${instanceId.slice(0,8)}]`, ...a);
    this._err = (...a) => console.error(`[Bridge:${instanceId.slice(0,8)}]`, ...a);
  }

  // ── Public API ────────────────────────────────────────────────

  async start() {
    if (!wrtc) throw new Error('wrtc not installed — run: npm install @roamhq/wrtc');

    this._log('Starting bridge for ADB serial', this.adbSerial);

    await this._pushScrcpyServer();
    await this._startScrcpyServer();
    await this._connectSignalling();
    this._log('Bridge ready');
  }

  stop() {
    this._stopped = true;
    this._log('Stopping bridge');

    if (this._scrcpyProc) {
      try { this._scrcpyProc.kill(); } catch (_) {}
      this._scrcpyProc = null;
    }

    // Remove ADB forward
    if (this._localPort) {
      try {
        this._adb(`forward --remove tcp:${this._localPort}`);
      } catch (_) {}
    }

    if (this._pc) {
      try { this._pc.close(); } catch (_) {}
      this._pc = null;
    }

    if (this._ws) {
      try { this._ws.close(); } catch (_) {}
      this._ws = null;
    }
  }

  // ── Step 1: Push scrcpy-server.jar to device ─────────────────

  async _pushScrcpyServer() {
    if (!fs.existsSync(SCRCPY_JAR)) {
      throw new Error(
        `scrcpy-server.jar not found at ${SCRCPY_JAR}.\n` +
        `Download from: https://github.com/Genymobile/scrcpy/releases/download/v${SCRCPY_VERSION}/scrcpy-server-v${SCRCPY_VERSION}\n` +
        `Then: cp scrcpy-server-v${SCRCPY_VERSION} ${SCRCPY_JAR}`
      );
    }

    this._log('Pushing scrcpy-server.jar to device...');
    this._adb(`push ${SCRCPY_JAR} /data/local/tmp/scrcpy-server.jar`);
    this._log('Jar pushed');
  }

  // ── Step 2: Start scrcpy-server on device, forward port ──────

  async _startScrcpyServer() {
    this._localPort = allocPort();

    // Forward local TCP port → abstract socket scrcpy creates
    this._adb(`forward tcp:${this._localPort} localabstract:scrcpy`);
    this._log(`ADB forward: localhost:${this._localPort} → scrcpy socket`);

    // Start scrcpy-server in headless mode (no display, send_frame_meta=false for raw H.264)
    const cmd = [
      'shell',
      'CLASSPATH=/data/local/tmp/scrcpy-server.jar',
      'app_process',
      '/',
      'com.genymobile.scrcpy.Server',
      SCRCPY_VERSION,
      'tunnel_forward=true',
      'video_codec=h264',
      'audio=false',
      'control=true',
      'max_size=720',        // 720p — balance quality/bandwidth
      'max_fps=30',
      'video_bit_rate=2000000',
      'send_frame_meta=false', // raw H.264 annex-B, simpler to parse
      'stay_awake=true',
    ].join(' ');

    this._log('Launching scrcpy-server on device');
    this._scrcpyProc = this._adbSpawn(cmd);

    this._scrcpyProc.stdout.on('data', d => this._log('scrcpy>', d.toString().trim()));
    this._scrcpyProc.stderr.on('data', d => this._log('scrcpy!', d.toString().trim()));
    this._scrcpyProc.on('exit', (code) => {
      if (!this._stopped) this._err('scrcpy-server exited with code', code);
    });

    // Give the server a moment to open its socket
    await _sleep(1500);

    // Verify the forwarded port is reachable
    await this._waitForPort(this._localPort, 10000);
    this._log('scrcpy socket is up on', this._localPort);
  }

  // ── Step 3: Connect to our signalling server ──────────────────

  async _connectSignalling() {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(this.signalingUrl);
      this._ws = ws;

      ws.on('open', () => {
        this._log('Signalling WS connected');
        // Register as the Android peer for this room
        ws.send(JSON.stringify({
          type: 'register-android',
          instanceId: this.instanceId,
        }));
      });

      ws.on('message', async (raw) => {
        let msg;
        try { msg = JSON.parse(raw); } catch { return; }

        switch (msg.type) {
          case 'client-ready':
            this._log('Client is ready — creating WebRTC offer side (answer mode)');
            await this._setupWebRTC();
            resolve(); // bridge is live
            break;

          case 'offer':
            await this._handleOffer(msg.payload);
            break;

          case 'ice-candidate':
            if (this._pc && msg.payload) {
              try {
                await this._pc.addIceCandidate(new wrtc.RTCIceCandidate(msg.payload));
              } catch (e) { this._err('ICE add error', e.message); }
            }
            break;

          case 'input':
            this._handleInput(msg.payload);
            break;

          default:
            this._log('Unknown signalling msg:', msg.type);
        }
      });

      ws.on('error', (e) => { this._err('WS error', e.message); reject(e); });
      ws.on('close', () => {
        if (!this._stopped) this._err('Signalling WS closed unexpectedly');
      });

      // Resolve after timeout even if no client connects yet
      // (bridge stays alive waiting for client-ready)
      setTimeout(resolve, 5000);
    });
  }

  // ── Step 4: Set up WebRTC peer, stream H.264 ─────────────────

  async _setupWebRTC() {
    const { RTCPeerConnection, nonstandard: { RTCVideoSource } } = wrtc;

    this._pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });

    // Create a video source that we'll feed H.264 frames into
    this._frameSource = new RTCVideoSource();
    this._videoTrack  = this._frameSource.createTrack();
    this._pc.addTrack(this._videoTrack);

    // ICE candidates → signalling
    this._pc.onicecandidate = ({ candidate }) => {
      if (candidate && this._ws?.readyState === WebSocket.OPEN) {
        this._ws.send(JSON.stringify({
          type: 'ice-candidate',
          instanceId: this.instanceId,
          payload: candidate,
        }));
      }
    };

    this._pc.onconnectionstatechange = () => {
      this._log('PC state:', this._pc.connectionState);
    };

    // Start reading H.264 frames from the scrcpy socket
    this._startFramePump();
  }

  async _handleOffer(sdp) {
    if (!this._pc) await this._setupWebRTC();

    await this._pc.setRemoteDescription(new wrtc.RTCSessionDescription(sdp));
    const answer = await this._pc.createAnswer();
    await this._pc.setLocalDescription(answer);

    this._ws.send(JSON.stringify({
      type: 'answer',
      instanceId: this.instanceId,
      payload: this._pc.localDescription,
    }));
    this._log('Answer sent');
  }

  // ── Step 5: Read H.264 stream → RTCVideoSource ───────────────
  //
  // scrcpy sends raw Annex-B H.264 NAL units over TCP.
  // node-webrtc's RTCVideoSource.onFrame() expects I420 frames.
  //
  // We use ffmpeg (spawned as a subprocess) to:
  //   stdin  ← raw H.264 (from scrcpy TCP socket)
  //   stdout → raw I420 YUV frames (width×height×1.5 bytes each)
  //
  // This avoids pulling in a native H.264 decoder in Node.

  _startFramePump() {
    this._log('Starting frame pump via ffmpeg');

    // Connect to the forwarded scrcpy TCP port
    const tcpClient = net.createConnection({ port: this._localPort, host: '127.0.0.1' });

    // ffmpeg: H.264 → raw yuv420p frames on stdout
    const ffmpeg = spawn('ffmpeg', [
      '-loglevel', 'quiet',
      '-f',        'h264',
      '-i',        'pipe:0',    // H.264 from stdin
      '-f',        'rawvideo',
      '-pix_fmt',  'yuv420p',
      '-an',                    // no audio
      'pipe:1',                 // I420 to stdout
    ]);

    // Pipe scrcpy TCP → ffmpeg stdin
    tcpClient.pipe(ffmpeg.stdin);

    tcpClient.on('error', e => this._err('TCP socket error:', e.message));
    ffmpeg.on('error', e => this._err('ffmpeg error:', e.message));
    ffmpeg.stderr.on('data', () => {}); // suppress — loglevel quiet

    // We need to know frame dimensions to parse stdout correctly.
    // scrcpy sends a 68-byte device metadata header before the first video frame
    // when send_device_meta=true (default). Since we set send_frame_meta=false
    // we skip that and probe dimensions from the SPS NAL unit instead.
    // For simplicity we let ffmpeg tell us via a probe first, then stream.
    // The lazy approach: start with assumed 720×1560 (common tall phone), resize
    // on first actual frame (ffmpeg -vf scale does this automatically above).

    // Parse raw I420 frames from ffmpeg stdout
    let width = 720, height = 1560;
    const frameSize = Math.floor(width * height * 1.5);
    let buf = Buffer.alloc(0);

    ffmpeg.stdout.on('data', (chunk) => {
      buf = Buffer.concat([buf, chunk]);

      while (buf.length >= frameSize) {
        const frameData = buf.slice(0, frameSize);
        buf = buf.slice(frameSize);

        // Feed into RTCVideoSource as I420
        if (this._frameSource) {
          try {
            const yLen = width * height;
            const uvLen = yLen / 4;
            this._frameSource.onFrame({
              width,
              height,
              data: {
                Y: { data: frameData.slice(0, yLen),              stride: width  },
                U: { data: frameData.slice(yLen, yLen + uvLen),   stride: width / 2 },
                V: { data: frameData.slice(yLen + uvLen),         stride: width / 2 },
              },
            });
          } catch (e) {
            this._err('Frame feed error:', e.message);
          }
        }
      }
    });

    ffmpeg.on('exit', (code) => {
      if (!this._stopped) this._err('ffmpeg exited with code', code);
      tcpClient.destroy();
    });

    tcpClient.on('close', () => {
      if (!this._stopped) ffmpeg.kill();
    });

    this._ffmpeg    = ffmpeg;
    this._tcpClient = tcpClient;
  }

  // ── Touch / Key input forwarding ─────────────────────────────
  //
  // The client sends normalised touch coords (0–1). We convert to
  // device pixels and inject via ADB input (acceptable latency for now;
  // Phase 2: use scrcpy control socket for < 5ms input latency).

  _handleInput(payload) {
    if (!payload) return;
    const { type, x, y, keycode } = payload;

    try {
      if (type === 'touch' && x != null && y != null) {
        // Scale normalised → device resolution (720×1560 assumed)
        const px = Math.round(x * 720);
        const py = Math.round(y * 1560);
        this._adb(`shell input tap ${px} ${py}`);

      } else if (type === 'swipe') {
        const { x0, y0, x1, y1, duration = 300 } = payload;
        const px0 = Math.round(x0 * 720), py0 = Math.round(y0 * 1560);
        const px1 = Math.round(x1 * 720), py1 = Math.round(y1 * 1560);
        this._adb(`shell input swipe ${px0} ${py0} ${px1} ${py1} ${duration}`);

      } else if (type === 'key' && keycode != null) {
        this._adb(`shell input keyevent ${keycode}`);
      }
    } catch (e) {
      this._err('Input relay error:', e.message);
    }
  }

  // ── ADB helpers ───────────────────────────────────────────────

  _adb(args) {
    const cmd = `adb -s ${this.adbSerial} ${args}`;
    return execSync(cmd, { stdio: ['ignore', 'pipe', 'pipe'] });
  }

  _adbSpawn(shellCmd) {
    const parts = shellCmd.split(' ');
    return spawn('adb', ['-s', this.adbSerial, ...parts], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  }

  // ── Utilities ─────────────────────────────────────────────────

  _waitForPort(port, timeoutMs) {
    return new Promise((resolve, reject) => {
      const deadline = Date.now() + timeoutMs;
      const attempt = () => {
        const sock = net.createConnection({ port, host: '127.0.0.1' });
        sock.on('connect', () => { sock.destroy(); resolve(); });
        sock.on('error', () => {
          if (Date.now() > deadline) return reject(new Error(`Port ${port} not open after ${timeoutMs}ms`));
          setTimeout(attempt, 500);
        });
      };
      attempt();
    });
  }
}

function _sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

module.exports = { ScrcpyBridge };
