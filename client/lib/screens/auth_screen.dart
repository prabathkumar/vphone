import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:flutter_animate/flutter_animate.dart';

import '../services/auth_service.dart';

class AuthScreen extends ConsumerStatefulWidget {
  const AuthScreen({super.key});

  @override
  ConsumerState<AuthScreen> createState() => _AuthScreenState();
}

class _AuthScreenState extends ConsumerState<AuthScreen> {
  final _controller = TextEditingController();
  bool _loading = false;

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  Future<void> _login() async {
    final userId = _controller.text.trim();
    if (userId.isEmpty) return;

    setState(() => _loading = true);
    await ref.read(authServiceProvider.notifier).loginDev(userId);
    if (mounted) setState(() => _loading = false);

    final authState = ref.read(authServiceProvider);
    authState.whenOrNull(
      data: (user) {
        if (user != null && mounted) {
          Navigator.pushReplacementNamed(context, '/home');
        }
      },
      error: (e, _) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Login failed: $e')),
        );
      },
    );
  }

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;

    return Scaffold(
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.symmetric(horizontal: 28, vertical: 48),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              // Logo + headline
              Center(
                child: Column(
                  children: [
                    Container(
                      width: 80,
                      height: 80,
                      decoration: BoxDecoration(
                        color: cs.primaryContainer,
                        shape: BoxShape.circle,
                      ),
                      child: Icon(
                        Icons.phone_android_rounded,
                        size: 44,
                        color: cs.primary,
                      ),
                    ).animate().scale(duration: 600.ms, curve: Curves.elasticOut),
                    const SizedBox(height: 20),
                    Text(
                      'VPhone',
                      style: GoogleFonts.inter(
                        fontSize: 36,
                        fontWeight: FontWeight.w800,
                        color: cs.primary,
                      ),
                    ).animate().fadeIn(delay: 200.ms),
                    const SizedBox(height: 8),
                    Text(
                      'Your India, anywhere.',
                      style: GoogleFonts.inter(
                        fontSize: 16,
                        color: cs.onSurfaceVariant,
                      ),
                    ).animate().fadeIn(delay: 300.ms),
                  ],
                ),
              ),

              const SizedBox(height: 56),

              // Value props
              ..._valuePropItems(cs),

              const SizedBox(height: 48),

              // Dev login (Phase 1)
              Text(
                'Get Started',
                style: GoogleFonts.inter(
                  fontSize: 20,
                  fontWeight: FontWeight.w700,
                ),
              ),
              const SizedBox(height: 6),
              Text(
                'Enter your user ID to continue (OTP login coming soon)',
                style: GoogleFonts.inter(fontSize: 14, color: cs.onSurfaceVariant),
              ),
              const SizedBox(height: 16),

              TextField(
                controller: _controller,
                decoration: InputDecoration(
                  labelText: 'User ID / Phone number',
                  prefixIcon: const Icon(Icons.person_outline),
                  border: OutlineInputBorder(borderRadius: BorderRadius.circular(14)),
                ),
                onSubmitted: (_) => _login(),
              ),
              const SizedBox(height: 20),

              SizedBox(
                width: double.infinity,
                height: 52,
                child: FilledButton(
                  onPressed: _loading ? null : _login,
                  style: FilledButton.styleFrom(
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(14),
                    ),
                  ),
                  child: _loading
                      ? const SizedBox(
                          width: 24,
                          height: 24,
                          child: CircularProgressIndicator(strokeWidth: 2.5),
                        )
                      : Text(
                          'Continue',
                          style: GoogleFonts.inter(
                            fontSize: 16,
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                ),
              ),

              const SizedBox(height: 24),
              Center(
                child: Text(
                  'By continuing, you agree to VPhone\'s Terms of Service.',
                  style: GoogleFonts.inter(fontSize: 12, color: cs.onSurfaceVariant),
                  textAlign: TextAlign.center,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  List<Widget> _valuePropItems(ColorScheme cs) {
    final items = [
      (Icons.account_balance_rounded, 'Do Indian banking & UPI from anywhere'),
      (Icons.train_rounded, 'Book IRCTC tickets, gas, LPG refills'),
      (Icons.verified_user_rounded, 'Complete eKYC without visiting India'),
      (Icons.sim_card_rounded, 'Use apps that need an Indian SIM'),
    ];

    return items
        .asMap()
        .entries
        .map(
          (e) => Padding(
            padding: const EdgeInsets.only(bottom: 14),
            child: Row(
              children: [
                Container(
                  padding: const EdgeInsets.all(10),
                  decoration: BoxDecoration(
                    color: cs.primaryContainer,
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: Icon(e.value.$1, color: cs.primary, size: 22),
                ),
                const SizedBox(width: 14),
                Expanded(
                  child: Text(
                    e.value.$2,
                    style: GoogleFonts.inter(fontSize: 15),
                  ),
                ),
              ],
            ).animate().fadeIn(delay: (400 + e.key * 80).ms).slideX(begin: 0.1),
          ),
        )
        .toList();
  }
}
