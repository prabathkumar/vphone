import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:http/http.dart' as http;

import '../services/auth_service.dart';

// ---------------------------------------------------------------------------
// Provider — instance list
// ---------------------------------------------------------------------------

final instancesProvider = FutureProvider.autoDispose<List<Map<String, dynamic>>>((ref) async {
  final token = await ref.watch(authServiceProvider.notifier).getToken();
  if (token == null) return [];

  const baseUrl = String.fromEnvironment('API_URL', defaultValue: 'https://api.vphone.app');
  final response = await http.get(
    Uri.parse('$baseUrl/instances'),
    headers: {'Authorization': 'Bearer $token'},
  );
  if (response.statusCode == 200) {
    final data = jsonDecode(response.body) as Map<String, dynamic>;
    return List<Map<String, dynamic>>.from(data['instances'] as List);
  }
  return [];
});

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

class HomeScreen extends ConsumerWidget {
  const HomeScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final instancesAsync = ref.watch(instancesProvider);
    final cs = Theme.of(context).colorScheme;

    return Scaffold(
      appBar: AppBar(
        title: Text('VPhone', style: GoogleFonts.inter(fontWeight: FontWeight.w800)),
        actions: [
          IconButton(
            icon: const Icon(Icons.logout_rounded),
            tooltip: 'Sign out',
            onPressed: () async {
              await ref.read(authServiceProvider.notifier).logout();
              if (context.mounted) {
                Navigator.pushReplacementNamed(context, '/auth');
              }
            },
          ),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: () => ref.refresh(instancesProvider.future),
        child: instancesAsync.when(
          loading: () => const Center(child: CircularProgressIndicator()),
          error: (e, _) => _ErrorView(error: e.toString(), onRetry: () => ref.invalidate(instancesProvider)),
          data: (instances) => instances.isEmpty
              ? _EmptyState(onLaunch: () => Navigator.pushNamed(context, '/launch'))
              : _InstanceGrid(instances: instances),
        ),
      ),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: () => Navigator.pushNamed(context, '/launch'),
        icon: const Icon(Icons.add_rounded),
        label: Text('New Phone', style: GoogleFonts.inter(fontWeight: FontWeight.w600)),
        backgroundColor: cs.primary,
        foregroundColor: cs.onPrimary,
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// Sub-widgets
// ---------------------------------------------------------------------------

class _InstanceGrid extends ConsumerWidget {
  final List<Map<String, dynamic>> instances;
  const _InstanceGrid({required this.instances});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return GridView.builder(
      padding: const EdgeInsets.all(16),
      gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
        crossAxisCount: 2,
        mainAxisSpacing: 12,
        crossAxisSpacing: 12,
        childAspectRatio: 0.75,
      ),
      itemCount: instances.length,
      itemBuilder: (ctx, i) => _InstanceCard(instance: instances[i], ref: ref),
    );
  }
}

class _InstanceCard extends StatelessWidget {
  final Map<String, dynamic> instance;
  final WidgetRef ref;
  const _InstanceCard({required this.instance, required this.ref});

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    final status = instance['status'] as String? ?? 'unknown';
    final isReady = status == 'running';
    final id = instance['id'] as String;

    return Card(
      elevation: 0,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(16),
        side: BorderSide(color: cs.outlineVariant),
      ),
      child: InkWell(
        borderRadius: BorderRadius.circular(16),
        onTap: isReady ? () => Navigator.pushNamed(context, '/stream', arguments: id) : null,
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Container(
                    padding: const EdgeInsets.all(8),
                    decoration: BoxDecoration(
                      color: isReady ? cs.primaryContainer : cs.surfaceContainerHighest,
                      borderRadius: BorderRadius.circular(10),
                    ),
                    child: Icon(
                      Icons.phone_android_rounded,
                      color: isReady ? cs.primary : cs.onSurfaceVariant,
                      size: 20,
                    ),
                  ),
                  const Spacer(),
                  _StatusDot(status: status),
                ],
              ),
              const Spacer(),
              Text(
                'India Phone',
                style: GoogleFonts.inter(fontWeight: FontWeight.w700, fontSize: 15),
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
              ),
              const SizedBox(height: 4),
              Text(
                instance['region'] as String? ?? 'Mumbai',
                style: GoogleFonts.inter(fontSize: 13, color: cs.onSurfaceVariant),
              ),
              const SizedBox(height: 12),
              SizedBox(
                width: double.infinity,
                child: isReady
                    ? FilledButton(
                        style: FilledButton.styleFrom(
                          padding: const EdgeInsets.symmetric(vertical: 8),
                          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                        ),
                        onPressed: () =>
                            Navigator.pushNamed(context, '/stream', arguments: id),
                        child: Text('Open', style: GoogleFonts.inter(fontWeight: FontWeight.w600, fontSize: 13)),
                      )
                    : OutlinedButton(
                        style: OutlinedButton.styleFrom(
                          padding: const EdgeInsets.symmetric(vertical: 8),
                          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                        ),
                        onPressed: null,
                        child: Text(
                          _statusLabel(status),
                          style: GoogleFonts.inter(fontSize: 13),
                        ),
                      ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  String _statusLabel(String status) {
    return switch (status) {
      'booting' => 'Starting…',
      'stopping' => 'Stopping…',
      'error' => 'Error',
      _ => status,
    };
  }
}

class _StatusDot extends StatelessWidget {
  final String status;
  const _StatusDot({required this.status});

  @override
  Widget build(BuildContext context) {
    final color = switch (status) {
      'running' => Colors.green,
      'booting' => Colors.orange,
      'error' => Colors.red,
      _ => Colors.grey,
    };
    return Container(
      width: 10,
      height: 10,
      decoration: BoxDecoration(color: color, shape: BoxShape.circle),
    );
  }
}

class _EmptyState extends StatelessWidget {
  final VoidCallback onLaunch;
  const _EmptyState({required this.onLaunch});

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(Icons.phone_android_rounded, size: 80, color: cs.primaryContainer),
            const SizedBox(height: 24),
            Text(
              'No virtual phones yet',
              style: GoogleFonts.inter(fontSize: 20, fontWeight: FontWeight.w700),
            ),
            const SizedBox(height: 12),
            Text(
              'Launch your first Indian virtual phone and use UPI, IRCTC, banking & more from anywhere.',
              style: GoogleFonts.inter(fontSize: 15, color: cs.onSurfaceVariant),
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 32),
            FilledButton.icon(
              onPressed: onLaunch,
              icon: const Icon(Icons.add_rounded),
              label: Text('Launch Phone', style: GoogleFonts.inter(fontWeight: FontWeight.w600)),
            ),
          ],
        ),
      ),
    );
  }
}

class _ErrorView extends StatelessWidget {
  final String error;
  final VoidCallback onRetry;
  const _ErrorView({required this.error, required this.onRetry});

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          const Icon(Icons.error_outline_rounded, size: 48, color: Colors.red),
          const SizedBox(height: 16),
          Text(error, textAlign: TextAlign.center),
          const SizedBox(height: 16),
          FilledButton(onPressed: onRetry, child: const Text('Retry')),
        ],
      ),
    );
  }
}
