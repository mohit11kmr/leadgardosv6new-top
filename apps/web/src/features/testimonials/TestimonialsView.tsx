import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../api.js';

export interface TestimonialItem {
  id: string;
  authorName: string;
  companyName: string | null;
  role: string | null;
  content: string;
  rating: number;
  status: string;
  publishedAt: string | null;
  createdAt: string;
}

export function TestimonialsView() {
  const queryClient = useQueryClient();
  const [isSubmitModalOpen, setIsSubmitModalOpen] = useState(false);
  const [authorName, setAuthorName] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [role, setRole] = useState('');
  const [content, setContent] = useState('');
  const [rating, setRating] = useState(5);

  const { data: testimonials, isLoading, error } = useQuery({
    queryKey: ['testimonials'],
    queryFn: () => api<TestimonialItem[]>('/testimonials'),
  });

  const createMutation = useMutation({
    mutationFn: (data: any) =>
      api<TestimonialItem>('/testimonials', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      setIsSubmitModalOpen(false);
      setAuthorName('');
      setCompanyName('');
      setRole('');
      setContent('');
      queryClient.invalidateQueries({ queryKey: ['testimonials'] });
    },
  });

  const statusMutation = useMutation({
    mutationFn: (params: { id: string; status: string }) =>
      api(`/testimonials/${params.id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status: params.status }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['testimonials'] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api(`/testimonials/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['testimonials'] });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    createMutation.mutate({ authorName, companyName, role, content, rating });
  };

  return (
    <div className="viewContainer">
      <div className="viewHeader">
        <div>
          <h1 className="viewTitle">Customer Testimonials Wall</h1>
          <p className="viewSubtitle">
            Collect, moderate, and publish authentic customer reviews and praise for your agency.
          </p>
        </div>
        <div className="headerActions">
          <button className="btn btn-primary" onClick={() => setIsSubmitModalOpen(true)}>
            + Add Testimonial
          </button>
        </div>
      </div>

      {isLoading && <div className="loadingState">Loading testimonials...</div>}
      {error && <div className="errorBanner">{(error as Error).message}</div>}

      {!isLoading && !error && (
        <div className="tableCard">
          {testimonials && testimonials.length > 0 ? (
            <table className="dataTable">
              <thead>
                <tr>
                  <th>Author & Company</th>
                  <th>Rating</th>
                  <th>Testimonial Quote</th>
                  <th>Status</th>
                  <th>Date</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {testimonials.map((t) => (
                  <tr key={t.id}>
                    <td>
                      <strong>{t.authorName}</strong>
                      <div className="text-muted text-xs">
                        {t.role ? `${t.role}, ` : ''}
                        {t.companyName ? `${t.companyName}` : '—'}
                      </div>
                    </td>
                    <td>{'⭐'.repeat(t.rating)}</td>
                    <td className="max-w-md">
                      <p className="text-sm italic">"{t.content}"</p>
                    </td>
                    <td>
                      <span
                        className={`badge ${
                          t.status === 'APPROVED'
                            ? 'badge-success'
                            : t.status === 'PENDING'
                            ? 'badge-warning'
                            : 'badge-neutral'
                        }`}
                      >
                        {t.status}
                      </span>
                    </td>
                    <td>{new Date(t.createdAt).toLocaleDateString()}</td>
                    <td>
                      <div className="flex gap-2">
                        {t.status !== 'APPROVED' && (
                          <button
                            className="btn btn-success btn-sm"
                            onClick={() => statusMutation.mutate({ id: t.id, status: 'APPROVED' })}
                            disabled={statusMutation.isPending}
                          >
                            Approve
                          </button>
                        )}
                        {t.status !== 'REJECTED' && (
                          <button
                            className="btn btn-secondary btn-sm"
                            onClick={() => statusMutation.mutate({ id: t.id, status: 'REJECTED' })}
                            disabled={statusMutation.isPending}
                          >
                            Reject
                          </button>
                        )}
                        <button
                          className="btn btn-danger btn-sm"
                          onClick={() => deleteMutation.mutate(t.id)}
                          disabled={deleteMutation.isPending}
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="emptyState">
              <div className="emptyIcon">💬</div>
              <h3>No testimonials recorded yet</h3>
              <p>Add client feedback to showcase social proof on reports and public embeds.</p>
            </div>
          )}
        </div>
      )}

      {/* Add Testimonial Modal */}
      {isSubmitModalOpen && (
        <div className="modalBackdrop">
          <div className="modalCard">
            <h2 className="modalTitle">Add Customer Testimonial</h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="formGroup">
                <label className="formLabel">Author Name</label>
                <input
                  type="text"
                  className="formInput"
                  placeholder="e.g. Sarah Jenkins"
                  value={authorName}
                  onChange={(e) => setAuthorName(e.target.value)}
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="formGroup">
                  <label className="formLabel">Company / Brand</label>
                  <input
                    type="text"
                    className="formInput"
                    placeholder="e.g. Acme Corp"
                    value={companyName}
                    onChange={(e) => setCompanyName(e.target.value)}
                  />
                </div>
                <div className="formGroup">
                  <label className="formLabel">Role / Title</label>
                  <input
                    type="text"
                    className="formInput"
                    placeholder="e.g. VP Marketing"
                    value={role}
                    onChange={(e) => setRole(e.target.value)}
                  />
                </div>
              </div>

              <div className="formGroup">
                <label className="formLabel">Rating</label>
                <select
                  className="formSelect"
                  value={rating}
                  onChange={(e) => setRating(Number(e.target.value))}
                >
                  <option value="5">⭐⭐⭐⭐⭐ (5/5 Excellent)</option>
                  <option value="4">⭐⭐⭐⭐ (4/5 Very Good)</option>
                  <option value="3">⭐⭐⭐ (3/5 Average)</option>
                </select>
              </div>

              <div className="formGroup">
                <label className="formLabel">Quote / Testimonial</label>
                <textarea
                  className="formInput h-24"
                  placeholder="Write the client's testimonial..."
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  required
                />
              </div>

              <div className="modalActions">
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => setIsSubmitModalOpen(false)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={createMutation.isPending || !authorName || !content}
                >
                  {createMutation.isPending ? 'Submitting...' : 'Submit Testimonial'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
