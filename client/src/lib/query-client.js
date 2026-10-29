import { QueryClient } from '@tanstack/react-query';
export const queryClient = new QueryClient({ defaultOptions: {
  queries: { staleTime: 20000, retry: (count, error) => count < 2 && [0, 502, 503, 504].includes(error.status), retryDelay: attempt => Math.min(1000 * 2 ** attempt, 4000) + Math.random() * 200, refetchOnWindowFocus: true },
  mutations: { retry: false },
} });
