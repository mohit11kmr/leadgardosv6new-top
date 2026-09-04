import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { apiClient as api } from '../../api/client.js';

interface QueueHealthSummary {
  name: string;
  waiting: number;
  active: number;
  delayed: number;
  failed: number;
  completed: number;
  paused: number;
}

const bullBoardUrl = `${(import.meta.env.VITE_API_URL ?? 'http://localhost:4000/api/v1').replace(/\/$/, '')}/admin/queues`;

export function OperationsView() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['admin-operations-summary'],
    queryFn: () => api<{ queues: QueueHealthSummary[]; asOf: string }>('/admin/operations/summary'),
    refetchInterval: 15000,
  });

  return (
    <div className="viewContainer">
      <div className="viewHeader">
        <div>
          <div className="breadcrumb">
            <Link to="/admin">Admin</Link> / <span>Operations</span>
          </div>
          <h1 className="viewTitle">Operations — Queue Health</h1>
          <p className="viewSubtitle">
            Real job counts for every real BullMQ queue. So what: a growing "failed" count needs operator
            attention; retry/promote/remove actions happen in Bull Board itself, not here.
          </p>
        </div>
        <a href={bullBoardUrl} target="_blank" rel="noreferrer" className="btn btn-primary btn-sm">
          Open Bull Board (retry / promote / remove) →
        </a>
      </div>

      {isLoading && <div className="loadingState">Loading queue summary...</div>}
      {error && <div className="errorBanner">{(error as Error).message}</div>}

      {data && (
        <>
          <p className="text-muted text-xs mb-4">As of {new Date(data.asOf).toLocaleString()}</p>
          <div className="tableCard">
            <table className="dataTable">
              <thead>
                <tr>
                  <th>Queue</th>
                  <th>Waiting</th>
                  <th>Active</th>
                  <th>Delayed</th>
                  <th>Failed</th>
                  <th>Completed</th>
                  <th>Paused</th>
                </tr>
              </thead>
              <tbody>
                {data.queues.map((q) => (
                  <tr key={q.name}>
                    <td>
                      <strong>{q.name}</strong>
                    </td>
                    <td>{q.waiting}</td>
                    <td>{q.active}</td>
                    <td>{q.delayed}</td>
                    <td>
                      <span className={q.failed > 0 ? 'badge badge-error' : 'badge badge-success'}>{q.failed}</span>
                    </td>
                    <td>{q.completed}</td>
                    <td>{q.paused}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
