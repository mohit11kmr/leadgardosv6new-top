import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth.js';
import { OrganizationSwitcher } from './OrganizationSwitcher.js';
import {
  IconDashboard,
  IconWebsites,
  IconAudits,
  IconReports,
  IconMonitoring,
  IconAgency,
  IconDeveloper,
  IconTestimonials,
  IconBilling,
  IconSettings,
  IconAdmin,
  IconShield,
} from '../ui/Icons.js';

export interface ShellProps {
  children: React.ReactNode;
}

export function Shell({ children }: ShellProps) {
  const { authenticated, logout, platformAdmin } = useAuth();
  const location = useLocation();

  const navLinks = [
    { label: 'Dashboard', path: '/dashboard', icon: <IconDashboard size={18} /> },
    { label: 'Websites', path: '/websites', icon: <IconWebsites size={18} /> },
    { label: 'Audits', path: '/audits', icon: <IconAudits size={18} /> },
    { label: 'Reports', path: '/reports', icon: <IconReports size={18} /> },
    { label: 'Watchdog 24/7', path: '/monitoring', icon: <IconMonitoring size={18} /> },
    { label: 'Agency Portal', path: '/agency', icon: <IconAgency size={18} /> },
    { label: 'Developer API', path: '/developer', icon: <IconDeveloper size={18} /> },
    { label: 'Testimonials', path: '/testimonials', icon: <IconTestimonials size={18} /> },
    { label: 'Billing & Plans', path: '/billing', icon: <IconBilling size={18} /> },
    { label: 'Settings', path: '/settings', icon: <IconSettings size={18} /> },
    // Admin Platform is a company-internal surface, not a customer feature —
    // only ever shown to accounts the server confirms are platform admins.
    ...(platformAdmin
      ? [{ label: 'Admin Platform', path: '/admin', icon: <IconAdmin size={18} /> }]
      : []),
  ];

  return (
    <div className="appLayout">
      <header className="appTopbar">
        <div className="topbarLeft">
          <Link to="/dashboard" className="brandLogo">
            <span className="brandShield" style={{ display: 'inline-flex', alignItems: 'center', color: '#38bdf8' }}>
              <IconShield size={20} />
            </span>
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
                    <span className="navIcon" style={{ display: 'inline-flex', alignItems: 'center', marginRight: '8px' }}>
                      {link.icon}
                    </span>
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
