import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getOrganizations, switchOrganization, type OrganizationListResponse } from '../api/organizations.js';

export function useOrganizations() {
  const queryClient = useQueryClient();

  const orgsQuery = useQuery<OrganizationListResponse>({
    queryKey: ['organizations'],
    queryFn: getOrganizations,
  });

  const switchMutation = useMutation({
    mutationFn: (orgId: string) => switchOrganization(orgId),
    onSuccess: () => {
      // Invalidate all organization-scoped queries immediately to ensure zero stale data leaks
      queryClient.clear();
      queryClient.invalidateQueries();
    },
  });

  return {
    organizations: orgsQuery.data?.organizations ?? [],
    activeOrganizationId: orgsQuery.data?.activeOrganizationId,
    isLoading: orgsQuery.isLoading,
    isError: orgsQuery.isError,
    error: orgsQuery.error,
    refetch: orgsQuery.refetch,
    switchOrganization: switchMutation.mutateAsync,
    isSwitching: switchMutation.isPending,
  };
}
