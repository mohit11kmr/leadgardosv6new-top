import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { api } from '../../api.js';

export interface AdminUserItem {
  id: string;
  email: string;
  name: string | null;
  isDisabled: boolean;
  disabledReason: string | null;
  emailVerified: boolean;
  organizationsCount: number;
  activeSessionsCount: number;
  createdAt: string;
}

export function AdminUsersView() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');

  const { data, isLoading, error } = useQuery({
    queryKey: ['admin-users', search],
    queryFn: () =>
      api<{ items: AdminUserItem[]; nextCursor: string | null; hasMore: boolean }>(
        `/admin/users${search ? `?search=${encodeURIComponent(search)}` : ''}`
      ),
  });

  const toggleStatusMutation = useMutation({
    mutationFn: (params: { userId: string; disabled: boolean }) =>
      api(`/admin/users/${params.userId}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ disabled: params.disabled }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-users'] });
    },
  });

  const revokeSessionsMutation = useMutation({
    mutationFn: (userId: string) =>
      api(`/admin/users/${userId}/revoke-sessions`, { method: 'POST' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-users'] });
    },
  });

  return (
    <div className="viewContainer">
      <div className="viewHeader">
        <div>
          <div className="breadcrumb">
            <Link to="/admin">Admin</Link> / <span>Users</span>
          </div>
          <h1 className="viewTitle">User Accounts Management</h1>
          <p className="viewSubtitle">
            Inspect users, moderate accounts, and terminate active authentication sessions.
          </p>
        </div>
      </div>

      <div className="flex gap-4 mb-4">
        <input
          type="text"
          className="formInput max-w-md"
          placeholder="Search by email or name..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {isLoading && <div className="loadingState">Loading user directory...</div>}
      {error && <div className="errorBanner">{(error as Error).message}</div>}

      {!isLoading && !error && (
        <div className="tableCard">
          <table className="dataTable">
            <thead>
              <tr>
                <th>User</th>
                <th>Status</th>
                <th>Organizations</th>
                <th>Active Sessions</th>
                <th>Registered</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {data?.items.map((u) => (
                <tr key={u.id}>
                  <td>
                    <strong>{u.name || 'Unnamed User'}</strong>
                    <div className="text-muted text-xs">{u.email}</div>
                  </td>
                  <td>
                    <span
                      className={`badge ${
                        u.isDisabled ? 'badge-error' : 'badge-success'
                      }`}
                    >
                      {u.isDisabled ? 'Disabled' : 'Active'}
                    </span>
                  </td>
                  <td>{u.organizationsCount}</td>
                  <td>{u.activeSessionsCount}</td>
                  <td>{new Date(u.createdAt).toLocaleDateString()}</td>
                  <td>
                    <div className="flex gap-2">
                      <button
                        className={`btn btn-sm ${u.isDisabled ? 'btn-primary' : 'btn-secondary'}`}
                        onClick={() =>
                          toggleStatusMutation.mutate({ userId: u.id, disabled: !u.isDisabled })
                        }
                        disabled={toggleStatusMutation.isPending}
                      >
                        {u.isDisabled ? 'Restore Account' : 'Disable'}
                      </button>
                      <button
                        className="btn btn-danger btn-sm"
                        onClick={() => revokeSessionsMutation.mutate(u.id)}
                        disabled={revokeSessionsMutation.isPending || u.activeSessionsCount === 0}
                      >
                        Revoke Sessions
                      </button>
                    </div>
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
