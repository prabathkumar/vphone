import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_webrtc/flutter_webrtc.dart';
import 'package:google_fonts/google_fonts.dart';

import '../services/auth_service.dart';
import '../services/webrtc_service.dart';

class StreamScreen extends ConsumerStatefulWidget {
  final String instanceId;
  const StreamScreen({super.key, required this.instanceId});

  @override
  ConsumerState<StreamScreen> createState() => _StreamScreenState();
}

class _StreamScreenState extends ConsumerState<StreamScreen> with WidgetsBindingObserver {
  bool _controlsVisible = true;
  bool _isFullscreen = false;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _startStream();
  }

  Future<void> _startStream() async {
    final token = await ref.read(authServiceProvider.notifier).getToken();
    if (token != null) {
      await ref.read(webRTCServiceProvider(widget.instanceId).notifier).connect(token);
    }
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    ref.read(webRTCServiceProvider(widget.instanceId).notifier).disconnect();
    _exitFullscreen();
    super.dispose();
  }

  void _toggleControls() => setState(() => _controlsVisible = !_controlsVisible);

  void _enterFullscreen() {
    SystemChrome.setEnabledSystemUIMode(SystemUiMode.immersiveSticky);
    setState(() => _isFullscreen = true);
  }

  void _exitFullscreen() {
    SystemChrome.setEnabledSystemUIMode(SystemUiMode.edgeToEdge);
    setState(() => _isFullscreen = false);
  }

  // -------------------------------------------------------------------------
  // Build
  // -------------------------------------------------------------------------

  @override
  Widget build(BuildContext context) {
    final state = ref.watch(webRTCServiceProvider(widget.instanceId));
    final cs = Theme.of(context).colorScheme;

    return Scaffold(
      backgroundColor: Colors.black,
      body: Stack(
        children: [
          // ── Video / status layer ───────────────────────────────────────────
          Positioned.fill(
            child: _buildVideoLayer(state, cs),
          ),

          // ── Tap zone to toggle controls ────────────────────────────────────
          if (state.status == WebRTCStatus.connected)
            Positioned.fill(
              child: GestureDetector(
                behavior: HitTestBehavior.translucent,
                onTap: _toggleControls,
                onPanUpdate: (d) => _relayTouch('move', d.localPosition, context),
                onPanStart: (d) => _relayTouch('down', d.localPosition, context),
                onPanEnd: (_) => _relayTouchUp(),
              ),
            ),

          // ── Top controls bar ───────────────────────────────────────────────
          AnimatedPositioned(
            duration: const Duration(milliseconds: 200),
            top: _controlsVisible ? 0 : -80,
            left: 0,
            right: 0,
            child: SafeArea(
              bottom: false,
              child: _TopBar(
                onBack: () => Navigator.pop(context),
                onFullscreen: _isFullscreen ? _exitFullscreen : _enterFullscreen,
                isFullscreen: _isFullscreen,
              ),
            ),
          ),

          // ── Bottom Android nav bar ─────────────────────────────────────────
          if (state.status == WebRTCStatus.connected)
            AnimatedPositioned(
              duration: const Duration(milliseconds: 200),
              bottom: _controlsVisible ? 0 : -72,
              left: 0,
              right: 0,
              child: SafeArea(
                top: false,
                child: _AndroidNavBar(
                  onKey: (keyCode) =>
                      ref.read(webRTCServiceProvider(widget.instanceId).notifier).sendKeyEvent(keyCode),
                ),
              ),
            ),
        ],
      ),
    );
  }

  Widget _buildVideoLayer(WebRTCState state, ColorScheme cs) {
    switch (state.status) {
      case WebRTCStatus.connected:
        return RTCVideoView(
          state.renderer!,
          objectFit: RTCVideoViewObjectFit.RTCVideoViewObjectFitContain,
          mirror: false,
        );

      case WebRTCStatus.connecting:
        return _StatusOverlay(
          icon: Icons.wifi_tethering_rounded,
          message: 'Connecting to your virtual phone…',
          cs: cs,
          showProgress: true,
        );

      case WebRTCStatus.error:
        return _StatusOverlay(
          icon: Icons.error_outline_rounded,
          message: state.error ?? 'Connection failed',
          cs: cs,
          action: FilledButton(
            onPressed: _startStream,
            child: const Text('Retry'),
          ),
        );

      case WebRTCStatus.idle:
        return _StatusOverlay(
          icon: Icons.phone_android_rounded,
          message: 'Starting stream…',
          cs: cs,
          showProgress: true,
        );
    }
  }

  // Touch relay helpers
  void _relayTouch(String action, Offset local, BuildContext ctx) {
    final size = MediaQuery.of(ctx).size;
    ref.read(webRTCServiceProvider(widget.instanceId).notifier).sendTouchEvent(
          action: action,
          x: local.dx / size.width,
          y: local.dy / size.height,
        );
  }

  void _relayTouchUp() {
    ref.read(webRTCServiceProvider(widget.instanceId).notifier).sendTouchEvent(
          action: 'up',
          x: 0,
          y: 0,
        );
  }
}

// ---------------------------------------------------------------------------
// Sub-widgets
// ---------------------------------------------------------------------------

class _TopBar extends StatelessWidget {
  final VoidCallback onBack;
  final VoidCallback onFullscreen;
  final bool isFullscreen;
  const _TopBar({required this.onBack, required this.onFullscreen, required this.isFullscreen});

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: const BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.topCenter,
          end: Alignment.bottomCenter,
          colors: [Colors.black87, Colors.transparent],
        ),
      ),
      padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 4),
      child: Row(
        children: [
          IconButton(
            icon: const Icon(Icons.arrow_back_ios_rounded, color: Colors.white),
            onPressed: onBack,
          ),
          Expanded(
            child: Text(
              'Virtual Phone · India',
              style: GoogleFonts.inter(color: Colors.white, fontWeight: FontWeight.w600),
            ),
          ),
          IconButton(
            icon: Icon(
              isFullscreen ? Icons.fullscreen_exit_rounded : Icons.fullscreen_rounded,
              color: Colors.white,
            ),
            onPressed: onFullscreen,
          ),
        ],
      ),
    );
  }
}

class _AndroidNavBar extends StatelessWidget {
  final void Function(int keyCode) onKey;
  const _AndroidNavBar({required this.onKey});

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: const BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.bottomCenter,
          end: Alignment.topCenter,
          colors: [Colors.black87, Colors.transparent],
        ),
      ),
      padding: const EdgeInsets.symmetric(vertical: 12),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceEvenly,
        children: [
          _NavButton(icon: Icons.arrow_back_rounded, keyCode: 4, onTap: onKey),
          _NavButton(icon: Icons.circle_outlined, keyCode: 3, onTap: onKey),
          _NavButton(icon: Icons.square_rounded, keyCode: 187, onTap: onKey),
        ],
      ),
    );
  }
}

class _NavButton extends StatelessWidget {
  final IconData icon;
  final int keyCode;
  final void Function(int) onTap;
  const _NavButton({required this.icon, required this.keyCode, required this.onTap});

  @override
  Widget build(BuildContext context) {
    return IconButton(
      icon: Icon(icon, color: Colors.white, size: 28),
      onPressed: () => onTap(keyCode),
    );
  }
}

class _StatusOverlay extends StatelessWidget {
  final IconData icon;
  final String message;
  final ColorScheme cs;
  final bool showProgress;
  final Widget? action;
  const _StatusOverlay({
    required this.icon,
    required this.message,
    required this.cs,
    this.showProgress = false,
    this.action,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      color: Colors.black,
      child: Center(
        child: Padding(
          padding: const EdgeInsets.all(32),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Icon(icon, size: 64, color: cs.primary),
              const SizedBox(height: 24),
              Text(
                message,
                style: GoogleFonts.inter(color: Colors.white, fontSize: 16),
                textAlign: TextAlign.center,
              ),
              if (showProgress) ...[
                const SizedBox(height: 24),
                const CircularProgressIndicator(),
              ],
              if (action != null) ...[
                const SizedBox(height: 24),
                action!,
              ],
            ],
          ),
        ),
      ),
    );
  }
}
