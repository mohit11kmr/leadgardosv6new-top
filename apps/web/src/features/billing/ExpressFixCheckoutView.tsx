import React, { useEffect, useState } from 'react';
import { useSearchParams, useNavigate, Link } from 'react-router-dom';
import { apiClient } from '../../api/client.js';
import { IconShield, IconCreditCard, IconCheckCircle, IconAlertCircle, IconLock, IconArrowRight, IconMail, IconGlobe, IconFileText, IconClock, IconHelpCircle } from '../../components/ui/Icons.js';

interface ExpressFixOrder {
  orderId: string;
  amount: number;
  currency: string;
  keyId: string;
  purpose: string;
}

interface ScanData {
  id: string;
  website: {
    id: string;
    name: string;
    url: string;
    domain: string;
  };
  score: {
    overall: number;
    lead: number;
    advertising: number;
    seo: number;
    security: number;
  } | null;
  findings: Array<{
    id: string;
    title: string;
    category: string;
    severity: string;
    scoreImpact: number;
  }> | undefined;
  status: string;
}

export function ExpressFixCheckoutView() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const scanId = searchParams.get('scanId');
  const websiteId = searchParams.get('websiteId');
  const auditId = searchParams.get('auditId');

  const [order, setOrder] = useState<ExpressFixOrder | null>(null);
  const [scan, setScan] = useState<ScanData | null>(null);
  const [loading, setLoading] = useState(true);
  const [creatingOrder, setCreatingOrder] = useState(false);
  const [paymentComplete, setPaymentComplete] = useState(false);
  const [paymentFailed, setPaymentFailed] = useState<string | null>(null);
  const [fulfillmentId, setFulfillmentId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [rzpLoaded, setRzpLoaded] = useState(false);
  const [showEmailForm, setShowEmailForm] = useState(true);
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');

  useEffect(() => {
    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.async = true;
    script.onload = () => setRzpLoaded(true);
    script.onerror = () => setError('Failed to load Razorpay. Please check your connection.');
    document.body.appendChild(script);
    return () => {
      document.body.removeChild(script);
    };
  }, []);

  useEffect(() => {
    const fetchData = async () => {
      if (!scanId || !websiteId) {
        setError('Missing scan or website information');
        setLoading(false);
        return;
      }

      try {
        const scanData = await apiClient<ScanData>(`/public/scan/${scanId}`);
        setScan(scanData);
        setLoading(false);
      } catch (err: any) {
        setError(err.message || 'Failed to load checkout');
        setLoading(false);
      }
    };

    fetchData();
  }, [scanId, websiteId, auditId]);

  const handleCreateOrder = async () => {
    if (!email || !email.includes('@')) {
      setError('Please enter a valid email address');
      return;
    }

    if (!scanId) {
      setError('Missing scan information');
      return;
    }

    setCreatingOrder(true);
    setError(null);

    try {
      const orderData = await apiClient<ExpressFixOrder>('/public/express-fix/checkout', {
        method: 'POST',
        body: JSON.stringify({ scanId, email, name: name || undefined }),
      });

      setOrder(orderData);
      setShowEmailForm(false);
      setCreatingOrder(false);
    } catch (err: any) {
      setError(err.response?.data?.error?.message || err.message || 'Failed to create order');
      setCreatingOrder(false);
    }
  };

  const handlePayment = async () => {
    if (!order || !rzpLoaded || !window.Razorpay) {
      setError('Payment system not ready. Please refresh and try again.');
      return;
    }

    setCreatingOrder(true);
    setError(null);

    const options = {
      key: order.keyId,
      amount: order.amount,
      currency: order.currency,
      name: 'LeadGuard OS',
      description: 'Express Fix — High-Priority Remediation',
      order_id: order.orderId,
      handler: async (response: any) => {
        try {
          await verifyPayment(response);
        } catch (err: any) {
          setError(err.message || 'Payment verification failed');
          setCreatingOrder(false);
        }
      },
      prefill: {
        email: email,
        name: name || undefined,
      },
      notes: {
        scan_id: scanId || '',
        website_id: websiteId || '',
        audit_id: auditId || '',
      },
      theme: {
        color: '#2563eb',
      },
      modal: {
        ondismiss: () => {
          setCreatingOrder(false);
        },
      },
    };

    const rzp = new window.Razorpay(options);
    rzp.on('payment.failed', (response: any) => {
      setPaymentFailed('Your payment was not completed and no charge was made. You can try again below or return to your scan results.');
      setCreatingOrder(false);
    });
    rzp.open();
  };

  const verifyPayment = async (response: any) => {
    const result = await apiClient<{ success: boolean; data: any }>('/public/express-fix/verify', {
      method: 'POST',
      body: JSON.stringify({
        orderId: response.razorpay_order_id,
        paymentId: response.razorpay_payment_id,
        signature: response.razorpay_signature,
        scanId,
      }),
    });

    if (result.success) {
      setFulfillmentId(result.data?.fulfillmentId ?? null);
      setPaymentComplete(true);
      setCreatingOrder(false);
    } else {
      throw new Error('Payment verification failed');
    }
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'CRITICAL': return '#ef4444';
      case 'HIGH': return '#f97316';
      case 'MEDIUM': return '#f59e0b';
      case 'LOW': return '#38bdf8';
      case 'INFO': return '#64748b';
      default: return '#64748b';
    }
  };

  const topFindings = scan?.findings?.slice(0, 3) || [];

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', background: '#0b0f19', color: '#f8fafc', fontFamily: 'Inter, -apple-system, sans-serif', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ width: '48px', height: '48px', border: '4px solid #1e293b', borderTopColor: '#38bdf8', borderRadius: '50%', margin: '0 auto 24px', animation: 'spin 1s linear infinite' }} />
          <p style={{ fontSize: '16px', color: '#94a3b8' }}>Preparing secure checkout...</p>
        </div>
        <style dangerouslySetInnerHTML={{ __html: '@keyframes spin { to { transform: rotate(360deg); } }' }} />
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ minHeight: '100vh', background: '#0b0f19', color: '#f8fafc', fontFamily: 'Inter, -apple-system, sans-serif', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px' }}>
        <div style={{ textAlign: 'center', maxWidth: '400px' }}>
          <IconAlertCircle size={48} color="#ef4444" style={{ marginBottom: '16px' }} />
          <h2 style={{ fontSize: '24px', fontWeight: '700', marginBottom: '8px' }}>Checkout Error</h2>
          <p style={{ fontSize: '15px', color: '#94a3b8', marginBottom: '24px' }}>{error}</p>
          <button onClick={() => window.location.reload()} style={{ background: 'linear-gradient(135deg, #2563eb, #1d4ed8)', color: '#fff', border: 'none', padding: '12px 24px', borderRadius: '8px', fontWeight: '600', cursor: 'pointer' }}>Try Again</button>
        </div>
      </div>
    );
  }

  if (paymentComplete) {
    return (
      <div style={{ minHeight: '100vh', background: '#0b0f19', color: '#f8fafc', fontFamily: 'Inter, -apple-system, sans-serif', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px' }}>
        <div style={{ textAlign: 'center', maxWidth: '500px' }}>
          <div style={{ width: '80px', height: '80px', background: 'linear-gradient(135deg, #10b981, #059669)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 24px', boxShadow: '0 0 32px rgba(16, 185, 129, 0.3)' }}>
            <IconCheckCircle size={40} color="#fff" />
          </div>
          <h2 style={{ fontSize: '28px', fontWeight: '800', color: '#fff', marginBottom: '8px' }}>Payment Successful</h2>
          <p style={{ fontSize: '16px', color: '#94a3b8', marginBottom: '32px' }}>Your Express Fix remediation request has been received and queued.</p>

          <div style={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: '12px', padding: '24px', textAlign: 'left', marginBottom: '24px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px', paddingBottom: '16px', borderBottom: '1px solid #1e293b' }}>
              <IconFileText size={20} color="#38bdf8" />
              <span style={{ fontSize: '16px', fontWeight: '600', color: '#fff' }}>Order Details</span>
            </div>
            <div style={{ display: 'grid', gap: '12px', fontSize: '14px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: '#94a3b8' }}>Payment Reference</span>
                <code style={{ color: '#fff', fontFamily: 'monospace' }}>{order?.orderId}</code>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: '#94a3b8' }}>Audit Reference</span>
                <code style={{ color: '#fff', fontFamily: 'monospace' }}>{auditId?.slice(0, 8)}</code>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: '#94a3b8' }}>Website</span>
                <span style={{ color: '#fff' }}>{scan?.website.domain}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: '#94a3b8' }}>Amount Paid</span>
                <span style={{ color: '#10b981', fontWeight: '600' }}>₹{(order?.amount || 299900) / 100}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: '#94a3b8' }}>Status</span>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', color: '#10b981', background: 'rgba(16, 185, 129, 0.1)', padding: '4px 10px', borderRadius: '6px', fontSize: '12px', fontWeight: '600' }}>
                  <span style={{ width: '8px', height: '8px', background: '#10b981', borderRadius: '50%' }} />
                  Remediation Queued
                </span>
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <button onClick={() => navigate(`/scan/${scanId}`)} style={{ background: 'linear-gradient(135deg, #2563eb, #38bdf8)', color: '#fff', border: 'none', padding: '14px 24px', borderRadius: '10px', fontWeight: '700', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
              <IconArrowRight size={18} />
              View Scan Results
            </button>
            <Link to="/register" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '8px', background: '#1e293b', color: '#fff', textDecoration: 'none', padding: '14px 24px', borderRadius: '10px', fontWeight: '600', border: '1px solid #334155' }}>
              <IconMail size={18} />
              Create Account to Track Progress
            </Link>
          </div>

          <p style={{ marginTop: '24px', fontSize: '12px', color: '#64748b' }}>
            Our engineering team will review the critical and high-priority findings and deliver remediation guidance within 2 business days. You'll receive an email with the completion summary.
          </p>
        </div>
      </div>
    );
  }

  if (!scan) {
    return null;
  }

  return (
    <div style={{ minHeight: '100vh', background: '#0b0f19', color: '#f8fafc', fontFamily: 'Inter, -apple-system, sans-serif' }}>
      <header style={{
        position: 'sticky',
        top: 0,
        zIndex: 50,
        background: 'rgba(15, 23, 42, 0.85)',
        backdropFilter: 'blur(12px)',
        borderBottom: '1px solid #1e293b',
        padding: '16px 32px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '32px' }}>
          <Link to="/" style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{ width: '32px', height: '32px', background: 'linear-gradient(135deg, #2563eb, #38bdf8)', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: '800', color: '#fff', fontSize: '15px', boxShadow: '0 0 16px rgba(56, 189, 248, 0.35)' }}>LG</div>
            <span style={{ fontSize: '19px', fontWeight: '800', color: '#fff', letterSpacing: '-0.02em' }}>LeadGuard <span style={{ color: '#38bdf8' }}>OS</span></span>
          </Link>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px', fontSize: '14px' }}>
          <Link to="/login" style={{ color: '#cbd5e1', textDecoration: 'none', fontWeight: '600', padding: '8px 16px', borderRadius: '6px' }}>Sign In</Link>
          <Link to="/register" style={{ background: 'linear-gradient(135deg, #2563eb, #1d4ed8)', color: '#fff', textDecoration: 'none', fontWeight: '600', padding: '8px 20px', borderRadius: '6px', boxShadow: '0 4px 12px rgba(37, 99, 235, 0.3)' }}>Create Free Account</Link>
        </div>
      </header>

      <main style={{ maxWidth: '800px', margin: '0 auto', padding: '48px 24px' }}>
        {/* Order Summary */}
        <div style={{ marginBottom: '32px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
            <div style={{ width: '48px', height: '48px', background: 'linear-gradient(135deg, #2563eb, #38bdf8)', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 8px 24px rgba(37, 99, 235, 0.3)' }}>
              <IconCreditCard size={24} color="#fff" />
            </div>
            <div>
              <h1 style={{ fontSize: '28px', fontWeight: '800', color: '#fff', margin: 0 }}>Express Fix Checkout</h1>
              <p style={{ fontSize: '14px', color: '#94a3b8', margin: '4px 0 0' }}>One-time expert remediation for your lead leaks</p>
            </div>
          </div>
        </div>

        {/* Website & Audit Info */}
        <div style={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: '12px', padding: '20px', marginBottom: '24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
            <div style={{ width: '40px', height: '40px', background: 'linear-gradient(135deg, #10b981, #059669)', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <IconGlobe size={20} color="#fff" />
            </div>
            <div>
              <div style={{ fontSize: '16px', fontWeight: '700', color: '#fff' }}>{scan.website.domain}</div>
              <div style={{ fontSize: '13px', color: '#94a3b8' }}>{scan.website.url}</div>
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px', fontSize: '13px' }}>
            <div><span style={{ color: '#94a3b8' }}>Lead Health Score</span><br /><span style={{ color: '#fff', fontWeight: '600', fontSize: '18px' }}>{scan.score?.overall || 0}/100</span></div>
            <div><span style={{ color: '#94a3b8' }}>Critical Issues</span><br /><span style={{ color: '#ef4444', fontWeight: '600', fontSize: '18px' }}>{topFindings.filter(f => f.severity === 'CRITICAL').length}</span></div>
            <div><span style={{ color: '#94a3b8' }}>High Issues</span><br /><span style={{ color: '#f97316', fontWeight: '600', fontSize: '18px' }}>{topFindings.filter(f => f.severity === 'HIGH').length}</span></div>
          </div>
        </div>

        {/* Top Issues Being Fixed */}
        {topFindings.length > 0 && (
          <div style={{ marginBottom: '24px' }}>
            <h3 style={{ fontSize: '16px', fontWeight: '700', color: '#fff', marginBottom: '16px' }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
                <IconShield size={18} color="#f59e0b" />
                Issues Included in This Remediation
              </span>
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {topFindings.map((finding) => (
                <div key={finding.id} style={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: '10px', padding: '16px', borderLeft: `3px solid ${getSeverityColor(finding.severity)}` }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <span style={{ fontSize: '11px', fontWeight: '700', color: getSeverityColor(finding.severity), background: `${getSeverityColor(finding.severity)}20`, padding: '4px 8px', borderRadius: '4px', textTransform: 'uppercase' }}>{finding.severity}</span>
                    <span style={{ fontSize: '12px', color: '#64748b' }}>Score Impact: -{finding.scoreImpact}</span>
                    <span style={{ flex: 1 }} />
                    <span style={{ fontSize: '13px', fontWeight: '600', color: '#fff' }}>{finding.title}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* What You Receive */}
        <div style={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: '12px', padding: '20px', marginBottom: '24px' }}>
          <h3 style={{ fontSize: '16px', fontWeight: '700', color: '#fff', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <IconFileText size={18} color="#38bdf8" />
            What You Receive
          </h3>
          <ul style={{ listStyle: 'none', padding: 0, margin: 0, fontSize: '14px', color: '#cbd5e1', lineHeight: '2.2' }}>
            <li style={{ display: 'flex', alignItems: 'center', gap: '10px' }}><IconCheckCircle size={16} color="#10b981" /> Detailed remediation review by our engineers</li>
            <li style={{ display: 'flex', alignItems: 'center', gap: '10px' }}><IconCheckCircle size={16} color="#10b981" /> Critical & High priority fixes (WhatsApp, Call, Forms, Tracking, Security)</li>
            <li style={{ display: 'flex', alignItems: 'center', gap: '10px' }}><IconCheckCircle size={16} color="#10b981" /> Contact link corrections & implementation guidance</li>
            <li style={{ display: 'flex', alignItems: 'center', gap: '10px' }}><IconCheckCircle size={16} color="#10b981" /> Before/after evidence where applicable</li>
            <li style={{ display: 'flex', alignItems: 'center', gap: '10px' }}><IconCheckCircle size={16} color="#10b981" /> Completion summary delivered via email within 2 business days</li>
          </ul>
        </div>

        {/* Email Collection Form */}
        {showEmailForm && (
          <div style={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: '12px', padding: '24px', marginBottom: '24px' }}>
            <h3 style={{ fontSize: '18px', fontWeight: '700', color: '#fff', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <IconMail size={20} color="#38bdf8" />
              Contact Information
            </h3>
            <p style={{ fontSize: '14px', color: '#94a3b8', marginBottom: '20px' }}>
              We&apos;ll send your Express Fix remediation summary to this email address.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: '500', color: '#cbd5e1', marginBottom: '6px' }}>
                  Email Address <span style={{ color: '#ef4444' }}>*</span>
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="your@email.com"
                  required
                  style={{
                    width: '100%',
                    background: '#1e293b',
                    border: '1px solid #334155',
                    borderRadius: '8px',
                    padding: '12px 16px',
                    color: '#fff',
                    fontSize: '15px',
                    outline: 'none',
                  }}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: '500', color: '#cbd5e1', marginBottom: '6px' }}>
                  Name (optional)
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Your Name"
                  style={{
                    width: '100%',
                    background: '#1e293b',
                    border: '1px solid #334155',
                    borderRadius: '8px',
                    padding: '12px 16px',
                    color: '#fff',
                    fontSize: '15px',
                    outline: 'none',
                  }}
                />
              </div>
            </div>
            {error && (
              <div style={{ marginTop: '16px', padding: '12px', background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.3)', borderRadius: '8px', color: '#fca5a5', fontSize: '14px' }}>
                {error}
              </div>
            )}
            <button
              onClick={handleCreateOrder}
              disabled={creatingOrder || !email}
              style={{
                width: '100%',
                background: creatingOrder || !email ? '#334155' : 'linear-gradient(135deg, #2563eb, #38bdf8)',
                color: '#fff',
                border: 'none',
                padding: '16px 32px',
                borderRadius: '12px',
                fontSize: '16px',
                fontWeight: '700',
                cursor: creatingOrder || !email ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '10px',
                boxShadow: creatingOrder || !email ? 'none' : '0 4px 20px rgba(37, 99, 235, 0.4)',
                marginTop: '8px',
              }}
            >
              {creatingOrder && (
                <svg style={{ width: '20px', height: '20px', animation: 'spin 1s linear infinite' }} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeDasharray="31.4 31.4" />
                </svg>
              )}
              {creatingOrder ? 'Creating Order…' : 'Continue to Secure Checkout — ₹2,999'}
              <style dangerouslySetInnerHTML={{ __html: '@keyframes spin { to { transform: rotate(360deg); } }' }} />
            </button>
          </div>
        )}

        {/* Secure Payment & Pay Button */}
        {!showEmailForm && order && (
          <>
            <div style={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: '12px', padding: '20px', marginBottom: '24px' }}>
              <h3 style={{ fontSize: '16px', fontWeight: '700', color: '#fff', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <IconLock size={18} color="#10b981" />
                Secure Payment — ₹2,999 (GST Inclusive)
              </h3>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', fontSize: '14px', color: '#94a3b8' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><IconLock size={14} /> Razorpay Secure Checkout</span>
                <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><IconShield size={14} /> PCI-DSS Compliant</span>
                <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><IconClock size={14} /> Instant Confirmation</span>
              </div>
            </div>

            {/* Pay Button */}
            <button
              onClick={handlePayment}
              disabled={creatingOrder || !rzpLoaded}
              style={{
                width: '100%',
                background: creatingOrder ? '#334155' : 'linear-gradient(135deg, #2563eb, #38bdf8)',
                color: '#fff',
                border: 'none',
                padding: '18px 32px',
                borderRadius: '12px',
                fontSize: '18px',
                fontWeight: '700',
                cursor: creatingOrder ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '12px',
                boxShadow: creatingOrder ? 'none' : '0 4px 24px rgba(37, 99, 235, 0.4)',
                marginBottom: '16px',
              }}
            >
              {creatingOrder && (
                <svg style={{ width: '22px', height: '22px', animation: 'spin 1s linear infinite' }} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeDasharray="31.4 31.4" />
                </svg>
              )}
              {creatingOrder ? 'Opening Secure Checkout…' : 'Pay ₹2,999 — Secure Checkout'}
              <style dangerouslySetInnerHTML={{ __html: '@keyframes spin { to { transform: rotate(360deg); } }' }} />
            </button>

            <p style={{ textAlign: 'center', fontSize: '13px', color: '#64748b' }}>
              <IconHelpCircle size={14} style={{ verticalAlign: 'middle' }} />
              <span style={{ marginLeft: '6px' }}>This is a manual expert review service, not automated code changes. 100% refund if no actionable fixes found. <Link to="/terms" style={{ color: '#38bdf8', textDecoration: 'underline' }}>Terms apply</Link>.</span>
            </p>
          </>
        )}
      </main>

      <footer style={{ borderTop: '1px solid #1e293b', padding: '32px', background: '#090d16', textAlign: 'center' }}>
        <p style={{ fontSize: '14px', color: '#64748b', margin: 0 }}>LeadGuard OS V6 — Diagnostic Intelligence Platform</p>
      </footer>
    </div>
  );
}

declare global {
  interface Window {
    Razorpay: any;
  }
}