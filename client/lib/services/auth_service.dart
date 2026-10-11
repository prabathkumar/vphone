import 'dart:convert';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:http/http.dart' as http;

const _storage = FlutterSecureStorage();
const _tokenKey = 'vphone_jwt';
const _baseUrl = String.fromEnvironment('API_URL', defaultValue: 'https://api.vphone.app');

// ---------------------------------------------------------------------------
// Auth state — nullable user map (null = logged out)
// ---------------------------------------------------------------------------

final authServiceProvider = AsyncNotifierProvider<AuthService, Map<String, dynamic>?>(
  AuthService.new,
);

class AuthService extends AsyncNotifier<Map<String, dynamic>?> {
  @override
  Future<Map<String, dynamic>?> build() async {
    final token = await _storage.read(key: _tokenKey);
    if (token == null) return null;
    return _verifyToken(token);
  }

  // -------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------

  /// Dev login — accepts any userId and returns a token from the server.
  /// Phase 2: replaced by OTP flow via Firebase Auth.
  Future<void> loginDev(String userId) async {
    state = const AsyncLoading();
    final response = await http.post(
      Uri.parse('$_baseUrl/auth/dev-login'),
      headers: {'Content-Type': 'application/json'},
      body: jsonEncode({'userId': userId}),
    );
    if (response.statusCode != 200) {
      state = AsyncError(
        Exception('Login failed: ${response.body}'),
        StackTrace.current,
      );
      return;
    }
    final data = jsonDecode(response.body) as Map<String, dynamic>;
    final token = data['token'] as String;
    await _storage.write(key: _tokenKey, value: token);
    state = AsyncData({'userId': userId, 'token': token});
  }

  Future<void> logout() async {
    await _storage.delete(key: _tokenKey);
    state = const AsyncData(null);
  }

  Future<String?> getToken() => _storage.read(key: _tokenKey);

  // -------------------------------------------------------------------------
  // Internals
  // -------------------------------------------------------------------------

  Future<Map<String, dynamic>?> _verifyToken(String token) async {
    try {
      final response = await http.get(
        Uri.parse('$_baseUrl/auth/me'),
        headers: {'Authorization': 'Bearer $token'},
      ).timeout(const Duration(seconds: 6));
      if (response.statusCode == 200) {
        final data = jsonDecode(response.body) as Map<String, dynamic>;
        return {...data, 'token': token};
      }
    } catch (_) {
      // network error — keep local token, try later
      return {'token': token, 'offline': true};
    }
    await _storage.delete(key: _tokenKey);
    return null;
  }
}
