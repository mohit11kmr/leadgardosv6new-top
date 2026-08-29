import React from 'react';

export interface ScoreRingProps {
  score: number;
  label?: string;
  size?: 'sm' | 'md' | 'lg' | 'hero';
  showSubtext?: boolean;
}

export function ScoreRing({
  score,
  label = 'LEAD HEALTH',
  size = 'md',
  showSubtext = true,
}: ScoreRingProps) {
  const normalized = Math.max(0, Math.min(100, Math.round(score)));
  const radius = size === 'hero' ? 56 : size === 'lg' ? 44 : size === 'md' ? 36 : 28;
  const stroke = size === 'hero' ? 10 : size === 'lg' ? 8 : size === 'md' ? 6 : 4;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (normalized / 100) * circumference;

  const colorClass =
    normalized >= 80 ? 'score-green' : normalized >= 60 ? 'score-yellow' : 'score-red';

  return (
    <div
      className={`scoreRingWrapper size-${size} ${colorClass}`}
      role="meter"
      aria-valuenow={normalized}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={`${label}: ${normalized} out of 100`}
    >
      <div className="scoreRingRelative">
        <svg
          className="scoreSvg"
          width={(radius + stroke) * 2}
          height={(radius + stroke) * 2}
          viewBox={`0 0 ${(radius + stroke) * 2} ${(radius + stroke) * 2}`}
        >
          <circle
            className="scoreRingBg"
            cx={radius + stroke}
            cy={radius + stroke}
            r={radius}
            strokeWidth={stroke}
          />
          <circle
            className="scoreRingProgress"
            cx={radius + stroke}
            cy={radius + stroke}
            r={radius}
            strokeWidth={stroke}
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            strokeLinecap="round"
          />
        </svg>
        <div className="scoreRingText">
          <span className="scoreRingValue">{normalized}</span>
          {showSubtext && <span className="scoreRingOutOf">/100</span>}
        </div>
      </div>
      {label && <span className="scoreRingLabel">{label}</span>}
    </div>
  );
}
