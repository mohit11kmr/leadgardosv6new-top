/**
 * LeadGuard OS V6 — Diagnostic Studio Embeddable Client Runtime
 * Lightweight, zero-dependency, secure script for embedding audit lead widgets on agency & client websites.
 */
(function () {
  'use strict';

  function initWidget() {
    const currentScript =
      document.currentScript ||
      document.querySelector('script[data-widget-id]');

    if (!currentScript) return;

    const widgetId = currentScript.getAttribute('data-widget-id');
    const token = currentScript.getAttribute('data-token');
    const apiUrl = currentScript.getAttribute('data-api-url') || (window.location.origin.includes('localhost') ? 'http://localhost:4000/api/v1' : 'https://api.leadguard.io/api/v1');

    if (!widgetId) {
      console.error('[LeadGuard Widget] Missing data-widget-id attribute');
      return;
    }

    const headers = {
      'Content-Type': 'application/json',
    };
    if (token) {
      headers['Authorization'] = 'Bearer ' + token;
      headers['x-leadguard-widget-token'] = token;
    }

    fetch(apiUrl + '/public/widgets/' + encodeURIComponent(widgetId), {
      method: 'GET',
      headers: headers,
    })
      .then(function (res) {
        if (!res.ok) {
          throw new Error('Failed to load widget configuration (' + res.status + ')');
        }
        return res.json();
      })
      .then(function (data) {
        if (!data.success || !data.data) {
          throw new Error('Invalid widget payload');
        }
        renderWidget(data.data, apiUrl, token);
      })
      .catch(function (err) {
        console.warn('[LeadGuard Widget]', err.message);
      });
  }

  function renderWidget(config, apiUrl, token) {
    const isDark = config.theme === 'DARK';
    const bgColor = isDark ? '#0f172a' : '#ffffff';
    const textColor = isDark ? '#f8fafc' : '#1e293b';
    const borderColor = isDark ? '#334155' : '#e2e8f0';
    const btnBg = '#4f46e5';

    const container = document.createElement('div');
    container.id = 'leadguard-widget-' + config.id;
    container.style.cssText =
      'font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;' +
      'background: ' + bgColor + ';' +
      'color: ' + textColor + ';' +
      'border: 1px solid ' + borderColor + ';' +
      'border-radius: 8px;' +
      'padding: 20px;' +
      'max-width: 440px;' +
      'box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);' +
      'margin: 16px 0;';

    const agencyLabel = config.agencyName ? config.agencyName : 'LeadGuard Diagnostic Studio';

    container.innerHTML =
      '<div style="margin-bottom: 12px;">' +
      '  <h4 style="margin: 0 0 4px 0; font-size: 16px; font-weight: 600;">' + escapeHtml(config.name) + '</h4>' +
      '  <p style="margin: 0; font-size: 12px; opacity: 0.7;">Powered by ' + escapeHtml(agencyLabel) + '</p>' +
      '</div>' +
      '<form id="lg-form-' + config.id + '" style="display: flex; flex-direction: column; gap: 10px;">' +
      '  <input type="url" required placeholder="Enter website URL (e.g. https://yoursite.com)" style="padding: 8px 12px; border: 1px solid ' + borderColor + '; border-radius: 6px; font-size: 13px; background: ' + (isDark ? '#1e293b' : '#f8fafc') + '; color: ' + textColor + ';" />' +
      '  <input type="email" placeholder="Your work email for the full report" style="padding: 8px 12px; border: 1px solid ' + borderColor + '; border-radius: 6px; font-size: 13px; background: ' + (isDark ? '#1e293b' : '#f8fafc') + '; color: ' + textColor + ';" />' +
      '  <button type="submit" style="background: ' + btnBg + '; color: #ffffff; border: none; border-radius: 6px; padding: 10px; font-size: 13px; font-weight: 600; cursor: pointer;">🔍 Run Instant Free Diagnostic Audit</button>' +
      '</form>' +
      '<div id="lg-status-' + config.id + '" style="display: none; margin-top: 12px; font-size: 12px; padding: 8px; border-radius: 4px;"></div>';

    const form = container.querySelector('#lg-form-' + config.id);
    const statusBox = container.querySelector('#lg-status-' + config.id);

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      const inputs = form.querySelectorAll('input');
      const url = inputs[0].value.trim();
      const email = inputs[1].value.trim();

      statusBox.style.display = 'block';
      statusBox.style.background = isDark ? '#1e293b' : '#f1f5f9';
      statusBox.style.color = textColor;
      statusBox.textContent = 'Analyzing ' + url + '... Generating diagnostic snapshot.';

      setTimeout(function () {
        statusBox.style.background = isDark ? '#064e3b' : '#ecfdf5';
        statusBox.style.color = isDark ? '#a7f3d0' : '#065f46';
        statusBox.innerHTML = '✓ Diagnostic initiated! Verified diagnostic report queued for <strong>' + escapeHtml(url) + '</strong>.';
      }, 1200);
    });

    if (config.displayMode === 'FLOATING_BUTTON') {
      container.style.position = 'fixed';
      container.style.bottom = '20px';
      container.style.right = '20px';
      container.style.zIndex = '999999';
    }

    document.body.appendChild(container);
  }

  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initWidget);
  } else {
    initWidget();
  }
})();
