import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth.js';
import { Button } from '../../components/ui/Button.js';
import { Input } from '../../components/ui/Input.js';

export function LoginView({ onSwitchToRegister }: { onSwitchToRegister: () => void }) {
  const { login } = useAuth();
  const [email, setEmail] = useState('demo@leadguard.test');
  const [password, setPassword] = useState('SecurePass1234!');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login({ email, password });
      window.location.href = '/dashboard';
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Invalid credentials');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="authContainer">
      <div className="authCard">
        <div className="authHeader">
          <div className="authIcon">🛡️</div>
          <h2>Sign In to LeadGuard OS</h2>
          <p>Revenue & Conversion Vulnerability Diagnostic Platform</p>
        </div>

        {error && <div className="authError">{error}</div>}

        <form onSubmit={handleSubmit} className="authForm">
          <Input
            label="Email Address"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <Input
            label="Password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          <div className="forgotPasswordRow mb3">
            <Link to="/password-reset" className="btnLink textSm">
              Forgot password?
            </Link>
          </div>
          <Button variant="primary" type="submit" isLoading={loading} className="wFull">
            Sign In
          </Button>
        </form>

        <div className="authFooter">
          <span>Don't have an account? </span>
          <button type="button" className="btnLink" onClick={onSwitchToRegister}>
            Create an organization
          </button>
        </div>
      </div>
    </div>
  );
}

export function RegisterView({ onSwitchToLogin }: { onSwitchToLogin: () => void }) {
  const { register } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [orgName, setOrgName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await register({
        email,
        password,
        organizationName: orgName || undefined,
      });
      window.location.href = '/dashboard';
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Registration failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="authContainer">
      <div className="authCard">
        <div className="authHeader">
          <div className="authIcon">🛡️</div>
          <h2>Create Workspace</h2>
          <p>Deploy enterprise conversion & lead protection</p>
        </div>

        {error && <div className="authError">{error}</div>}

        <form onSubmit={handleSubmit} className="authForm">
          <Input
            label="Workspace / Company Name"
            value={orgName}
            placeholder="Acme Growth"
            onChange={(e) => setOrgName(e.target.value)}
          />
          <Input
            label="Email Address"
            type="email"
            value={email}
            placeholder="operator@acme.com"
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <Input
            label="Password (min 12 chars)"
            type="password"
            value={password}
            placeholder="••••••••••••"
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          <Button variant="primary" type="submit" isLoading={loading} className="wFull">
            Get Started
          </Button>
        </form>

        <div className="authFooter">
          <span>Already have an account? </span>
          <button type="button" className="btnLink" onClick={onSwitchToLogin}>
            Sign In
          </button>
        </div>
      </div>
    </div>
  );
}
