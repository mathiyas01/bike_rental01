import axios from 'axios';

const apiBaseUrl =
  import.meta.env.VITE_API_URL ||
  (import.meta.env.PROD
    ? 'https://bike-rental-62cf2.containers.snapdeploy.app'
    : 'http://localhost:8081');

export const api = axios.create({
  baseURL: apiBaseUrl,
  headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
  timeout: 15000,
});
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('jwt_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});
export function errorMessage(error: unknown): string {
  if (axios.isAxiosError(error)) {
    const data = error.response?.data;
    if (data?.validationErrors?.length) return data.validationErrors.map((e: { message: string }) => e.message).join(', ');
    return data?.message || error.message;
  }
  return error instanceof Error ? error.message : 'Unexpected error';
}
export const list = async <T>(path: string, params?: Record<string, unknown>): Promise<T[]> => {
  const { data } = await api.get(path, { params });
  return (data.content ?? data) as T[];
};
