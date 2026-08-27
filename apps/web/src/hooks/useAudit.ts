import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  cancelAudit,
  getAudit,
  getAuditFindings,
  getAuditPages,
  getAuditProgress,
  getAuditRuns,
  getAudits,
  startAudit,
  type Audit,
  type AuditPage,
  type AuditRun,
  type FindingsFilterParams,
  type PaginatedFindingsResponse,
} from '../api/audits.js';

export function useAudits(limit = 25) {
  const auditsQuery = useQuery<Audit[]>({
    queryKey: ['audits', { limit }],
    queryFn: () => getAudits(limit),
  });

  return {
    audits: auditsQuery.data ?? [],
    isLoading: auditsQuery.isLoading,
    isError: auditsQuery.isError,
    error: auditsQuery.error,
    refetch: auditsQuery.refetch,
  };
}

export function useAudit(id: string | undefined) {
  const queryClient = useQueryClient();

  const auditQuery = useQuery<Audit>({
    queryKey: ['audit', id],
    queryFn: () => getAudit(id!),
    enabled: Boolean(id),
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      if (status === 'QUEUED' || status === 'RUNNING') return 1500;
      return false;
    },
  });

  const startMutation = useMutation({
    mutationFn: (vars: { websiteId: string; idempotencyKey?: string }) =>
      startAudit(vars.websiteId, vars.idempotencyKey),
    onSuccess: (newAudit) => {
      queryClient.invalidateQueries({ queryKey: ['audits'] });
      queryClient.invalidateQueries({ queryKey: ['websites'] });
      queryClient.invalidateQueries({ queryKey: ['website', newAudit.websiteId] });
    },
  });

  const cancelMutation = useMutation({
    mutationFn: () => cancelAudit(id!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['audit', id] });
    },
  });

  return {
    audit: auditQuery.data,
    isLoading: auditQuery.isLoading,
    isError: auditQuery.isError,
    error: auditQuery.error,
    refetch: auditQuery.refetch,
    startAudit: startMutation.mutateAsync,
    isStarting: startMutation.isPending,
    cancelAudit: cancelMutation.mutateAsync,
    isCancelling: cancelMutation.isPending,
  };
}

export function useAuditFindings(id: string | undefined, filters: FindingsFilterParams = {}) {
  return useQuery<PaginatedFindingsResponse>({
    queryKey: ['audit-findings', id, filters],
    queryFn: () => getAuditFindings(id!, filters),
    enabled: Boolean(id),
  });
}

export function useAuditPages(id: string | undefined) {
  return useQuery<AuditPage[]>({
    queryKey: ['audit-pages', id],
    queryFn: () => getAuditPages(id!),
    enabled: Boolean(id),
  });
}

export function useAuditRuns(id: string | undefined) {
  return useQuery<AuditRun[]>({
    queryKey: ['audit-runs', id],
    queryFn: () => getAuditRuns(id!),
    enabled: Boolean(id),
  });
}
