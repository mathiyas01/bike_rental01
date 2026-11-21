import axios from 'axios';
import { firebaseAuth } from './firebase';

export function resolveApiBaseUrl(env: { VITE_API_URL?: string; PROD?: boolean }): string {
  const configured = env.VITE_API_URL?.trim();
  if (configured) return configured;
  if (env.PROD) {
    throw new Error(
      'VITE_API_URL is required in production and must be set to the deployed Firebase Functions HTTPS URL.',
    );
  }
  return 'http://localhost:8081';
}

const apiBaseUrl = resolveApiBaseUrl(import.meta.env);

export const api = axios.create({
  baseURL: apiBaseUrl,
  headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
  timeout: 15000,
});
api.interceptors.request.use(async (config) => {
  const token = await firebaseAuth.currentUser?.getIdToken();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

let unauthorizedHandler: (() => void) | null = null;
let handlingUnauthorized = false;

export function setUnauthorizedHandler(handler: (() => void) | null) {
  unauthorizedHandler = handler;
}

export function resetUnauthorizedHandling() {
  handlingUnauthorized = false;
}

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (axios.isAxiosError(error) && error.response?.status === 401) {
      const requestUrl = String(error.config?.url ?? '');
      const isAlreadyOnLogin =
        typeof window !== 'undefined' && window.location.pathname === '/login';

      if (!isAlreadyOnLogin && !handlingUnauthorized) {
        handlingUnauthorized = true;
        localStorage.removeItem('user');
        if (unauthorizedHandler) {
          unauthorizedHandler();
        } else if (typeof window !== 'undefined') {
          window.location.replace('/login');
        }
      }
    }
    return Promise.reject(error);
  },
);
export function errorMessage(error: unknown): string {
  if (axios.isAxiosError(error)) {
    const data = error.response?.data;
    if (data?.validationErrors?.length) return data.validationErrors.map((e: { message: string }) => e.message).join(', ');
    return data?.message || error.message;
  }
  return error instanceof Error ? error.message : 'Unexpected error';
}
export interface PageResult<T> {
  content: T[];
  pageNumber: number;
  pageSize: number;
  totalElements: number;
  totalPages: number;
  last: boolean;
}

export const list = async <T>(path: string, params?: Record<string, unknown>): Promise<T[]> => {
  const { data } = await api.get(path, { params });
  return (data.content ?? data) as T[];
};

export const listPage = async <T>(path: string, params?: Record<string, unknown>): Promise<PageResult<T>> => {
  const { data } = await api.get(path, { params });
  if (Array.isArray(data)) {
    const requestedPage = typeof params?.page === 'number' ? params.page : 0;
    const requestedSize = typeof params?.size === 'number' ? params.size : data.length || 100;
    return {
      content: data as T[],
      pageNumber: requestedPage,
      pageSize: requestedSize,
      totalElements: data.length,
      totalPages: data.length > 0 ? 1 : 0,
      last: true,
    };
  }
  const content = Array.isArray(data?.content) ? (data.content as T[]) : [];
  const totalElements = typeof data?.totalElements === 'number' ? data.totalElements : content.length;
  const pageSize = typeof data?.pageSize === 'number' ? data.pageSize : (typeof params?.size === 'number' ? params.size : 100);
  const pageNumber = typeof data?.pageNumber === 'number' ? data.pageNumber : (typeof params?.page === 'number' ? params.page : 0);
  const totalPages = typeof data?.totalPages === 'number' ? data.totalPages : (totalElements === 0 ? 0 : Math.ceil(totalElements / Math.max(1, pageSize)));
  const last = typeof data?.last === 'boolean' ? data.last : pageNumber >= totalPages - 1;
  return { content, pageNumber, pageSize, totalElements, totalPages, last };
};
