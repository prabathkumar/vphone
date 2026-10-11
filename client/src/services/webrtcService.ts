/**
 * WebRTC service — connects Flutter client to cloud Android via STUN/TURN.
 * Uses react-native-webrtc (118.x), the most widely deployed RN WebRTC lib.
 */
import {
  RTCPeerConnection,
  RTCIceCandidate,
  RTCSessionDescription,
  MediaStream,
  type RTCIceCandidateType,
  type RTCSessionDescriptionType,
} from 'react-native-webrtc';

const WS_URL = 'wss://api.vphone.app';

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
      this.ws = new WebSocket(`${WS_URL}/signal?token=${token}`);

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
    } catch (e: any) {
      this._onError(`Connect failed: ${e.message}`);
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
  // WebRTC internals
  // -------------------------------------------------------------------------

  private _createPeerConnection(): void {
    this.pc = new RTCPeerConnection({iceServers: ICE_SERVERS});

    this.pc.onicecandidate = (evt) => {
      if (evt.candidate) {
        this._send({
          type: 'ice-candidate',
          instanceId: this.instanceId,
          payload: evt.candidate.toJSON(),
        });
      }
    };

    this.pc.ontrack = (evt) => {
      if (evt.streams?.[0]) {
        this.callbacks.onStream(evt.streams[0]);
        this.callbacks.onStatusChange('connected');
      }
    };

    this.pc.onconnectionstatechange = () => {
      const s = this.pc?.connectionState;
      if (s === 'failed' || s === 'disconnected') {
        this._onError('Peer connection lost');
      }
    };
  }

  private async _onMessage(raw: string): Promise<void> {
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
          new RTCSessionDescription(msg.payload as RTCSessionDescriptionType),
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
        await this.pc.addIceCandidate(
          new RTCIceCandidate(msg.payload as RTCIceCandidateType),
        );
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
