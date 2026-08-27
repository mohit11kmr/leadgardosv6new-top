import React, { useEffect, useState } from 'react';
import { agencyApi, type CompetitorComparison } from '../../api/agency.js';

export function CompetitorRadarView() {
  const [comparisons, setComparisons] = useState<CompetitorComparison[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [name, setName] = useState('');
  const [targetUrl, setTargetUrl] = useState('');
  const [competitorUrls, setCompetitorUrls] = useState('');

  const fetchComparisons = () => {
    setLoading(true);
    agencyApi
      .getCompetitors()
      .then((data) => {
        setComparisons(data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  };

  useEffect(() => {
    fetchComparisons();
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const comps = competitorUrls
        .split('\n')
        .map((u) => u.trim())
        .filter(Boolean);
      await agencyApi.createCompetitor({
        name,
        targetUrl,
        competitorUrls: comps,
      });
      setShowModal(false);
      setName('');
      setTargetUrl('');
      setCompetitorUrls('');
      fetchComparisons();
    } catch (err: any) {
      alert(err.message || 'Failed to create comparison');
    }
  };

  const handleRun = async (id: string) => {
    try {
      await agencyApi.runCompetitor(id);
      fetchComparisons();
    } catch (err: any) {
      alert(err.message || 'Failed to trigger radar');
    }
  };

  return (
    <div className="p-8 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Competitive Weakness Radar</h1>
          <p className="text-slate-500">Benchmark client domains against direct competitors on speed, WhatsApp lead capture, and technical readiness</p>
        </div>
        <button className="btn btn-primary" onClick={() => setShowModal(true)}>
          + New Competitor Benchmark
        </button>
      </div>

      {loading ? (
        <div className="card">Loading radar comparisons...</div>
      ) : comparisons.length === 0 ? (
        <div className="card text-center p-12 space-y-4">
          <div className="text-4xl">⚔️</div>
          <h3 className="font-semibold text-slate-700">No Competitor Benchmarks Yet</h3>
          <p className="text-slate-500 max-w-md mx-auto">
            Compare your client's website with 1 to 5 competitors to uncover conversion gaps, missed WhatsApp channels, and page speed opportunities.
          </p>
          <button className="btn btn-primary" onClick={() => setShowModal(true)}>
            Start First Benchmark
          </button>
        </div>
      ) : (
        <div className="space-y-6">
          {comparisons.map((c) => (
            <div key={c.id} className="card space-y-4">
              <div className="flex justify-between items-center">
                <div>
                  <h3 className="font-bold text-lg text-slate-800">{c.name}</h3>
                  <div className="text-xs text-slate-500">
                    Target: <strong className="text-slate-700">{c.targetUrl}</strong> vs {c.competitorUrls.length} competitors
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className={`badge ${c.status === 'COMPLETED' ? 'badge-emerald' : 'badge-slate'}`}>
                    {c.status}
                  </span>
                  <button className="btn btn-xs btn-outline" onClick={() => handleRun(c.id)}>
                    🔄 Re-run Scan
                  </button>
                </div>
              </div>

              {c.comparisonData ? (
                <div className="grid grid-cols-3 gap-6 pt-2">
                  <div className="p-4 bg-emerald-50 rounded border border-emerald-100 space-y-2">
                    <div className="text-xs font-bold text-emerald-800 uppercase tracking-wide">🏆 Key Strengths</div>
                    <ul className="text-xs text-emerald-700 space-y-1 list-disc list-inside">
                      {c.strengths && c.strengths.length > 0 ? (
                        c.strengths.map((s, i) => <li key={i}>{s}</li>)
                      ) : (
                        <li>Performing on par with competitors.</li>
                      )}
                    </ul>
                  </div>

                  <div className="p-4 bg-rose-50 rounded border border-rose-100 space-y-2">
                    <div className="text-xs font-bold text-rose-800 uppercase tracking-wide">⚠️ Weaknesses / Gaps</div>
                    <ul className="text-xs text-rose-700 space-y-1 list-disc list-inside">
                      {c.weaknesses && c.weaknesses.length > 0 ? (
                        c.weaknesses.map((w, i) => <li key={i}>{w}</li>)
                      ) : (
                        <li>No critical weakness detected.</li>
                      )}
                    </ul>
                  </div>

                  <div className="p-4 bg-indigo-50 rounded border border-indigo-100 space-y-2">
                    <div className="text-xs font-bold text-indigo-800 uppercase tracking-wide">💡 Pitch Opportunities</div>
                    <ul className="text-xs text-indigo-700 space-y-1 list-disc list-inside">
                      {c.opportunities && c.opportunities.length > 0 ? (
                        c.opportunities.map((o, i) => <li key={i}>{o}</li>)
                      ) : (
                        <li>Optimize mobile layout and quick CTAs.</li>
                      )}
                    </ul>
                  </div>
                </div>
              ) : (
                <div className="text-xs text-slate-400 py-4">Benchmark analysis in progress or pending...</div>
              )}
            </div>
          ))}
        </div>
      )}

      {showModal && (
        <div className="modalBackdrop">
          <div className="modalCard card max-w-lg">
            <h2 className="text-xl font-bold mb-4">New Competitor Benchmark</h2>
            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <label className="label">Benchmark Name *</label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="input"
                  placeholder="e.g. Local Dental Clinic vs Top 3 Rivals"
                />
              </div>

              <div>
                <label className="label">Target Website URL *</label>
                <input
                  type="url"
                  required
                  value={targetUrl}
                  onChange={(e) => setTargetUrl(e.target.value)}
                  className="input"
                  placeholder="https://myclientclinic.com"
                />
              </div>

              <div>
                <label className="label">Competitor URLs (1 to 5, one per line) *</label>
                <textarea
                  required
                  value={competitorUrls}
                  onChange={(e) => setCompetitorUrls(e.target.value)}
                  className="input font-mono text-xs"
                  rows={4}
                  placeholder="https://competitor1.com&#10;https://competitor2.com"
                />
              </div>

              <div className="flex justify-end gap-3 pt-4">
                <button type="button" className="btn btn-ghost" onClick={() => setShowModal(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary">
                  Launch Benchmark
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
