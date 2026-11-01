import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/api/api_client.dart';
import '../../../core/api/api_endpoints.dart';
import '../models/user_model.dart';

export '../../../core/api/api_client.dart' show apiClientProvider;

class AuthState {
  final UserModel? user;
  final bool isLoading;
  final String? errorMessage;
  final Locale locale;
  final ThemeMode themeMode;

  const AuthState({
    this.user,
    this.isLoading = false,
    this.errorMessage,
    this.locale = const Locale('en'),
    this.themeMode = ThemeMode.dark,
  });

  bool get isAuthenticated => user != null;

  AuthState copyWith({
    UserModel? user,
    bool? isLoading,
    String? errorMessage,
    Locale? locale,
    ThemeMode? themeMode,
    bool clearUser = false,
  }) {
    return AuthState(
      user: clearUser ? null : (user ?? this.user),
      isLoading: isLoading ?? this.isLoading,
      errorMessage: errorMessage,
      locale: locale ?? this.locale,
      themeMode: themeMode ?? this.themeMode,
    );
  }
}

class AuthNotifier extends StateNotifier<AuthState> {
  final ApiClient apiClient;

  AuthNotifier(this.apiClient) : super(const AuthState()) {
    checkInitialAuth();
  }

  Future<void> checkInitialAuth() async {
    final token = await apiClient.getToken();
    if (token != null && token.isNotEmpty) {
      try {
        final response = await apiClient.dio.get(ApiEndpoints.profile);
        final user = UserModel.fromJson(response.data);
        final userLocale = user.preferredLanguage == 'ro' ? const Locale('ro') : const Locale('en');
        state = state.copyWith(user: user, locale: userLocale);
      } catch (_) {
        await apiClient.clearToken();
        state = state.copyWith(clearUser: true);
      }
    }
  }

  Future<bool> login(String email, String password) async {
    state = state.copyWith(isLoading: true, errorMessage: null);
    try {
      final response = await apiClient.dio.post(
        ApiEndpoints.login,
        data: {'email': email.trim(), 'password': password},
      );

      final token = response.data['accessToken'] as String;
      final user = UserModel.fromJson(
        response.data['user'] as Map<String, dynamic>,
      );
      await apiClient.saveToken(token);

      final userLocale = user.preferredLanguage == 'ro' ? const Locale('ro') : const Locale('en');
      state = state.copyWith(
        user: user,
        isLoading: false,
        locale: userLocale,
      );
      return true;
    } catch (e) {
      state = state.copyWith(
        isLoading: false,
        errorMessage: e.toString(),
      );
      return false;
    }
  }

  Future<void> logout() async {
    await apiClient.clearToken();
    state = state.copyWith(clearUser: true);
  }

  Future<void> setLanguage(String languageCode) async {
    final newLocale = languageCode == 'ro' ? const Locale('ro') : const Locale('en');
    state = state.copyWith(locale: newLocale);

    if (state.isAuthenticated) {
      try {
        await apiClient.dio.patch(
          ApiEndpoints.updateLanguage,
          data: {'preferredLanguage': languageCode},
        );
      } catch (_) {}
    }
  }

  void toggleTheme() {
    final next = state.themeMode == ThemeMode.dark ? ThemeMode.light : ThemeMode.dark;
    state = state.copyWith(themeMode: next);
  }
}

final authProvider = StateNotifierProvider<AuthNotifier, AuthState>((ref) {
  final apiClient = ref.watch(apiClientProvider);
  return AuthNotifier(apiClient);
});
