import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { agencyApi, type ProspectCampaign, type Prospect, type Pitch } from '../../api/agency.js';
import { PitchModal } from './PitchModal.js';

export function ProspectCampaignsView() {
  const [campaigns, setCampaigns] = useState<ProspectCampaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [name, setName] = useState('');
  const [sourceType, setSourceType] = useState<'MANUAL' | 'CSV'>('MANUAL');
  const [manualUrls, setManualUrls] = useState('');
  const [csvContent, setCsvContent] = useState('');

  const fetchCampaigns = () => {
    setLoading(true);
    agencyApi
      .getCampaigns()
      .then((data) => {
        setCampaigns(data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  };

  useEffect(() => {
    fetchCampaigns();
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (sourceType === 'MANUAL') {
        const items = manualUrls
          .split('\n')
          .map((u) => u.trim())
          .filter(Boolean)
          .map((url) => ({ url }));
        await agencyApi.createCampaign({ name, sourceType: 'MANUAL', items });
      } else {
        await agencyApi.createCampaign({ name, sourceType: 'CSV', csvContent });
      }

      setShowModal(false);
      setName('');
      setManualUrls('');
      setCsvContent('');
      fetchCampaigns();
    } catch (err: any) {
      alert(err.message || 'Failed to create campaign');
    }
  };

  const handleStart = async (id: string) => {
    try {
      await agencyApi.startCampaign(id);
      fetchCampaigns();
    } catch (err: any) {
      alert(err.message || 'Failed to start campaign');
    }
  };

  return (
    <div className="p-8 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">500-Site Prospect Hunter</h1>
          <p className="text-slate-500">Scan candidate business domains, find conversion gaps, and qualify inbound agency leads</p>
        </div>
        <button className="btn btn-primary" onClick={() => setShowModal(true)}>
          + New Prospect Campaign
        </button>
      </div>

      {loading ? (
        <div className="card">Loading campaigns...</div>
      ) : campaigns.length === 0 ? (
        <div className="card text-center p-12 space-y-4">
          <div className="text-4xl">🎯</div>
          <h3 className="font-semibold text-slate-700">No Prospect Campaigns Created</h3>
          <p className="text-slate-500 max-w-md mx-auto">
            Create a campaign with candidate URLs or upload a CSV with up to 500 websites to audit and rank prospects automatically.
          </p>
          <button className="btn btn-primary" onClick={() => setShowModal(true)}>
            Launch First Campaign
          </button>
        </div>
      ) : (
        <div className="card overflow-hidden">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b bg-slate-50 text-xs font-semibold text-slate-600">
                <th className="p-3">Campaign Name</th>
                <th className="p-3">Source</th>
                <th className="p-3">Status</th>
                <th className="p-3">Progress</th>
                <th className="p-3">Qualified Leads</th>
                <th className="p-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y text-sm">
              {campaigns.map((camp) => (
                <tr key={camp.id} className="hover:bg-slate-50">
                  <td className="p-3 font-semibold text-indigo-600">
                    <Link to={`/agency/prospects/${camp.id}`}>{camp.name}</Link>
                  </td>
                  <td className="p-3 text-xs">{camp.source}</td>
                  <td className="p-3">
                    <span
                      className={`badge ${
                        camp.status === 'COMPLETED'
                          ? 'badge-emerald'
                          : camp.status === 'RUNNING'
                          ? 'badge-indigo'
                          : 'badge-slate'
                      }`}
                    >
                      {camp.status}
                    </span>
                  </td>
                  <td className="p-3">
                    {camp.processedCount} / {camp.targetCount}
                  </td>
                  <td className="p-3 font-semibold text-emerald-600">
                    {camp.qualifiedCount} leads
                  </td>
                  <td className="p-3 text-right space-x-2">
                    {camp.status === 'DRAFT' && (
                      <button className="btn btn-xs btn-primary" onClick={() => handleStart(camp.id)}>
                        Start Scan
                      </button>
                    )}
                    <Link to={`/agency/prospects/${camp.id}`} className="btn btn-xs btn-outline">
                      View Prospects →
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Create Modal */}
      {showModal && (
        <div className="modalBackdrop">
          <div className="modalCard card max-w-lg">
            <h2 className="text-xl font-bold mb-4">New Prospect Campaign</h2>
            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <label className="label">Campaign Name *</label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="input"
                  placeholder="e.g. Austin Dental Clinics Batch #1"
                />
              </div>

              <div>
                <label className="label">Ingestion Source</label>
                <div className="flex gap-4 mb-2">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="sourceType"
                      checked={sourceType === 'MANUAL'}
                      onChange={() => setSourceType('MANUAL')}
                    />
                    <span>Manual URLs (One per line)</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="sourceType"
                      checked={sourceType === 'CSV'}
                      onChange={() => setSourceType('CSV')}
                    />
                    <span>CSV Ingestion</span>
                  </label>
                </div>
              </div>

              {sourceType === 'MANUAL' ? (
                <div>
                  <label className="label">Candidate URLs (Up to 500)</label>
                  <textarea
                    required
                    value={manualUrls}
                    onChange={(e) => setManualUrls(e.target.value)}
                    className="input font-mono text-xs"
                    rows={6}
                    placeholder="https://clinic1.com&#10;https://clinic2.com&#10;https://clinic3.com"
                  />
                </div>
              ) : (
                <div>
                  <label className="label">CSV Content (Headers: url, businessName, industry, location)</label>
                  <textarea
                    required
                    value={csvContent}
                    onChange={(e) => setCsvContent(e.target.value)}
                    className="input font-mono text-xs"
                    rows={6}
                    placeholder="url,businessName,industry,location&#10;https://example.com,Example Co,Healthcare,Austin"
                  />
                </div>
              )}

              <div className="flex justify-end gap-3 pt-4">
                <button type="button" className="btn btn-ghost" onClick={() => setShowModal(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary">
                  Create Campaign
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export function ProspectDetailView() {
  const { id } = useParams<{ id: string }>();
  const [campaign, setCampaign] = useState<(ProspectCampaign & { prospects: Prospect[] }) | null>(null);
  const [selectedProspect, setSelectedProspect] = useState<Prospect | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchCampaign = () => {
    if (!id) return;
    agencyApi
      .getCampaign(id)
      .then((data) => {
        setCampaign(data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  };

  useEffect(() => {
    fetchCampaign();
  }, [id]);

  if (loading) return <div className="p-8 card">Loading campaign prospects...</div>;
  if (!campaign) return <div className="p-8 card errorBanner">Campaign not found.</div>;

  return (
    <div className="p-8 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <Link to="/agency/prospects" className="text-sm text-indigo-600 hover:underline">
            ← Back to Campaigns
          </Link>
          <h1 className="text-2xl font-bold text-slate-800 mt-2">{campaign.name}</h1>
          <p className="text-slate-500">
            {campaign.processedCount} of {campaign.targetCount} audited • {campaign.qualifiedCount} qualified leads
          </p>
        </div>
      </div>

      <div className="card overflow-hidden">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b bg-slate-50 text-xs font-semibold text-slate-600">
              <th className="p-3">Website / Domain</th>
              <th className="p-3">Business</th>
              <th className="p-3">Health Score</th>
              <th className="p-3">Critical Flaws</th>
              <th className="p-3">Status</th>
              <th className="p-3 text-right">AI Cold Pitch</th>
            </tr>
          </thead>
          <tbody className="divide-y text-sm">
            {campaign.prospects.map((prospect) => (
              <tr key={prospect.id} className="hover:bg-slate-50">
                <td className="p-3 font-semibold text-slate-800">
                  <a href={prospect.url} target="_blank" rel="noreferrer" className="hover:underline">
                    {prospect.domain}
                  </a>
                </td>
                <td className="p-3 text-xs text-slate-600">{prospect.businessName || '—'}</td>
                <td className="p-3">
                  {prospect.leadScore !== null && prospect.leadScore !== undefined ? (
                    <span
                      className={`font-bold ${
                        prospect.leadScore < 60
                          ? 'text-rose-600'
                          : prospect.leadScore < 80
                          ? 'text-amber-600'
                          : 'text-emerald-600'
                      }`}
                    >
                      {prospect.leadScore}/100
                    </span>
                  ) : (
                    <span className="text-slate-400">Pending</span>
                  )}
                </td>
                <td className="p-3 font-semibold text-rose-600">{prospect.criticalFindings}</td>
                <td className="p-3">
                  <span
                    className={`badge ${
                      prospect.status === 'QUALIFIED'
                        ? 'badge-emerald'
                        : prospect.status === 'AUDITED'
                        ? 'badge-indigo'
                        : 'badge-slate'
                    }`}
                  >
                    {prospect.status}
                  </span>
                </td>
                <td className="p-3 text-right">
                  <button
                    className="btn btn-xs btn-primary"
                    onClick={() => setSelectedProspect(prospect)}
                  >
                    ✨ Generate Pitch
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {selectedProspect && (
        <PitchModal
          prospect={selectedProspect}
          onClose={() => {
            setSelectedProspect(null);
            fetchCampaign();
          }}
        />
      )}
    </div>
  );
}
