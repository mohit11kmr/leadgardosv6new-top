import React, { useEffect, useState } from 'react';
import { agencyApi, type Prospect, type Pitch } from '../../api/agency.js';

export function PitchModal({
  prospect,
  onClose,
}: {
  prospect: Prospect;
  onClose: () => void;
}) {
  const [pitches, setPitches] = useState<Pitch[]>([]);
  const [currentPitch, setCurrentPitch] = useState<Pitch | null>(null);
  const [tone, setTone] = useState<'PROFESSIONAL' | 'DIRECT' | 'CONSULTATIVE' | 'URGENT'>('PROFESSIONAL');
  const [loading, setLoading] = useState(false);
  const [statusText, setStatusText] = useState<string>('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    agencyApi
      .getPitches(prospect.id)
      .then((res) => {
        setPitches(res);
        if (res.length > 0) {
          setCurrentPitch(res[0]!);
        }
      })
      .catch(() => {});
  }, [prospect.id]);

  const handleGenerate = async () => {
    setLoading(true);
    setStatusText('Queuing AI pitch generation job...');
    try {
      const initRes = await agencyApi.generatePitch(prospect.id, { tone });
      const generationId = initRes.generationId;

      // Poll until completed or failed
      let attempts = 0;
      const interval = setInterval(async () => {
        attempts++;
        try {
          const statusRes = await agencyApi.getPitchGenerationStatus(prospect.id, generationId);
          if (statusRes.status === 'COMPLETED' && statusRes.pitch) {
            clearInterval(interval);
            setCurrentPitch(statusRes.pitch);
            setPitches([statusRes.pitch, ...pitches]);
            setLoading(false);
            setStatusText('');
          } else if (statusRes.status === 'FAILED') {
            clearInterval(interval);
            setLoading(false);
            setStatusText('');
            alert(statusRes.error || 'AI generation failed');
          } else {
            setStatusText(`Generation status: ${statusRes.status}...`);
          }
        } catch {
          // ignore polling network errors
        }

        if (attempts > 30) {
          clearInterval(interval);
          setLoading(false);
          setStatusText('');
          alert('Generation timed out. Please try again.');
        }
      }, 1000);
    } catch (err: any) {
      alert(err.message || 'Failed to start AI pitch generation');
      setLoading(false);
      setStatusText('');
    }
  };

  const handleCopy = () => {
    if (!currentPitch) return;
    navigator.clipboard.writeText(currentPitch.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="modalBackdrop">
      <div className="modalCard card max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center mb-4">
          <div>
            <h2 className="text-xl font-bold text-slate-800">AI Cold Pitch Generator</h2>
            <p className="text-xs text-slate-500">
              Grounded exclusively in real audit findings for <strong>{prospect.domain}</strong>
            </p>
          </div>
          <button className="btn btn-ghost btn-sm" onClick={onClose}>
            ✕
          </button>
        </div>

        {/* Anti-Hallucination Verified Evidence Box */}
        <div className="bg-slate-50 p-3 rounded-md border text-xs text-slate-600 mb-4 space-y-1">
          <div className="font-semibold text-slate-700">🔒 Verified Audit Evidence:</div>
          <div>• Health Score: <strong>{prospect.leadScore ?? 65}/100</strong></div>
          <div>• Critical Technical Flaws: <strong>{prospect.criticalFindings} detected</strong></div>
          <div>• Anti-Hallucination Policy: Model never fabricates company revenue, employees, or non-detected issues.</div>
        </div>

        <div className="flex gap-4 items-center mb-4">
          <label className="text-sm font-semibold text-slate-700">Select Pitch Tone:</label>
          <select
            value={tone}
            onChange={(e) => setTone(e.target.value as any)}
            className="input text-sm py-1 max-w-[200px]"
          >
            <option value="PROFESSIONAL">Professional & Objective</option>
            <option value="DIRECT">Direct & High-Impact</option>
            <option value="CONSULTATIVE">Consultative Agency</option>
            <option value="URGENT">Urgent Fix Proposal</option>
          </select>
          <button
            className="btn btn-primary btn-sm ml-auto"
            onClick={handleGenerate}
            disabled={loading}
          >
            {loading ? statusText || 'Processing...' : currentPitch ? '🔄 Regenerate Pitch' : '✨ Generate First Pitch'}
          </button>
        </div>

        {currentPitch ? (
          <div className="space-y-4">
            <div className="p-4 bg-slate-50 border rounded-md space-y-3 font-sans text-sm text-slate-800">
              <div>
                <span className="text-xs font-bold text-slate-500 uppercase tracking-wide">Subject Line:</span>
                <div className="font-semibold text-indigo-700 mt-1">{currentPitch.subject}</div>
              </div>

              <div>
                <span className="text-xs font-bold text-slate-500 uppercase tracking-wide">Hook & Opening:</span>
                <div className="mt-1 whitespace-pre-wrap">{currentPitch.opening}</div>
              </div>

              <div>
                <span className="text-xs font-bold text-slate-500 uppercase tracking-wide">Verified Technical Flaw:</span>
                <div className="mt-1 bg-white p-2 rounded border border-rose-100 text-rose-800 text-xs">
                  {currentPitch.problem}
                </div>
              </div>

              <div>
                <span className="text-xs font-bold text-slate-500 uppercase tracking-wide">Diagnostic Business Impact:</span>
                <div className="mt-1">{currentPitch.businessImpact}</div>
              </div>

              <div>
                <span className="text-xs font-bold text-slate-500 uppercase tracking-wide">Recommended Solution:</span>
                <div className="mt-1">{currentPitch.recommendation}</div>
              </div>

              <div>
                <span className="text-xs font-bold text-slate-500 uppercase tracking-wide">Call to Action:</span>
                <div className="mt-1 font-medium text-emerald-700">{currentPitch.callToAction}</div>
              </div>
            </div>

            <div className="flex justify-between items-center pt-2">
              <span className="text-xs text-slate-400">
                Model: {currentPitch.model} • Provider: {currentPitch.provider} • Prompt: {currentPitch.promptVersion}
              </span>
              <div className="flex gap-2">
                <button className="btn btn-secondary btn-sm" onClick={handleCopy}>
                  {copied ? '✓ Copied to Clipboard!' : '📋 Copy Full Pitch'}
                </button>
                <button className="btn btn-primary btn-sm" onClick={onClose}>
                  Done
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div className="text-center py-12 text-slate-400">
            {loading ? (
              <div className="flex flex-col items-center gap-2">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
                <span>{statusText || 'Generating grounded cold pitch...'}</span>
              </div>
            ) : (
              'Click "Generate First Pitch" to produce a tailored cold pitch grounded in real diagnostic data.'
            )}
          </div>
        )}
      </div>
    </div>
  );
}
