import React from 'react';

export interface TabItem {
  id: string;
  label: string;
  count?: number;
  badgeVariant?: string;
}

export interface TabsProps {
  tabs: TabItem[];
  activeTab: string;
  onChange: (id: string) => void;
  className?: string;
}

export function Tabs({ tabs, activeTab, onChange, className = '' }: TabsProps) {
  return (
    <div className={`tabsContainer ${className}`.trim()} role="tablist">
      {tabs.map((tab) => {
        const isActive = activeTab === tab.id;
        return (
          <button
            key={tab.id}
            role="tab"
            aria-selected={isActive}
            className={`tabButton ${isActive ? 'active' : ''}`}
            onClick={() => onChange(tab.id)}
            type="button"
          >
            <span>{tab.label}</span>
            {tab.count !== undefined && (
              <span className={`tabBadge ${tab.badgeVariant || ''}`}>{tab.count}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}
