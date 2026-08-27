import { QueryClient } from '@tanstack/react-query';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 30, // 30 seconds
      refetchOnWindowFocus: false,
      retry: (failureCount, error) => {
        if ((error as { statusCode?: number })?.statusCode === 404 || (error as { statusCode?: number })?.statusCode === 401) {
          return false;
        }
        return failureCount < 2;
      },
    },
  },
});
