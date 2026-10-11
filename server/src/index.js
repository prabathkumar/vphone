/**
 * VPhone — Signalling Server
 * Handles WebRTC peer negotiation between the Flutter client
 * and the cloud Android instance (QEMU/KVM via scrcpy-server).
 */

require('dotenv').config();
const express = require('express');
const http    = require('http');
const { WebSocketServer } = require('ws');
const { v4: uuidv4 } = require('uuid');
const cors    = require('cors');
const helmet  = require('helmet');

const instanceManager = require('./instanceManager');
const authMiddleware  = require('./auth');
const { generateToken } = require('./auth');

const app    = express();
const server = http.createServer(app);
const wss    = new WebSocketServer({ server, path: '/ws' });

const PORT = process.env.PORT || 3000;

// ── Middleware ────────────────────────────────────────────────
app.use(helmet());
app.use(cors({ origin: process.env.ALLOWED_ORIGINS?.split(',') || '*' }));
app.use(express.json());

// ── REST API ──────────────────────────────────────────────────

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', version: '0.1.0', ts: new Date().toISOString() });
});

// Dev login — Phase 1 only (no OTP). Replace with Firebase OTP in Phase 2.
app.post('/auth/dev-login', (req, res) => {
  const { userId } = req.body;
  if (!userId) return res.status(400).json({ error: 'userId required' });
  const token = generateToken(userId);
  res.json({ token, userId });
});

// Token verify
app.get('/auth/me', authMiddleware, (req, res) => {
  res.json({ userId: req.userId });
});

// List user instances
app.get('/instances', authMiddleware, async (req, res) => {
  try {
    const list = instanceManager.listForUser(req.userId);
    res.json({ instances: list });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// List available regions
app.get('/regions', (req, res) => {
  res.json({
    regions: [
      { id: 'india-mumbai',    name: 'India (Mumbai)',    flag: '🇮🇳', available: true  },
      { id: 'india-hyderabad', name: 'India (Hyderabad)', flag: '🇮🇳', available: false },
      { id: 'sg',              name: 'Singapore',         flag: '🇸🇬', available: false },
      { id: 'my',              name: 'Malaysia',          flag: '🇲🇾', available: false },
    ]
  });
});

// Spin up a new Android instance
app.post('/instances', authMiddleware, async (req, res) => {
  try {
    const { region = 'india-mumbai', androidVersion = 13 } = req.body;
    const instance = await instanceManager.create({ region, androidVersion, userId: req.userId });
    res.status(201).json(instance);
  } catch (err) {
    console.error('Instance create error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Get instance status
app.get('/instances/:id', authMiddleware, async (req, res) => {
  try {
    const instance = await instanceManager.get(req.params.id, req.userId);
    if (!instance) return res.status(404).json({ error: 'Not found' });
    res.json(instance);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Stop / destroy instance
app.delete('/instances/:id', authMiddleware, async (req, res) => {
  try {
    await instanceManager.destroy(req.params.id, req.userId);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── WebSocket Signalling ──────────────────────────────────────
// Rooms map: instanceId → { client: ws, android: ws }
const rooms = new Map();

wss.on('connection', (ws, req) => {
  const sessionId = uuidv4();
  ws.sessionId = sessionId;
  console.log(`WS connect: ${sessionId}`);

  ws.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }

    const { type, instanceId, payload } = msg;

    switch (type) {

      // Flutter client joins a room for an instance
      case 'join': {
        if (!rooms.has(instanceId)) rooms.set(instanceId, {});
        const room = rooms.get(instanceId);
        room.client = ws;
        ws.instanceId = instanceId;
        ws.role = 'client';
        console.log(`Client joined room ${instanceId}`);

        // Tell Android instance a client is ready
        if (room.android?.readyState === 1) {
          room.android.send(JSON.stringify({ type: 'client-ready', instanceId }));
        }
        break;
      }

      // Android scrcpy-server registers itself
      case 'register-android': {
        if (!rooms.has(instanceId)) rooms.set(instanceId, {});
        const room = rooms.get(instanceId);
        room.android = ws;
        ws.instanceId = instanceId;
        ws.role = 'android';
        console.log(`Android registered for room ${instanceId}`);
        break;
      }

      // WebRTC offer (client → android)
      case 'offer': {
        const room = rooms.get(instanceId);
        if (room?.android?.readyState === 1) {
          room.android.send(JSON.stringify({ type: 'offer', payload }));
        }
        break;
      }

      // WebRTC answer (android → client)
      case 'answer': {
        const room = rooms.get(instanceId);
        if (room?.client?.readyState === 1) {
          room.client.send(JSON.stringify({ type: 'answer', payload }));
        }
        break;
      }

      // ICE candidates (bidirectional)
      case 'ice-candidate': {
        const room = rooms.get(instanceId);
        const target = ws.role === 'client' ? room?.android : room?.client;
        if (target?.readyState === 1) {
          target.send(JSON.stringify({ type: 'ice-candidate', payload }));
        }
        break;
      }

      // Touch / input events (client → android)
      case 'input': {
        const room = rooms.get(instanceId);
        if (room?.android?.readyState === 1) {
          room.android.send(JSON.stringify({ type: 'input', payload }));
        }
        break;
      }

      default:
        console.warn(`Unknown message type: ${type}`);
    }
  });

  ws.on('close', () => {
    console.log(`WS close: ${sessionId}`);
    if (ws.instanceId) {
      const room = rooms.get(ws.instanceId);
      if (room) {
        if (ws.role === 'client') delete room.client;
        if (ws.role === 'android') delete room.android;
        if (!room.client && !room.android) rooms.delete(ws.instanceId);
      }
    }
  });

  ws.on('error', (err) => console.error(`WS error [${sessionId}]:`, err));
});

// ── Start ─────────────────────────────────────────────────────
server.listen(PORT, () => {
  console.log(`VPhone signalling server running on port ${PORT}`);
  console.log(`WebSocket endpoint: ws://localhost:${PORT}/ws`);
});

module.exports = { app, server };
