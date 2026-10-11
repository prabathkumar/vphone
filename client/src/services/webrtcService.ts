/**
 * WebRTC service — connects RN client to cloud Android via STUN/TURN.
 * Uses react-native-webrtc (118.x), the most widely deployed RN WebRTC lib.
 */
import {
  RTCPeerConnection,
  RTCIceCandidate,
  RTCSessionDescription,
  MediaStream,
} from 'react-native-webrtc';
import {WS_URL, WS_PATH} from '../config';

// react-native-webrtc 118.x extends event-target-shim's EventTarget.
// TypeScript can't always resolve the shim's addEventListener overloads,
// so we use a typed wrapper for event subscriptions.
function pcOn(
  pc: RTCPeerConnection,
  event: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  handler: (evt: any) => void,
): void {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (pc as any).addEventListener(event, handler);
}

const ICE_SERVERS = [
  {urls: 'stun:stun.l.google.com:19302'},
  {
    urls: 'turn:api.vphone.app:3478',
    username: 'vphone',
    credential: 'vphone-turn-secret',
  },
];

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ConnectionStatus = 'idle' | 'connecting' | 'connected' | 'error';

interface WebRTCCallbacks {
  onStatusChange: (status: ConnectionStatus) => void;
  onStream: (stream: MediaStream) => void;
  onError: (message: string) => void;
}

// ---------------------------------------------------------------------------
// Service class
// ---------------------------------------------------------------------------

export class WebRTCService {
  private pc: RTCPeerConnection | null = null;
  private ws: WebSocket | null = null;
  private instanceId: string;
  private callbacks: WebRTCCallbacks;

  constructor(instanceId: string, callbacks: WebRTCCallbacks) {
    this.instanceId = instanceId;
    this.callbacks = callbacks;
  }

  // -------------------------------------------------------------------------
  // Connect
  // -------------------------------------------------------------------------

  async connect(token: string): Promise<void> {
    this.callbacks.onStatusChange('connecting');

    try {
      this.ws = new WebSocket(`${WS_URL}${WS_PATH}?token=${token}`);

      this.ws.onopen = () => {
        this._send({type: 'join', instanceId: this.instanceId});
        this._createPeerConnection();
      };

      this.ws.onmessage = (evt) => this._onMessage(evt.data as string);

      this.ws.onerror = () => this._onError('WebSocket connection failed');

      this.ws.onclose = () => {
        if (this.pc?.connectionState === 'connected') {
          this._onError('Connection dropped');
        }
      };
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      this._onError(`Connect failed: ${msg}`);
    }
  }

  // -------------------------------------------------------------------------
  // Disconnect
  // -------------------------------------------------------------------------

  disconnect(): void {
    this.ws?.close();
    this.ws = null;
    this.pc?.close();
    this.pc = null;
    this.callbacks.onStatusChange('idle');
  }

  // -------------------------------------------------------------------------
  // Input relay
  // -------------------------------------------------------------------------

  sendTouch(action: 'down' | 'move' | 'up', x: number, y: number, pointerId = 0): void {
    this._send({
      type: 'input',
      instanceId: this.instanceId,
      payload: {action, x, y, pointerId},
    });
  }

  sendKey(keyCode: number): void {
    this._send({
      type: 'input',
      instanceId: this.instanceId,
      payload: {action: 'key', keyCode},
    });
  }

  // -------------------------------------------------------------------------
  // WebRTC internals — react-native-webrtc uses EventTarget, not on* props
  // -------------------------------------------------------------------------

  private _createPeerConnection(): void {
    this.pc = new RTCPeerConnection({iceServers: ICE_SERVERS});

    pcOn(this.pc, 'icecandidate', (evt) => {
      if (evt.candidate) {
        this._send({
          type: 'ice-candidate',
          instanceId: this.instanceId,
          payload: evt.candidate.toJSON(),
        });
      }
    });

    pcOn(this.pc, 'track', (evt) => {
      const stream: MediaStream | undefined = evt.streams?.[0];
      if (stream) {
        this.callbacks.onStream(stream);
        this.callbacks.onStatusChange('connected');
      }
    });

    pcOn(this.pc, 'connectionstatechange', () => {
      const s = this.pc?.connectionState;
      if (s === 'failed' || s === 'disconnected') {
        this._onError('Peer connection lost');
      }
    });
  }

  private async _onMessage(raw: string): Promise<void> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let msg: any;
    try {
      msg = JSON.parse(raw);
    } catch {
      return;
    }

    switch (msg.type) {
      case 'offer': {
        if (!this.pc) return;
        await this.pc.setRemoteDescription(
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          new RTCSessionDescription(msg.payload as any),
        );
        const answer = await this.pc.createAnswer();
        await this.pc.setLocalDescription(answer);
        this._send({
          type: 'answer',
          instanceId: this.instanceId,
          payload: answer,
        });
        break;
      }

      case 'ice-candidate': {
        if (!this.pc) return;
        await this.pc.addIceCandidate(new RTCIceCandidate(msg.payload));
        break;
      }

      case 'error':
        this._onError(msg.message ?? 'Server error');
        break;
    }
  }

  private _send(msg: object): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    }
  }

  private _onError(message: string): void {
    this.callbacks.onStatusChange('error');
    this.callbacks.onError(message);
  }
}
