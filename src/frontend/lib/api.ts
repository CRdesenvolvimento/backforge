import axios from 'axios';
import { useAuthStore } from '../modules/auth/auth.store';

export const api = axios.create();

api.interceptors.request.use((config) => {
  const token = useAuthStore.getState().accessToken;

  if (token) {
    config.headers = config.headers ?? {};
    config.headers.Authorization = `Bearer ${token}`;
  }

  return config;
});
