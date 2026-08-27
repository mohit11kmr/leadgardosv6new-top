import React from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getSessions, revokeSession, logoutAll, type UserSession } from '../../api/auth.js';
import { Card } from '../../components/ui/Card.js';
import { Badge } from '../../components/ui/Badge.js';
import { Button } from '../../components/ui/Button.js';
import { Skeleton } from '../../components/ui/States.js';

export function SessionsView() {
  const queryClient = useQueryClient();

  const { data: sessions, isLoading } = useQuery<UserSession[]>({
    queryKey: ['user-sessions'],
    queryFn: getSessions,
  });

  const revokeMutation = useMutation({
    mutationFn: (id: string) => revokeSession(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user-sessions'] });
    },
  });

  const logoutAllMutation = useMutation({
    mutationFn: () => logoutAll(),
    onSuccess: () => {
      window.location.href = '/login';
    },
  });

  if (isLoading) {
    return (
      <div className="pageContainer">
        <Skeleton height="50px" className="mb4" />
        <Skeleton height="300px" />
      </div>
    );
  }

  return (
    <div className="pageContainer">
      <div className="pageHeader">
        <div>
          <h1>Active Sessions & Security</h1>
          <p>Manage and monitor devices authorized to access your LeadGuard OS workspace.</p>
        </div>
        <Button
          variant="danger"
          size="sm"
          isLoading={logoutAllMutation.isPending}
          onClick={() => {
            if (confirm('Are you sure you want to sign out from all devices?')) {
              logoutAllMutation.mutate();
            }
          }}
        >
          Revoke All Sessions
        </Button>
      </div>

      <Card className="tableCard">
        <div className="cardHeaderFlex">
          <h3>Authorized Devices & Sessions</h3>
          <Badge variant="neutral">{(sessions ?? []).length} Active Session(s)</Badge>
        </div>
        <table className="dataTable">
          <thead>
            <tr>
              <th>Client / Browser</th>
              <th>IP Address</th>
              <th>Last Active</th>
              <th>Status</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {(sessions ?? []).map((session) => (
              <tr key={session.id}>
                <td>
                  <strong>{session.userAgent ? session.userAgent.slice(0, 50) + '...' : 'Unknown Client'}</strong>
                </td>
                <td>
                  <code>{session.ipAddress || '127.0.0.1'}</code>
                </td>
                <td>{new Date(session.lastSeenAt).toLocaleString()}</td>
                <td>
                  {session.isCurrent ? (
                    <Badge variant="success" size="sm">
                      Current Device
                    </Badge>
                  ) : (
                    <Badge variant="neutral" size="sm">
                      Active
                    </Badge>
                  )}
                </td>
                <td>
                  {!session.isCurrent && (
                    <Button
                      variant="outline"
                      size="sm"
                      isLoading={revokeMutation.isPending && revokeMutation.variables === session.id}
                      onClick={() => revokeMutation.mutate(session.id)}
                    >
                      Revoke
                    </Button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
