import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth.js';
import { OrganizationSwitcher } from './OrganizationSwitcher.js';

export interface ShellProps {
  children: React.ReactNode;
}

export function Shell({ children }: ShellProps) {
  const { authenticated, logout } = useAuth();
  const location = useLocation();

  const navLinks = [
    { label: 'Dashboard', path: '/dashboard', icon: '📊' },
    { label: 'Websites', path: '/websites', icon: '🌐' },
    { label: 'Audits', path: '/audits', icon: '🔍' },
  ];

  return (
    <div className="appLayout">
      <header className="appTopbar">
        <div className="topbarLeft">
          <Link to="/dashboard" className="brandLogo">
            <span className="brandShield">🛡️</span>
            <span className="brandTitle">LeadGuard <small>OS V6</small></span>
          </Link>
          {authenticated && <OrganizationSwitcher />}
        </div>
        <div className="topbarRight">
          {authenticated ? (
            <button
              className="btn btn-ghost btn-sm"
              onClick={async () => {
                await logout();
                window.location.href = '/login';
              }}
              type="button"
            >
              Sign out
            </button>
          ) : (
            <Link to="/login" className="btn btn-primary btn-sm">
              Sign In
            </Link>
          )}
        </div>
      </header>

      <div className="appBody">
        {authenticated && (
          <aside className="appSidebar">
            <nav className="sidebarNav">
              {navLinks.map((link) => {
                const isActive =
                  location.pathname === link.path ||
                  (link.path !== '/dashboard' && location.pathname.startsWith(link.path));
                return (
                  <Link
                    key={link.path}
                    to={link.path}
                    className={`sidebarLink ${isActive ? 'active' : ''}`}
                  >
                    <span className="navIcon">{link.icon}</span>
                    <span className="navLabel">{link.label}</span>
                  </Link>
                );
              })}
            </nav>
            <div className="sidebarFooter">
              <div className="systemStatus">
                <span className="statusDot green" />
                <span>Engine Active</span>
              </div>
            </div>
          </aside>
        )}

        <main className="appContent">{children}</main>
      </div>
    </div>
  );
}
