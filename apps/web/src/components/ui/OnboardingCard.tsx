import React from 'react';
import { Button } from './Button.js';
import { IconWebsites, IconAudits, IconAlertTriangle, IconCheckCircle, IconMonitoring, IconShield } from './Icons.js';

export interface OnboardingCardProps {
  onAddWebsite: () => void;
}

export function OnboardingCard({ onAddWebsite }: OnboardingCardProps) {
  const steps = [
    {
      number: '1',
      title: 'Register Your Website',
      description: 'Connect your production domain or landing page URL for diagnostic scanning.',
      icon: <IconWebsites size={20} color="#38bdf8" />,
    },
    {
      number: '2',
      title: 'Run First Diagnostic',
      description: 'Execute deep crawl across lead forms, phone links, and tracking pixels.',
      icon: <IconAudits size={20} color="#818cf8" />,
    },
    {
      number: '3',
      title: 'Identify Lead Leakage',
      description: 'Review quantified drop-off points, missing CTAs, and broken conversion paths.',
      icon: <IconAlertTriangle size={20} color="#fbbf24" />,
    },
    {
      number: '4',
      title: 'Apply Priority Fixes',
      description: 'Implement step-by-step remediation guide ranked by highest ROI.',
      icon: <IconCheckCircle size={20} color="#34d399" />,
    },
    {
      number: '5',
      title: 'Enable Watchdog 24/7',
      description: 'Activate continuous multi-page regression monitoring with instant alerts.',
      icon: <IconMonitoring size={20} color="#f472b6" />,
    },
  ];

  return (
    <div
      style={{
        background: 'linear-gradient(180deg, #111726 0%, #0d121f 100%)',
        border: '1px solid #1e293b',
        borderRadius: '16px',
        padding: '40px 32px',
        boxShadow: '0 20px 40px rgba(0, 0, 0, 0.4)',
      }}
    >
      <div style={{ textAlign: 'center', maxWidth: '640px', margin: '0 auto 40px' }}>
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px',
            background: 'rgba(56, 189, 248, 0.1)',
            border: '1px solid rgba(56, 189, 248, 0.25)',
            color: '#38bdf8',
            padding: '6px 14px',
            borderRadius: '9999px',
            fontSize: '13px',
            fontWeight: '600',
            marginBottom: '16px',
          }}
        >
          <IconShield size={16} />
          <span>Getting Started with LeadGuard OS</span>
        </div>
        <h2 style={{ fontSize: '28px', fontWeight: '800', color: '#fff', margin: '0 0 10px', letterSpacing: '-0.02em' }}>
          Welcome to Your Revenue Intelligence Center
        </h2>
        <p style={{ fontSize: '15px', color: '#94a3b8', margin: 0, lineHeight: '1.6' }}>
          Follow these 5 simple steps to safeguard your marketing funnels, detect broken lead capture triggers, and protect revenue.
        </p>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: '16px',
          marginBottom: '40px',
        }}
      >
        {steps.map((step) => (
          <div
            key={step.number}
            style={{
              background: '#172033',
              border: '1px solid #1e293b',
              borderRadius: '12px',
              padding: '20px 16px',
              display: 'flex',
              flexDirection: 'column',
              gap: '12px',
              position: 'relative',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div
                style={{
                  width: '28px',
                  height: '28px',
                  borderRadius: '50%',
                  background: 'rgba(56, 189, 248, 0.15)',
                  color: '#38bdf8',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontWeight: '800',
                  fontSize: '13px',
                }}
              >
                {step.number}
              </div>
              {step.icon}
            </div>
            <div>
              <h4 style={{ fontSize: '14px', fontWeight: '700', color: '#f8fafc', margin: '0 0 4px' }}>
                {step.title}
              </h4>
              <p style={{ fontSize: '12.5px', color: '#94a3b8', margin: 0, lineHeight: '1.5' }}>
                {step.description}
              </p>
            </div>
          </div>
        ))}
      </div>

      <div style={{ textAlign: 'center', display: 'flex', justifyContent: 'center', gap: '16px' }}>
        <Button variant="primary" size="lg" onClick={onAddWebsite}>
          + Add Your First Website
        </Button>
      </div>
    </div>
  );
}
