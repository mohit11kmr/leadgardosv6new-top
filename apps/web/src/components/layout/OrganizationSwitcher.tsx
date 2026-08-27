import React from 'react';
import { useOrganizations } from '../../hooks/useOrganizations.js';

export function OrganizationSwitcher() {
  const { organizations, activeOrganizationId, switchOrganization, isSwitching } = useOrganizations();

  if (organizations.length <= 1) {
    const active = organizations.find((o) => o.id === activeOrganizationId);
    return (
      <div className="orgBadgeStatic">
        <span className="orgIcon">🏢</span>
        <span className="orgName">{active?.name ?? 'My Workspace'}</span>
      </div>
    );
  }

  return (
    <div className="orgSwitcherContainer">
      <span className="orgIcon">🏢</span>
      <select
        className="orgSelect"
        value={activeOrganizationId || ''}
        disabled={isSwitching}
        onChange={async (e) => {
          if (e.target.value && e.target.value !== activeOrganizationId) {
            await switchOrganization(e.target.value);
          }
        }}
      >
        {organizations.map((org) => (
          <option key={org.id} value={org.id}>
            {org.name}
          </option>
        ))}
      </select>
    </div>
  );
}
