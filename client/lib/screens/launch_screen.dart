import 'dart:async';
import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:http/http.dart' as http;

import '../services/auth_service.dart';

const _baseUrl = String.fromEnvironment('API_URL', defaultValue: 'https://api.vphone.app');

class LaunchScreen extends ConsumerStatefulWidget {
  const LaunchScreen({super.key});

  @override
  ConsumerState<LaunchScreen> createState() => _LaunchScreenState();
}

class _LaunchScreenState extends ConsumerState<LaunchScreen> {
  // Wizard state
  int _step = 0;
  String _selectedRegion = 'india-mumbai';
  String _selectedPlan = 'basic';
  bool _launching = false;
  String? _statusMessage;
  Timer? _pollTimer;
  String? _instanceId;

  // -------------------------------------------------------------------------
  // Config data
  // -------------------------------------------------------------------------

  final _regions = [
    _Region('india-mumbai', 'Mumbai', '🇮🇳', 'Best for UPI, banking, gas agencies', true),
    _Region('india-hyderabad', 'Hyderabad', '🇮🇳', 'Low latency for South India', false),
  ];

  final _plans = [
    _Plan('basic', 'Basic', 'Free', '1 vCPU · 2 GB RAM\nAndroid 13\n2 hr/day', true),
    _Plan('standard', 'Standard', '₹299/mo', '2 vCPU · 4 GB RAM\nAndroid 14\nUnlimited', true),
    _Plan('pro', 'Pro', '₹799/mo', '4 vCPU · 8 GB RAM\nAndroid 14\nUnlimited + priority', true),
  ];

  // -------------------------------------------------------------------------
  // Actions
  // -------------------------------------------------------------------------

  Future<void> _launch() async {
    setState(() {
      _launching = true;
      _statusMessage = 'Requesting your virtual phone…';
    });

    final token = await ref.read(authServiceProvider.notifier).getToken();
    if (token == null) {
      setState(() {
        _launching = false;
        _statusMessage = 'Not authenticated.';
      });
      return;
    }

    try {
      final res = await http.post(
        Uri.parse('$_baseUrl/instances'),
        headers: {
          'Authorization': 'Bearer $token',
          'Content-Type': 'application/json',
        },
        body: jsonEncode({
          'region': _selectedRegion,
          'plan': _selectedPlan,
        }),
      );

      if (res.statusCode != 201) throw Exception('Server error: ${res.body}');

      final data = jsonDecode(res.body) as Map<String, dynamic>;
      _instanceId = data['id'] as String;

      setState(() => _statusMessage = 'Booting Android… this takes ~30 seconds');
      _pollStatus(token);
    } catch (e) {
      setState(() {
        _launching = false;
        _statusMessage = 'Launch failed: $e';
      });
    }
  }

  void _pollStatus(String token) {
    _pollTimer = Timer.periodic(const Duration(seconds: 3), (t) async {
      final res = await http.get(
        Uri.parse('$_baseUrl/instances/$_instanceId'),
        headers: {'Authorization': 'Bearer $token'},
      );
      if (res.statusCode != 200) return;

      final data = jsonDecode(res.body) as Map<String, dynamic>;
      final status = data['status'] as String?;

      if (status == 'running') {
        t.cancel();
        if (mounted) {
          Navigator.pushReplacementNamed(context, '/stream', arguments: _instanceId);
        }
      } else if (status == 'error') {
        t.cancel();
        if (mounted) {
          setState(() {
            _launching = false;
            _statusMessage = 'Boot failed. Please try again.';
          });
        }
      } else {
        if (mounted) setState(() => _statusMessage = 'Starting Android ($status)…');
      }
    });
  }

  @override
  void dispose() {
    _pollTimer?.cancel();
    super.dispose();
  }

  // -------------------------------------------------------------------------
  // Build
  // -------------------------------------------------------------------------

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;

    return Scaffold(
      appBar: AppBar(
        title: Text('New Virtual Phone', style: GoogleFonts.inter(fontWeight: FontWeight.w700)),
      ),
      body: _launching ? _LaunchingView(message: _statusMessage) : _wizard(cs),
      bottomNavigationBar: _launching
          ? null
          : SafeArea(
              child: Padding(
                padding: const EdgeInsets.fromLTRB(20, 8, 20, 16),
                child: Row(
                  children: [
                    if (_step > 0)
                      Expanded(
                        child: OutlinedButton(
                          onPressed: () => setState(() => _step--),
                          child: const Text('Back'),
                        ),
                      ),
                    if (_step > 0) const SizedBox(width: 12),
                    Expanded(
                      flex: 2,
                      child: FilledButton(
                        onPressed: _step < 1
                            ? () => setState(() => _step++)
                            : _launch,
                        child: Text(
                          _step < 1 ? 'Next' : 'Launch',
                          style: GoogleFonts.inter(fontWeight: FontWeight.w600, fontSize: 16),
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ),
    );
  }

  Widget _wizard(ColorScheme cs) {
    return Column(
      children: [
        // Step indicator
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 12),
          child: Row(
            children: List.generate(2, (i) {
              return Expanded(
                child: Container(
                  margin: EdgeInsets.only(right: i < 1 ? 8 : 0),
                  height: 4,
                  decoration: BoxDecoration(
                    color: i <= _step ? cs.primary : cs.surfaceContainerHighest,
                    borderRadius: BorderRadius.circular(2),
                  ),
                ),
              );
            }),
          ),
        ),

        Expanded(
          child: AnimatedSwitcher(
            duration: const Duration(milliseconds: 250),
            child: _step == 0 ? _regionStep(cs) : _planStep(cs),
          ),
        ),
      ],
    );
  }

  Widget _regionStep(ColorScheme cs) {
    return ListView(
      key: const ValueKey('region'),
      padding: const EdgeInsets.all(20),
      children: [
        Text('Choose a region', style: GoogleFonts.inter(fontSize: 22, fontWeight: FontWeight.w700)),
        const SizedBox(height: 6),
        Text(
          'Your virtual phone boots in this data centre. Pick the closest city for best speed.',
          style: GoogleFonts.inter(fontSize: 14, color: cs.onSurfaceVariant),
        ),
        const SizedBox(height: 20),
        ..._regions.map((r) => _RegionTile(
              region: r,
              selected: _selectedRegion == r.id,
              onTap: r.available ? () => setState(() => _selectedRegion = r.id) : null,
            )),
      ],
    );
  }

  Widget _planStep(ColorScheme cs) {
    return ListView(
      key: const ValueKey('plan'),
      padding: const EdgeInsets.all(20),
      children: [
        Text('Choose a plan', style: GoogleFonts.inter(fontSize: 22, fontWeight: FontWeight.w700)),
        const SizedBox(height: 6),
        Text(
          'You can upgrade or downgrade at any time.',
          style: GoogleFonts.inter(fontSize: 14, color: cs.onSurfaceVariant),
        ),
        const SizedBox(height: 20),
        ..._plans.map((p) => _PlanTile(
              plan: p,
              selected: _selectedPlan == p.id,
              onTap: () => setState(() => _selectedPlan = p.id),
            )),
      ],
    );
  }
}

// ---------------------------------------------------------------------------
// Data models
// ---------------------------------------------------------------------------

class _Region {
  final String id, name, flag, description;
  final bool available;
  const _Region(this.id, this.name, this.flag, this.description, this.available);
}

class _Plan {
  final String id, name, price, features;
  final bool available;
  const _Plan(this.id, this.name, this.price, this.features, this.available);
}

// ---------------------------------------------------------------------------
// Tiles
// ---------------------------------------------------------------------------

class _RegionTile extends StatelessWidget {
  final _Region region;
  final bool selected;
  final VoidCallback? onTap;
  const _RegionTile({required this.region, required this.selected, this.onTap});

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    return Card(
      elevation: 0,
      margin: const EdgeInsets.only(bottom: 12),
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(14),
        side: BorderSide(
          color: selected ? cs.primary : cs.outlineVariant,
          width: selected ? 2 : 1,
        ),
      ),
      child: ListTile(
        contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
        leading: Text(region.flag, style: const TextStyle(fontSize: 32)),
        title: Text(region.name, style: GoogleFonts.inter(fontWeight: FontWeight.w600)),
        subtitle: Text(region.description, style: GoogleFonts.inter(fontSize: 13)),
        trailing: region.available
            ? (selected ? Icon(Icons.check_circle, color: cs.primary) : null)
            : const Chip(label: Text('Soon')),
        onTap: onTap,
      ),
    );
  }
}

class _PlanTile extends StatelessWidget {
  final _Plan plan;
  final bool selected;
  final VoidCallback? onTap;
  const _PlanTile({required this.plan, required this.selected, this.onTap});

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    return Card(
      elevation: 0,
      margin: const EdgeInsets.only(bottom: 12),
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(14),
        side: BorderSide(
          color: selected ? cs.primary : cs.outlineVariant,
          width: selected ? 2 : 1,
        ),
      ),
      child: ListTile(
        contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
        title: Row(
          children: [
            Text(plan.name, style: GoogleFonts.inter(fontWeight: FontWeight.w700)),
            const Spacer(),
            Text(
              plan.price,
              style: GoogleFonts.inter(
                fontWeight: FontWeight.w700,
                color: cs.primary,
                fontSize: 16,
              ),
            ),
          ],
        ),
        subtitle: Padding(
          padding: const EdgeInsets.only(top: 6),
          child: Text(
            plan.features.replaceAll('\n', '  ·  '),
            style: GoogleFonts.inter(fontSize: 13, color: cs.onSurfaceVariant),
          ),
        ),
        trailing: selected ? Icon(Icons.check_circle, color: cs.primary) : null,
        onTap: onTap,
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// Launching progress view
// ---------------------------------------------------------------------------

class _LaunchingView extends StatelessWidget {
  final String? message;
  const _LaunchingView({this.message});

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            const SizedBox(
              width: 64,
              height: 64,
              child: CircularProgressIndicator(strokeWidth: 3),
            ),
            const SizedBox(height: 32),
            Text(
              'Launching your virtual phone',
              style: GoogleFonts.inter(fontSize: 20, fontWeight: FontWeight.w700),
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 12),
            Text(
              message ?? 'Please wait…',
              style: GoogleFonts.inter(fontSize: 15, color: Colors.grey),
              textAlign: TextAlign.center,
            ),
          ],
        ),
      ),
    );
  }
}
