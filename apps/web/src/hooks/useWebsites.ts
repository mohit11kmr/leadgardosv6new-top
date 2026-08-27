import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  archiveWebsite,
  createWebsite,
  getWebsite,
  getWebsites,
  updateWebsite,
  type Website,
} from '../api/websites.js';

export function useWebsites() {
  const queryClient = useQueryClient();

  const websitesQuery = useQuery<Website[]>({
    queryKey: ['websites'],
    queryFn: getWebsites,
  });

  const createMutation = useMutation({
    mutationFn: (input: { name: string; url: string }) => createWebsite(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['websites'] });
    },
  });

  const archiveMutation = useMutation({
    mutationFn: (id: string) => archiveWebsite(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['websites'] });
    },
  });

  return {
    websites: websitesQuery.data ?? [],
    isLoading: websitesQuery.isLoading,
    isError: websitesQuery.isError,
    error: websitesQuery.error,
    refetch: websitesQuery.refetch,
    createWebsite: createMutation.mutateAsync,
    isCreating: createMutation.isPending,
    archiveWebsite: archiveMutation.mutateAsync,
  };
}

export function useWebsite(id: string | undefined) {
  const queryClient = useQueryClient();

  const websiteQuery = useQuery<Website>({
    queryKey: ['website', id],
    queryFn: () => getWebsite(id!),
    enabled: Boolean(id),
  });

  const updateMutation = useMutation({
    mutationFn: (input: { name?: string; url?: string }) => updateWebsite(id!, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['website', id] });
      queryClient.invalidateQueries({ queryKey: ['websites'] });
    },
  });

  return {
    website: websiteQuery.data,
    isLoading: websiteQuery.isLoading,
    isError: websiteQuery.isError,
    error: websiteQuery.error,
    refetch: websiteQuery.refetch,
    updateWebsite: updateMutation.mutateAsync,
    isUpdating: updateMutation.isPending,
  };
}
