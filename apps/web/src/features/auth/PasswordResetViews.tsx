import React, { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { requestPasswordReset, confirmPasswordReset } from '../../api/auth.js';
import { Button } from '../../components/ui/Button.js';
import { Input } from '../../components/ui/Input.js';

export function PasswordResetRequestView() {
  const [email, setEmail] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await requestPasswordReset(email);
      setMessage(res.message);
      setSubmitted(true);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Request failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="authContainer">
      <div className="authCard">
        <div className="authHeader">
          <div className="authIcon">🔑</div>
          <h2>Reset Password</h2>
          <p>Enter your account email to receive a secure recovery link.</p>
        </div>

        {error && <div className="authError">{error}</div>}

        {submitted ? (
          <div className="authSuccessMessage">
            <p>{message}</p>
            <div className="mt3">
              <Link to="/login" className="btn btn-primary wFull">
                Back to Sign In
              </Link>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="authForm">
            <Input
              label="Email Address"
              type="email"
              placeholder="user@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
            <Button variant="primary" type="submit" isLoading={loading} className="wFull">
              Send Reset Link
            </Button>
          </form>
        )}

        <div className="authFooter">
          <Link to="/login" className="btnLink">
            Return to Sign In
          </Link>
        </div>
      </div>
    </div>
  );
}

export function PasswordResetConfirmView() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') || '';
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (newPassword !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }
    setLoading(true);
    try {
      await confirmPasswordReset(token, newPassword);
      setSuccess(true);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Password reset failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="authContainer">
      <div className="authCard">
        <div className="authHeader">
          <div className="authIcon">🔒</div>
          <h2>Set New Password</h2>
          <p>Choose a secure password with at least 12 characters.</p>
        </div>

        {error && <div className="authError">{error}</div>}

        {success ? (
          <div className="authSuccessMessage">
            <p>Your password has been successfully reset. All active sessions have been terminated.</p>
            <div className="mt3">
              <Link to="/login" className="btn btn-primary wFull">
                Sign In With New Password
              </Link>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="authForm">
            <Input
              label="New Password"
              type="password"
              placeholder="••••••••••••"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              required
              minLength={12}
            />
            <Input
              label="Confirm New Password"
              type="password"
              placeholder="••••••••••••"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              minLength={12}
            />
            <Button variant="primary" type="submit" isLoading={loading} className="wFull">
              Update Password
            </Button>
          </form>
        )}
      </div>
    </div>
  );
}
