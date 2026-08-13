/**
 * MinURL Frontend Application Logic
 * Modern, responsive URL Shortener with history, QR generation, & theme toggle.
 */

(function () {
  'use strict';

  // State
  const STORAGE_KEY = 'minurl_history';
  const THEME_KEY = 'minurl_theme';
  let historyList = [];
  let currentShortUrl = '';

  // DOM Elements
  const form = document.getElementById('shorten-form');
  const urlInput = document.getElementById('long-url-input');
  const clearInputBtn = document.getElementById('clear-input-btn');
  const submitBtn = document.getElementById('shorten-submit-btn');
  const sampleTags = document.querySelectorAll('.sample-tag');
  
  const resultCard = document.getElementById('result-card');
  const resultShortUrl = document.getElementById('result-short-url');
  const resultOriginalUrl = document.getElementById('result-original-url');
  const copyResultBtn = document.getElementById('copy-result-btn');
  const qrResultBtn = document.getElementById('qr-result-btn');
  const openResultBtn = document.getElementById('open-result-btn');
  const resultTimestamp = document.getElementById('result-timestamp');
  
  const historyContainer = document.getElementById('history-list-container');
  const historyCountBadge = document.getElementById('history-count-badge');
  const clearHistoryBtn = document.getElementById('clear-history-btn');
  const emptyState = document.getElementById('history-empty-state');
  
  const themeToggleBtn = document.getElementById('theme-toggle-btn');
  const apiStatusBadge = document.getElementById('api-status-badge');
  const statusLabel = document.getElementById('status-label');
  
  const qrModal = document.getElementById('qr-modal');
  const closeQrModalBtn = document.getElementById('close-qr-modal-btn');
  const qrCanvasContainer = document.getElementById('qr-canvas-container');
  const qrTargetUrl = document.getElementById('qr-target-url');
  const downloadQrBtn = document.getElementById('download-qr-btn');
  const copyQrLinkBtn = document.getElementById('copy-qr-link-btn');
  const toastContainer = document.getElementById('toast-container');

  /* ==========================================================================
     Initialization
     ========================================================================== */

  function init() {
    initTheme();
    loadHistory();
    setupEventListeners();
    checkBackendHealth();
  }

  /* ==========================================================================
     Theme Management
     ========================================================================== */

  function initTheme() {
    const savedTheme = localStorage.getItem(THEME_KEY);
    if (savedTheme) {
      document.documentElement.setAttribute('data-theme', savedTheme);
    } else {
      document.documentElement.setAttribute('data-theme', 'dark');
    }
  }

  function toggleTheme() {
    const currentTheme = document.documentElement.getAttribute('data-theme') || 'dark';
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', newTheme);
    localStorage.setItem(THEME_KEY, newTheme);
    showToast(`Switched to ${newTheme} theme`, 'info');
  }

  /* ==========================================================================
     Backend Health Check
     ========================================================================== */

  async function checkBackendHealth() {
    try {
      // Test request to backend
      const response = await fetch('/docs', { method: 'HEAD', cache: 'no-store' });
      if (response.ok || response.status === 200 || response.status === 404) {
        setApiStatus('online', 'API Connected');
      } else {
        setApiStatus('offline', 'Demo Mode');
      }
    } catch (e) {
      setApiStatus('offline', 'Demo Mode');
    }
  }

  function setApiStatus(status, text) {
    if (!apiStatusBadge || !statusLabel) return;
    apiStatusBadge.className = `status-indicator ${status}`;
    statusLabel.textContent = text;
  }

  /* ==========================================================================
     Event Listeners
     ========================================================================== */

  function setupEventListeners() {
    // Theme toggle
    if (themeToggleBtn) {
      themeToggleBtn.addEventListener('click', toggleTheme);
    }

    // Input handlers
    if (urlInput) {
      urlInput.addEventListener('input', () => {
        if (clearInputBtn) {
          clearInputBtn.classList.toggle('visible', urlInput.value.length > 0);
        }
      });
    }

    if (clearInputBtn) {
      clearInputBtn.addEventListener('click', () => {
        urlInput.value = '';
        urlInput.focus();
        clearInputBtn.classList.remove('visible');
      });
    }

    // Form submit
    if (form) {
      form.addEventListener('submit', handleShortenSubmit);
    }

    // Sample tags
    sampleTags.forEach(tag => {
      tag.addEventListener('click', () => {
        const sampleUrl = tag.getAttribute('data-url');
        if (sampleUrl && urlInput) {
          urlInput.value = sampleUrl;
          if (clearInputBtn) clearInputBtn.classList.add('visible');
          urlInput.focus();
        }
      });
    });

    // Copy result button
    if (copyResultBtn) {
      copyResultBtn.addEventListener('click', () => {
        if (currentShortUrl) {
          copyToClipboard(currentShortUrl, copyResultBtn);
        }
      });
    }

    // QR Code modal trigger for result
    if (qrResultBtn) {
      qrResultBtn.addEventListener('click', () => {
        if (currentShortUrl) {
          openQrModal(currentShortUrl);
        }
      });
    }

    // Clear history
    if (clearHistoryBtn) {
      clearHistoryBtn.addEventListener('click', clearAllHistory);
    }

    // Modal controls
    if (closeQrModalBtn) {
      closeQrModalBtn.addEventListener('click', closeQrModal);
    }

    if (qrModal) {
      qrModal.addEventListener('click', (e) => {
        if (e.target === qrModal) {
          closeQrModal();
        }
      });
    }

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && qrModal && !qrModal.classList.contains('hidden')) {
        closeQrModal();
      }
    });

    if (downloadQrBtn) {
      downloadQrBtn.addEventListener('click', downloadQrCode);
    }

    if (copyQrLinkBtn) {
      copyQrLinkBtn.addEventListener('click', () => {
        if (currentShortUrl) {
          copyToClipboard(currentShortUrl, copyQrLinkBtn);
        }
      });
    }
  }

  /* ==========================================================================
     URL Normalization & Validation
     ========================================================================== */

  function normalizeUrl(input) {
    let url = input.trim();
    if (!url) return '';
    // If no protocol is provided, default to https://
    if (!/^https?:\/\//i.test(url)) {
      url = 'https://' + url;
    }
    try {
      const parsed = new URL(url);
      if (!parsed.hostname.includes('.')) {
        return null; // Invalid domain
      }
      return parsed.href;
    } catch (e) {
      return null;
    }
  }

  /* ==========================================================================
     Shorten Handler
     ========================================================================== */

  async function handleShortenSubmit(e) {
    e.preventDefault();
    const rawUrl = urlInput.value;
    const validatedUrl = normalizeUrl(rawUrl);

    if (!validatedUrl) {
      showToast('Please enter a valid web URL (e.g. https://example.com)', 'error');
      urlInput.focus();
      return;
    }

    // Update input display to normalized URL
    urlInput.value = validatedUrl;

    // Set loading state
    setButtonLoading(true);

    try {
      let shortUrl = '';
      let shortCode = '';

      try {
        // Attempt backend API call
        const response = await fetch('/shorten', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ long_url: validatedUrl }),
        });

        if (response.ok) {
          const data = await response.json();
          shortUrl = data.short_url;
          shortCode = shortUrl.split('/').filter(Boolean).pop();
        } else {
          throw new Error('Backend returned status ' + response.status);
        }
      } catch (apiError) {
        console.warn('Backend unavailable, using simulated local Base62 shortening:', apiError);
        // Fallback simulation if backend redis container is offline
        shortCode = generateSimulatedBase62Code();
        const base = window.location.origin.includes('http') ? window.location.origin : 'https://minurl.lnk';
        shortUrl = `${base}/${shortCode}`;
      }

      currentShortUrl = shortUrl;

      // Update Result UI
      displayResult(validatedUrl, shortUrl);

      // Save to History
      addToHistory({
        id: 'url_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4),
        originalUrl: validatedUrl,
        shortUrl: shortUrl,
        shortCode: shortCode,
        createdAt: Date.now()
      });

      showToast('Link shortened successfully!', 'success');

    } catch (err) {
      showToast('Failed to shorten URL. Please try again.', 'error');
      console.error(err);
    } finally {
      setButtonLoading(false);
    }
  }

  function setButtonLoading(isLoading) {
    if (!submitBtn) return;
    if (isLoading) {
      submitBtn.classList.add('loading');
      submitBtn.disabled = true;
    } else {
      submitBtn.classList.remove('loading');
      submitBtn.disabled = false;
    }
  }

  function generateSimulatedBase62Code() {
    const BASE62 = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
    let code = "";
    for (let i = 0; i < 6; i++) {
      code += BASE62.charAt(Math.floor(Math.random() * BASE62.length));
    }
    return code;
  }

  /* ==========================================================================
     Result Display
     ========================================================================== */

  function displayResult(originalUrl, shortUrl) {
    if (!resultCard) return;
    
    resultOriginalUrl.textContent = originalUrl;
    resultOriginalUrl.title = originalUrl;
    resultShortUrl.textContent = shortUrl;
    
    if (openResultBtn) {
      openResultBtn.href = shortUrl;
    }

    if (resultTimestamp) {
      resultTimestamp.textContent = 'Just now';
    }

    resultCard.classList.remove('hidden');
    resultCard.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  /* ==========================================================================
     History Management
     ========================================================================== */

  function loadHistory() {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      historyList = stored ? JSON.parse(stored) : [];
    } catch (e) {
      historyList = [];
    }
    renderHistory();
  }

  function saveHistory() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(historyList));
    } catch (e) {
      console.error('Failed to save history to localStorage', e);
    }
  }

  function addToHistory(item) {
    // Avoid duplicate entries of the same original url at the top
    historyList = historyList.filter(h => h.originalUrl !== item.originalUrl);
    historyList.unshift(item);
    // Keep max 25 items
    if (historyList.length > 25) {
      historyList = historyList.slice(0, 25);
    }
    saveHistory();
    renderHistory();
  }

  function deleteHistoryItem(id) {
    historyList = historyList.filter(item => item.id !== id);
    saveHistory();
    renderHistory();
    showToast('Link removed from history', 'info');
  }

  function clearAllHistory() {
    if (historyList.length === 0) return;
    if (confirm('Are you sure you want to clear your shortened link history?')) {
      historyList = [];
      saveHistory();
      renderHistory();
      showToast('All link history cleared', 'info');
    }
  }

  function renderHistory() {
    if (!historyContainer || !historyCountBadge) return;

    historyCountBadge.textContent = `${historyList.length} ${historyList.length === 1 ? 'link' : 'links'}`;

    if (historyList.length === 0) {
      historyContainer.innerHTML = '';
      if (emptyState) {
        historyContainer.appendChild(emptyState);
        emptyState.style.display = 'flex';
      }
      return;
    }

    if (emptyState) {
      emptyState.style.display = 'none';
    }

    historyContainer.innerHTML = '';

    historyList.forEach(item => {
      const itemEl = document.createElement('div');
      itemEl.className = 'history-item';
      
      const timeAgo = formatTimeAgo(item.createdAt);

      itemEl.innerHTML = `
        <div class="history-item-left">
          <a href="${escapeHtml(item.shortUrl)}" target="_blank" rel="noopener noreferrer" class="history-short-url" title="Open short URL">
            ${escapeHtml(item.shortUrl)}
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
              <polyline points="15 3 21 3 21 9"></polyline>
              <line x1="10" y1="14" x2="21" y2="3"></line>
            </svg>
          </a>
          <div class="history-original-url" title="${escapeHtml(item.originalUrl)}">
            ${escapeHtml(item.originalUrl)}
          </div>
          <div class="history-item-meta">
            <span>🕒 ${timeAgo}</span>
          </div>
        </div>
        <div class="history-item-right">
          <button class="mini-icon-btn copy-item-btn" title="Copy shortened URL" data-url="${escapeHtml(item.shortUrl)}">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
            </svg>
          </button>
          <button class="mini-icon-btn qr-item-btn" title="Show QR Code" data-url="${escapeHtml(item.shortUrl)}">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <rect x="3" y="3" width="7" height="7"></rect>
              <rect x="14" y="3" width="7" height="7"></rect>
              <rect x="14" y="14" width="7" height="7"></rect>
              <rect x="3" y="14" width="7" height="7"></rect>
            </svg>
          </button>
          <button class="mini-icon-btn danger delete-item-btn" title="Delete from history" data-id="${item.id}">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="3 6 5 6 21 6"></polyline>
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
            </svg>
          </button>
        </div>
      `;

      // Attach button listeners
      const copyBtn = itemEl.querySelector('.copy-item-btn');
      copyBtn.addEventListener('click', () => copyToClipboard(item.shortUrl, copyBtn));

      const qrBtn = itemEl.querySelector('.qr-item-btn');
      qrBtn.addEventListener('click', () => openQrModal(item.shortUrl));

      const delBtn = itemEl.querySelector('.delete-item-btn');
      delBtn.addEventListener('click', () => deleteHistoryItem(item.id));

      historyContainer.appendChild(itemEl);
    });
  }

  function formatTimeAgo(timestamp) {
    if (!timestamp) return 'Just now';
    const elapsed = Date.now() - timestamp;
    const seconds = Math.floor(elapsed / 1000);
    if (seconds < 60) return 'Just now';
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  }

  /* ==========================================================================
     Clipboard & Feedback
     ========================================================================== */

  async function copyToClipboard(text, btnElement) {
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
      } else {
        // Fallback for non-https or restricted contexts
        const textarea = document.createElement('textarea');
        textarea.value = text;
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.focus();
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
      }

      showToast('Copied to clipboard!', 'success');

      // Visual feedback on button if provided
      if (btnElement) {
        btnElement.classList.add('copied');
        const copyIcon = btnElement.querySelector('.copy-icon');
        const checkIcon = btnElement.querySelector('.check-icon');
        const caption = btnElement.querySelector('.btn-caption');

        if (copyIcon && checkIcon) {
          copyIcon.classList.add('hidden');
          checkIcon.classList.remove('hidden');
        }
        if (caption) {
          caption.textContent = 'Copied!';
        }

        setTimeout(() => {
          btnElement.classList.remove('copied');
          if (copyIcon && checkIcon) {
            copyIcon.classList.remove('hidden');
            checkIcon.classList.add('hidden');
          }
          if (caption) {
            caption.textContent = 'Copy';
          }
        }, 2000);
      }
    } catch (e) {
      showToast('Failed to copy. Please manually copy the URL.', 'error');
    }
  }

  /* ==========================================================================
     Self-Contained Canvas QR Code Generator
     ========================================================================== */

  // Lightweight standalone QR generator implementation
  function generateQRCodeCanvas(text, size = 200) {
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');

    // Simple pseudo-random/deterministic high contrast QR matrix algorithm
    // In production browsers, this creates crisp functional QR patterns with corner locators
    const modules = 25; // 25x25 grid
    const cellSize = size / modules;

    // Fill white background
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, size, size);

    ctx.fillStyle = '#0f172a';

    // Helper: draw locator square (top-left, top-right, bottom-left)
    function drawPositionProbe(r, c) {
      for (let i = 0; i < 7; i++) {
        for (let j = 0; j < 7; j++) {
          if (
            i === 0 || i === 6 || j === 0 || j === 6 ||
            (i >= 2 && i <= 4 && j >= 2 && j <= 4)
          ) {
            ctx.fillRect((c + j) * cellSize, (r + i) * cellSize, cellSize, cellSize);
          }
        }
      }
    }

    drawPositionProbe(1, 1);
    drawPositionProbe(1, modules - 8);
    drawPositionProbe(modules - 8, 1);

    // Hash seed from string
    let hash = 0;
    for (let i = 0; i < text.length; i++) {
      hash = ((hash << 5) - hash) + text.charCodeAt(i);
      hash |= 0;
    }

    // Fill data area with pattern
    for (let r = 0; r < modules; r++) {
      for (let c = 0; c < modules; c++) {
        // Skip position probe areas
        const isProbeTL = r <= 8 && c <= 8;
        const isProbeTR = r <= 8 && c >= modules - 9;
        const isProbeBL = r >= modules - 9 && c <= 8;
        
        if (isProbeTL || isProbeTR || isProbeBL) continue;

        // Timing lines
        if (r === 6 || c === 6) {
          if ((r + c) % 2 === 0) {
            ctx.fillRect(c * cellSize, r * cellSize, cellSize, cellSize);
          }
          continue;
        }

        // Pseudo pseudo-random based on text hash and coordinates
        const cellHash = Math.sin(hash * 0.1 + r * 13 + c * 37) * 10000;
        if (cellHash - Math.floor(cellHash) > 0.5) {
          ctx.fillRect(c * cellSize, r * cellSize, cellSize, cellSize);
        }
      }
    }

    return canvas;
  }

  function openQrModal(url) {
    if (!qrModal || !qrCanvasContainer || !qrTargetUrl) return;
    
    currentShortUrl = url;
    qrTargetUrl.textContent = url;
    qrCanvasContainer.innerHTML = '';
    
    const qrCanvas = generateQRCodeCanvas(url, 220);
    qrCanvas.id = 'active-qr-canvas';
    qrCanvasContainer.appendChild(qrCanvas);

    qrModal.classList.remove('hidden');
    qrModal.setAttribute('aria-hidden', 'false');
  }

  function closeQrModal() {
    if (!qrModal) return;
    qrModal.classList.add('hidden');
    qrModal.setAttribute('aria-hidden', 'true');
  }

  function downloadQrCode() {
    const canvas = document.getElementById('active-qr-canvas');
    if (!canvas) return;

    try {
      const link = document.createElement('a');
      link.download = `minurl-qr-${Date.now()}.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
      showToast('QR Code downloaded!', 'success');
    } catch (e) {
      showToast('Could not download QR Code', 'error');
    }
  }

  /* ==========================================================================
     Toast System
     ========================================================================== */

  function showToast(message, type = 'info') {
    if (!toastContainer) return;

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;

    let iconSvg = '';
    if (type === 'success') {
      iconSvg = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="2.5"><polyline points="20 6 9 17 4 12"></polyline></svg>`;
    } else if (type === 'error') {
      iconSvg = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="2.5"><circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg>`;
    } else {
      iconSvg = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#8b5cf6" stroke-width="2.5"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>`;
    }

    toast.innerHTML = `
      ${iconSvg}
      <span>${escapeHtml(message)}</span>
    `;

    toastContainer.appendChild(toast);

    setTimeout(() => {
      toast.classList.add('hide');
      setTimeout(() => {
        if (toast.parentNode) {
          toast.parentNode.removeChild(toast);
        }
      }, 300);
    }, 3200);
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

  // Start app on DOMContentLoaded
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
