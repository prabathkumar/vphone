import 'dart:convert';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_webrtc/flutter_webrtc.dart';
import 'package:web_socket_channel/web_socket_channel.dart';

const _wsUrl = String.fromEnvironment('WS_URL', defaultValue: 'wss://api.vphone.app');

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

enum WebRTCStatus { idle, connecting, connected, error }

class WebRTCState {
  final WebRTCStatus status;
  final RTCVideoRenderer? renderer;
  final String? error;

  const WebRTCState({
    this.status = WebRTCStatus.idle,
    this.renderer,
    this.error,
  });

  WebRTCState copyWith({
    WebRTCStatus? status,
    RTCVideoRenderer? renderer,
    String? error,
  }) =>
      WebRTCState(
        status: status ?? this.status,
        renderer: renderer ?? this.renderer,
        error: error ?? this.error,
      );
}

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

final webRTCServiceProvider =
    StateNotifierProvider.family<WebRTCService, WebRTCState, String>(
  (ref, instanceId) => WebRTCService(instanceId),
);

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

class WebRTCService extends StateNotifier<WebRTCState> {
  final String instanceId;

  RTCPeerConnection? _pc;
  WebSocketChannel? _ws;
  final _renderer = RTCVideoRenderer();

  WebRTCService(this.instanceId) : super(const WebRTCState());

  // -------------------------------------------------------------------------
  // Lifecycle
  // -------------------------------------------------------------------------

  Future<void> connect(String token) async {
    state = state.copyWith(status: WebRTCStatus.connecting);
    try {
      await _renderer.initialize();

      _ws = WebSocketChannel.connect(
        Uri.parse('$_wsUrl/signal?token=$token'),
      );

      _ws!.stream.listen(
        _onMessage,
        onError: (e) => _setError('WebSocket error: $e'),
        onDone: _onWsClosed,
      );

      _send({'type': 'join', 'instanceId': instanceId});
      await _createPeerConnection();
    } catch (e) {
      _setError('Connect failed: $e');
    }
  }

  Future<void> disconnect() async {
    _ws?.sink.close();
    _ws = null;
    await _pc?.close();
    _pc = null;
    state = const WebRTCState(status: WebRTCStatus.idle);
  }

  @override
  void dispose() {
    disconnect();
    _renderer.dispose();
    super.dispose();
  }

  // -------------------------------------------------------------------------
  // Input relay
  // -------------------------------------------------------------------------

  void sendTouchEvent({
    required String action, // down | move | up
    required double x,
    required double y,
    int pointerId = 0,
  }) {
    _send({
      'type': 'input',
      'instanceId': instanceId,
      'action': action,
      'x': x,
      'y': y,
      'pointerId': pointerId,
    });
  }

  void sendKeyEvent(int keyCode) {
    _send({
      'type': 'input',
      'instanceId': instanceId,
      'action': 'key',
      'keyCode': keyCode,
    });
  }

  // -------------------------------------------------------------------------
  // WebRTC internals
  // -------------------------------------------------------------------------

  Future<void> _createPeerConnection() async {
    final config = {
      'iceServers': [
        {'urls': 'stun:stun.l.google.com:19302'},
        {
          'urls': 'turn:api.vphone.app:3478',
          'username': 'vphone',
          'credential': 'vphone-turn-secret',
        },
      ],
    };

    _pc = await createPeerConnection(config);

    _pc!.onIceCandidate = (candidate) {
      if (candidate.candidate != null) {
        _send({
          'type': 'ice-candidate',
          'instanceId': instanceId,
          'candidate': candidate.toMap(),
        });
      }
    };

    _pc!.onTrack = (event) {
      if (event.streams.isNotEmpty) {
        _renderer.srcObject = event.streams[0];
        state = state.copyWith(
          status: WebRTCStatus.connected,
          renderer: _renderer,
        );
      }
    };

    _pc!.onConnectionState = (s) {
      if (s == RTCPeerConnectionState.RTCPeerConnectionStateFailed ||
          s == RTCPeerConnectionState.RTCPeerConnectionStateDisconnected) {
        _setError('Peer connection lost');
      }
    };
  }

  void _onMessage(dynamic raw) async {
    final msg = jsonDecode(raw as String) as Map<String, dynamic>;
    final type = msg['type'] as String;

    switch (type) {
      case 'offer':
        final offer = RTCSessionDescription(
          msg['sdp'] as String,
          'offer',
        );
        await _pc!.setRemoteDescription(offer);
        final answer = await _pc!.createAnswer();
        await _pc!.setLocalDescription(answer);
        _send({
          'type': 'answer',
          'instanceId': instanceId,
          'sdp': answer.sdp,
        });

      case 'ice-candidate':
        final c = RTCIceCandidate(
          msg['candidate']['candidate'] as String,
          msg['candidate']['sdpMid'] as String?,
          msg['candidate']['sdpMLineIndex'] as int?,
        );
        await _pc!.addCandidate(c);

      case 'error':
        _setError(msg['message'] as String? ?? 'Unknown server error');
    }
  }

  void _onWsClosed() {
    if (state.status == WebRTCStatus.connected) {
      _setError('Connection closed');
    }
  }

  void _send(Map<String, dynamic> msg) {
    _ws?.sink.add(jsonEncode(msg));
  }

  void _setError(String error) {
    state = state.copyWith(status: WebRTCStatus.error, error: error);
  }
}
