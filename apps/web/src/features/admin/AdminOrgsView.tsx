import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { apiClient as api } from '../../api/client.js';

export interface AdminOrgItem {
  id: string;
  name: string;
  slug: string;
  isSuspended: boolean;
  suspendedReason: string | null;
  activePlan: string;
  membersCount: number;
  websitesCount: number;
  auditsCount: number;
  createdAt: string;
}

export function AdminOrgsView() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [mutationError, setMutationError] = useState<string | null>(null);

  const { data, isLoading, error } = useQuery({
    queryKey: ['admin-orgs', search],
    queryFn: () =>
      api<{ items: AdminOrgItem[]; nextCursor: string | null; hasMore: boolean }>(
        `/admin/organizations${search ? `?search=${encodeURIComponent(search)}` : ''}`
      ),
  });

  const toggleSuspendMutation = useMutation({
    mutationFn: (params: { orgId: string; suspended: boolean }) =>
      api(`/admin/organizations/${params.orgId}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ suspended: params.suspended }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-orgs'] });
    },
    onError: (err: unknown) => setMutationError(err instanceof Error ? err.message : 'Failed to update organization status'),
  });

  return (
    <div className="viewContainer">
      <div className="viewHeader">
        <div>
          <div className="breadcrumb">
            <Link to="/admin">Admin</Link> / <span>Organizations</span>
          </div>
          <h1 className="viewTitle">Organization Tenant Moderation</h1>
          <p className="viewSubtitle">
            Review customer organizations, commercial plan entitlements, and active workloads.
          </p>
        </div>
      </div>

      <div className="flex gap-4 mb-4">
        <input
          type="text"
          className="formInput max-w-md"
          placeholder="Search by organization name or slug..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {isLoading && <div className="loadingState">Loading organizations...</div>}
      {error && <div className="errorBanner">{(error as Error).message}</div>}
      {mutationError && <div className="errorBanner">{mutationError}</div>}

      {!isLoading && !error && (
        <div className="tableCard">
          <table className="dataTable">
            <thead>
              <tr>
                <th>Organization</th>
                <th>Plan Tier</th>
                <th>Status</th>
                <th>Members</th>
                <th>Websites</th>
                <th>Audits</th>
                <th>Created</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {data?.items.map((org) => (
                <tr key={org.id}>
                  <td>
                    <strong>{org.name}</strong>
                    <div className="text-muted text-xs font-mono">{org.slug}</div>
                  </td>
                  <td>
                    <span className="badge badge-neutral">{org.activePlan}</span>
                  </td>
                  <td>
                    <span
                      className={`badge ${
                        org.isSuspended ? 'badge-error' : 'badge-success'
                      }`}
                    >
                      {org.isSuspended ? 'Suspended' : 'Active'}
                    </span>
                  </td>
                  <td>{org.membersCount}</td>
                  <td>{org.websitesCount}</td>
                  <td>{org.auditsCount}</td>
                  <td>{new Date(org.createdAt).toLocaleDateString()}</td>
                  <td>
                    <Link to={`/admin/organizations/${org.id}`} className="btn btn-sm btn-secondary" style={{ marginRight: '0.5rem' }}>
                      View 360
                    </Link>
                    <button
                      className={`btn btn-sm ${org.isSuspended ? 'btn-primary' : 'btn-danger'}`}
                      onClick={() =>
                        toggleSuspendMutation.mutate({
                          orgId: org.id,
                          suspended: !org.isSuspended,
                        })
                      }
                      disabled={toggleSuspendMutation.isPending}
                    >
                      {org.isSuspended ? 'Restore Access' : 'Suspend'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
