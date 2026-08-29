import React from 'react';

export interface PillarScoreData {
  lead: number;
  advertising: number;
  seo: number;
  security: number;
}

export interface PillarScoreProps {
  category: 'lead' | 'advertising' | 'seo' | 'security' | 'LEAD_CAPTURE' | 'ADVERTISING' | 'SEO' | 'SECURITY';
  score: number;
  weight?: number;
  label?: string;
  subtext?: string;
  showBar?: boolean;
}

export const PILLAR_METADATA: Record<string, { label: string; weight: number; weightLabel: string; desc: string }> = {
  lead: {
    label: 'Lead Capture',
    weight: 35,
    weightLabel: '35% Weight',
    desc: 'Contact forms, RFC-3966 phone numbers, WhatsApp click-to-chat links.',
  },
  advertising: {
    label: 'Advertising & Tracking',
    weight: 25,
    weightLabel: '25% Weight',
    desc: 'Meta Pixel, Google Tag Manager, GA4, ad attribution tags.',
  },
  seo: {
    label: 'SEO & Search Hygiene',
    weight: 20,
    weightLabel: '20% Weight',
    desc: 'Viewport tags, canonical URLs, robots indexation, meta titles.',
  },
  security: {
    label: 'Security & TLS',
    weight: 20,
    weightLabel: '20% Weight',
    desc: 'HTTPS certificate validity, HSTS, CSP, X-Frame-Options.',
  },
};

function normalizeKey(cat: string): 'lead' | 'advertising' | 'seo' | 'security' {
  const lower = cat.toLowerCase();
  if (lower.includes('lead')) return 'lead';
  if (lower.includes('ad') || lower.includes('track')) return 'advertising';
  if (lower.includes('seo')) return 'seo';
  if (lower.includes('sec')) return 'security';
  return 'lead';
}

export function PillarScore({
  category,
  score,
  weight,
  label,
  subtext,
  showBar = true,
}: PillarScoreProps) {
  const normKey = normalizeKey(category);
  const meta = PILLAR_METADATA[normKey];
  const displayLabel = label ?? meta.label;
  const displayWeight = weight !== undefined ? `${weight}% Weight` : meta.weightLabel;
  const normalizedScore = Math.max(0, Math.min(100, Math.round(score)));

  const colorClass =
    normalizedScore >= 80 ? 'textSuccess' : normalizedScore >= 60 ? 'textWarning' : 'textDanger';
  const barColor =
    normalizedScore >= 80 ? 'var(--success)' : normalizedScore >= 60 ? 'var(--warning)' : 'var(--danger)';

  return (
    <div className="pillarScoreCard card">
      <div className="flexBetween mb2">
        <div className="flexCol">
          <span className="fontBold textSm textPrimary">{displayLabel}</span>
          <span className="textXs textMuted">{displayWeight}</span>
        </div>
        <div className="flexRow gap2">
          <span className={`fontBold textLg ${colorClass}`}>{normalizedScore}</span>
          <span className="textXs textMuted">/100</span>
        </div>
      </div>

      {showBar && (
        <div
          style={{
            height: '6px',
            borderRadius: 'var(--radius-full)',
            backgroundColor: 'var(--bg-surface-elevated)',
            overflow: 'hidden',
            marginBottom: '8px',
          }}
        >
          <div
            style={{
              height: '100%',
              width: `${normalizedScore}%`,
              backgroundColor: barColor,
              borderRadius: 'var(--radius-full)',
              transition: 'width 0.4s ease',
            }}
          />
        </div>
      )}

      {subtext ? (
        <p className="textXs textMuted" style={{ margin: 0 }}>
          {subtext}
        </p>
      ) : (
        <p className="textXs textMuted" style={{ margin: 0 }}>
          {meta.desc}
        </p>
      )}
    </div>
  );
}

export function PillarScoreGrid({ scores }: { scores: PillarScoreData }) {
  return (
    <div className="grid4">
      <PillarScore category="lead" score={scores.lead} />
      <PillarScore category="advertising" score={scores.advertising} />
      <PillarScore category="seo" score={scores.seo} />
      <PillarScore category="security" score={scores.security} />
    </div>
  );
}
