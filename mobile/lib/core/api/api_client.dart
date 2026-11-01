import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'api_endpoints.dart';

final apiClientProvider = Provider<ApiClient>((ref) => ApiClient());

class ApiClient {
  static const String _tokenKey = 'jwt_token';
  static const String _serverUrlKey = 'server_url';

  final Dio dio;
  final FlutterSecureStorage storage;

  ApiClient({Dio? dio, FlutterSecureStorage? storage})
      : dio = dio ?? Dio(),
        storage = storage ?? const FlutterSecureStorage() {
    this.dio.options = BaseOptions(
      baseUrl: ApiEndpoints.defaultBaseUrl,
      connectTimeout: const Duration(seconds: 15),
      receiveTimeout: const Duration(seconds: 15),
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Accept': 'application/json',
      },
    );

    this.dio.interceptors.add(
      InterceptorsWrapper(
        onRequest: (options, handler) async {
          // Read dynamic server URL override if set
          final customUrl = await this.storage.read(key: _serverUrlKey);
          if (customUrl != null && customUrl.isNotEmpty) {
            options.baseUrl = customUrl;
          }

          // Attach Bearer token if present
          final token = await this.storage.read(key: _tokenKey);
          if (token != null && token.isNotEmpty) {
            options.headers['Authorization'] = 'Bearer $token';
          }
          return handler.next(options);
        },
        onError: (DioException error, handler) {
          // Extract backend structured error message
          String userFriendlyMessage = 'Network connection error';
          if (error.response?.data is Map) {
            final data = error.response!.data as Map;
            if (data.containsKey('message')) {
              userFriendlyMessage = data['message'].toString();
            }
          } else if (error.type == DioExceptionType.connectionTimeout ||
                     error.type == DioExceptionType.receiveTimeout) {
            userFriendlyMessage = 'Server request timed out. Please check connection.';
          } else if (error.type == DioExceptionType.connectionError) {
            userFriendlyMessage = 'Cannot connect to backend server on ${error.requestOptions.baseUrl}';
          }

          final customError = DioException(
            requestOptions: error.requestOptions,
            response: error.response,
            type: error.type,
            error: userFriendlyMessage,
            message: userFriendlyMessage,
          );
          return handler.next(customError);
        },
      ),
    );
  }

  Future<void> saveToken(String token) async {
    await storage.write(key: _tokenKey, value: token);
  }

  Future<String?> getToken() async {
    return await storage.read(key: _tokenKey);
  }

  Future<void> clearToken() async {
    await storage.delete(key: _tokenKey);
  }

  Future<void> saveServerUrl(String url) async {
    await storage.write(key: _serverUrlKey, value: url);
    dio.options.baseUrl = url;
  }

  Future<String> getServerUrl() async {
    final custom = await storage.read(key: _serverUrlKey);
    return custom ?? ApiEndpoints.defaultBaseUrl;
  }
}
