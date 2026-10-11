import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:google_fonts/google_fonts.dart';

import 'screens/home_screen.dart';
import 'screens/launch_screen.dart';
import 'screens/stream_screen.dart';
import 'screens/auth_screen.dart';
import 'services/auth_service.dart';

void main() async {
  WidgetsFlutterBinding.ensureInitialized();
  SystemChrome.setPreferredOrientations([
    DeviceOrientation.portraitUp,
    DeviceOrientation.landscapeLeft,
    DeviceOrientation.landscapeRight,
  ]);
  runApp(const ProviderScope(child: VPhoneApp()));
}

class VPhoneApp extends ConsumerWidget {
  const VPhoneApp({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final authState = ref.watch(authServiceProvider);

    return MaterialApp(
      title: 'VPhone',
      debugShowCheckedModeBanner: false,
      theme: _buildTheme(),
      darkTheme: _buildDarkTheme(),
      themeMode: ThemeMode.system,
      home: authState.when(
        data: (user) => user != null ? const HomeScreen() : const AuthScreen(),
        loading: () => const _SplashScreen(),
        error: (_, __) => const AuthScreen(),
      ),
      routes: {
        '/home':   (_) => const HomeScreen(),
        '/launch': (_) => const LaunchScreen(),
        '/auth':   (_) => const AuthScreen(),
      },
      onGenerateRoute: (settings) {
        if (settings.name == '/stream') {
          final instanceId = settings.arguments as String;
          return MaterialPageRoute(
            builder: (_) => StreamScreen(instanceId: instanceId),
          );
        }
        return null;
      },
    );
  }

  ThemeData _buildTheme() {
    return ThemeData(
      useMaterial3: true,
      colorScheme: ColorScheme.fromSeed(
        seedColor: const Color(0xFF1A73E8),
        brightness: Brightness.light,
      ),
      textTheme: GoogleFonts.interTextTheme(),
      appBarTheme: const AppBarTheme(centerTitle: true, elevation: 0),
    );
  }

  ThemeData _buildDarkTheme() {
    return ThemeData(
      useMaterial3: true,
      colorScheme: ColorScheme.fromSeed(
        seedColor: const Color(0xFF1A73E8),
        brightness: Brightness.dark,
      ),
      textTheme: GoogleFonts.interTextTheme(ThemeData.dark().textTheme),
      appBarTheme: const AppBarTheme(centerTitle: true, elevation: 0),
    );
  }
}

class _SplashScreen extends StatelessWidget {
  const _SplashScreen();

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            const Icon(Icons.phone_android, size: 64, color: Color(0xFF1A73E8)),
            const SizedBox(height: 16),
            Text(
              'VPhone',
              style: GoogleFonts.inter(fontSize: 32, fontWeight: FontWeight.bold),
            ),
            const SizedBox(height: 8),
            Text(
              'Your India, anywhere.',
              style: GoogleFonts.inter(fontSize: 16, color: Colors.grey),
            ),
            const SizedBox(height: 32),
            const CircularProgressIndicator(),
          ],
        ),
      ),
    );
  }
}
