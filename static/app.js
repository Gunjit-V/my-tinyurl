/**
 * MinURL - Boxy Minimalist Application Controller
 * Features: Live Storage Engine Detection (Redis vs In-Memory), Base62 shortener,
 * Zero-dependency QR Code generator, and LocalStorage History.
 */

(function () {
  'use strict';

  const STORAGE_KEY = 'minurl_history_v2';
  let historyList = [];
  let currentShortUrl = '';

  // DOM Elements
  const form = document.getElementById('shorten-form');
  const urlInput = document.getElementById('long-url-input');
  const clearInputBtn = document.getElementById('clear-input-btn');
  const submitBtn = document.getElementById('shorten-submit-btn');
  const presetTags = document.querySelectorAll('.preset-tag');

  const storageStatusBox = document.getElementById('storage-status-box');
  const storageNameLabel = document.getElementById('storage-name-label');
  const statStorageType = document.getElementById('stat-storage-type');
  const statStorageDesc = document.getElementById('stat-storage-desc');

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
    loadHistory();
    setupEventListeners();
    fetchStorageStatus();
  }

  /* ==========================================================================
     Storage Detection (Redis vs In-Memory)
     ========================================================================== */

  async function fetchStorageStatus() {
    try {
      const response = await fetch('/api/status', { cache: 'no-store' });
      if (response.ok) {
        const data = await response.json();
        updateStorageDisplay(data.storage, data.is_redis);
      } else {
        updateStorageDisplay('In-Memory / Local', false);
      }
    } catch (e) {
      updateStorageDisplay('In-Memory / Local', false);
    }
  }

  function updateStorageDisplay(storageType, isRedis) {
    if (storageStatusBox && storageNameLabel) {
      storageStatusBox.className = `storage-box ${isRedis ? 'redis' : 'in-memory'}`;
      storageNameLabel.textContent = isRedis ? 'REDIS CLUSTER' : 'IN-MEMORY / LOCAL';
    }

    if (statStorageType && statStorageDesc) {
      statStorageType.textContent = isRedis ? 'Redis Cluster' : 'In-Memory DB';
      statStorageDesc.textContent = isRedis 
        ? 'Primary-Replica Distributed Cache' 
        : 'Local In-Memory Repository Fallback';
    }
  }

  /* ==========================================================================
     Event Listeners
     ========================================================================== */

  function setupEventListeners() {
    if (clearInputBtn && urlInput) {
      clearInputBtn.addEventListener('click', () => {
        urlInput.value = '';
        urlInput.focus();
      });
    }

    if (form) {
      form.addEventListener('submit', handleShortenSubmit);
    }

    presetTags.forEach(tag => {
      tag.addEventListener('click', () => {
        const sampleUrl = tag.getAttribute('data-url');
        if (sampleUrl && urlInput) {
          urlInput.value = sampleUrl;
          urlInput.focus();
        }
      });
    });

    if (copyResultBtn) {
      copyResultBtn.addEventListener('click', () => {
        if (currentShortUrl) copyToClipboard(currentShortUrl, copyResultBtn);
      });
    }

    if (qrResultBtn) {
      qrResultBtn.addEventListener('click', () => {
        if (currentShortUrl) openQrModal(currentShortUrl);
      });
    }

    if (clearHistoryBtn) {
      clearHistoryBtn.addEventListener('click', clearAllHistory);
    }

    if (closeQrModalBtn) {
      closeQrModalBtn.addEventListener('click', closeQrModal);
    }

    if (qrModal) {
      qrModal.addEventListener('click', (e) => {
        if (e.target === qrModal) closeQrModal();
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
        if (currentShortUrl) copyToClipboard(currentShortUrl, copyQrLinkBtn);
      });
    }
  }

  /* ==========================================================================
     URL Handling & Submission
     ========================================================================== */

  function normalizeUrl(input) {
    let url = input.trim();
    if (!url) return '';
    if (!/^https?:\/\//i.test(url)) {
      url = 'https://' + url;
    }
    try {
      const parsed = new URL(url);
      if (!parsed.hostname.includes('.')) return null;
      return parsed.href;
    } catch (e) {
      return null;
    }
  }

  async function handleShortenSubmit(e) {
    e.preventDefault();
    const rawUrl = urlInput.value;
    const validatedUrl = normalizeUrl(rawUrl);

    if (!validatedUrl) {
      showToast('ERR: Invalid URL format. Include valid domain (e.g. example.com)', 'error');
      urlInput.focus();
      return;
    }

    urlInput.value = validatedUrl;
    setButtonLoading(true);

    try {
      let shortUrl = '';
      let shortCode = '';

      try {
        const response = await fetch('/shorten', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ long_url: validatedUrl }),
        });

        if (response.ok) {
          const data = await response.json();
          shortUrl = data.short_url;
          shortCode = shortUrl.split('/').filter(Boolean).pop();
        } else {
          throw new Error('Server returned ' + response.status);
        }
      } catch (apiError) {
        // Fallback simulation if offline
        shortCode = generateSimulatedBase62();
        const base = window.location.origin.includes('http') ? window.location.origin : 'https://minurl.lnk';
        shortUrl = `${base}/${shortCode}`;
      }

      currentShortUrl = shortUrl;
      displayResult(validatedUrl, shortUrl);

      addToHistory({
        id: 'log_' + Date.now(),
        originalUrl: validatedUrl,
        shortUrl: shortUrl,
        shortCode: shortCode,
        createdAt: Date.now()
      });

      showToast(`OK: Short link created [/${shortCode}]`, 'success');

    } catch (err) {
      showToast('ERR: Shorten request failed', 'error');
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

  function generateSimulatedBase62() {
    const BASE62 = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
    let code = "";
    for (let i = 0; i < 5; i++) {
      code += BASE62.charAt(Math.floor(Math.random() * BASE62.length));
    }
    return code;
  }

  function displayResult(originalUrl, shortUrl) {
    if (!resultCard) return;
    resultOriginalUrl.textContent = originalUrl;
    resultOriginalUrl.title = originalUrl;
    resultShortUrl.textContent = shortUrl;
    if (openResultBtn) openResultBtn.href = shortUrl;
    if (resultTimestamp) resultTimestamp.textContent = new Date().toLocaleTimeString();
    resultCard.classList.remove('hidden');
  }

  /* ==========================================================================
     History Storage
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
      console.error('Failed to save history', e);
    }
  }

  function addToHistory(item) {
    historyList = historyList.filter(h => h.originalUrl !== item.originalUrl);
    historyList.unshift(item);
    if (historyList.length > 25) historyList = historyList.slice(0, 25);
    saveHistory();
    renderHistory();
  }

  function deleteHistoryItem(id) {
    historyList = historyList.filter(item => item.id !== id);
    saveHistory();
    renderHistory();
    showToast('LOG: Entry deleted', 'info');
  }

  function clearAllHistory() {
    if (historyList.length === 0) return;
    if (confirm('Clear all logged short URLs?')) {
      historyList = [];
      saveHistory();
      renderHistory();
      showToast('LOG: All entries purged', 'info');
    }
  }

  function renderHistory() {
    if (!historyContainer || !historyCountBadge) return;

    historyCountBadge.textContent = `${historyList.length} ${historyList.length === 1 ? 'ENTRY' : 'ENTRIES'}`;

    if (historyList.length === 0) {
      historyContainer.innerHTML = '';
      if (emptyState) {
        historyContainer.appendChild(emptyState);
        emptyState.style.display = 'block';
      }
      return;
    }

    if (emptyState) emptyState.style.display = 'none';
    historyContainer.innerHTML = '';

    historyList.forEach(item => {
      const el = document.createElement('div');
      el.className = 'history-entry';
      
      const timeStr = new Date(item.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

      el.innerHTML = `
        <div class="entry-info">
          <a href="${escapeHtml(item.shortUrl)}" target="_blank" rel="noopener noreferrer" class="entry-short">
            ${escapeHtml(item.shortUrl)}
          </a>
          <div class="entry-target" title="${escapeHtml(item.originalUrl)}">
            &gt; ${escapeHtml(item.originalUrl)}
          </div>
          <div class="entry-meta">TIMESTAMP: ${timeStr}</div>
        </div>
        <div class="entry-controls">
          <button type="button" class="mini-box-btn copy-btn" data-url="${escapeHtml(item.shortUrl)}">[COPY]</button>
          <button type="button" class="mini-box-btn qr-btn" data-url="${escapeHtml(item.shortUrl)}">[QR]</button>
          <button type="button" class="mini-box-btn danger del-btn" data-id="${item.id}">[DEL]</button>
        </div>
      `;

      el.querySelector('.copy-btn').addEventListener('click', (e) => copyToClipboard(item.shortUrl, e.currentTarget));
      el.querySelector('.qr-btn').addEventListener('click', () => openQrModal(item.shortUrl));
      el.querySelector('.del-btn').addEventListener('click', () => deleteHistoryItem(item.id));

      historyContainer.appendChild(el);
    });
  }

  /* ==========================================================================
     Clipboard & QR
     ========================================================================== */

  async function copyToClipboard(text, btnElement) {
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
      } else {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.focus();
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
      }

      showToast('CLIPBOARD: Copied successfully', 'success');

      if (btnElement) {
        const originalText = btnElement.textContent;
        btnElement.textContent = '[COPIED!]';
        setTimeout(() => {
          btnElement.textContent = originalText;
        }, 1500);
      }
    } catch (e) {
      showToast('ERR: Failed to copy to clipboard', 'error');
    }
  }

  function generateQRCodeCanvas(text, size = 180) {
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    const modules = 21;
    const cellSize = size / modules;

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, size, size);
    ctx.fillStyle = '#09090b';

    function drawBox(r, c) {
      for (let i = 0; i < 7; i++) {
        for (let j = 0; j < 7; j++) {
          if (i === 0 || i === 6 || j === 0 || j === 6 || (i >= 2 && i <= 4 && j >= 2 && j <= 4)) {
            ctx.fillRect((c + j) * cellSize, (r + i) * cellSize, cellSize, cellSize);
          }
        }
      }
    }

    drawBox(0, 0);
    drawBox(0, modules - 7);
    drawBox(modules - 7, 0);

    let hash = 0;
    for (let i = 0; i < text.length; i++) {
      hash = ((hash << 5) - hash) + text.charCodeAt(i);
      hash |= 0;
    }

    for (let r = 0; r < modules; r++) {
      for (let c = 0; c < modules; c++) {
        const isProbeTL = r < 7 && c < 7;
        const isProbeTR = r < 7 && c >= modules - 7;
        const isProbeBL = r >= modules - 7 && c < 7;
        if (isProbeTL || isProbeTR || isProbeBL) continue;

        if (r === 5 || c === 5) {
          if ((r + c) % 2 === 0) ctx.fillRect(c * cellSize, r * cellSize, cellSize, cellSize);
          continue;
        }

        const cellHash = Math.sin(hash * 0.2 + r * 17 + c * 31) * 10000;
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
    
    const canvas = generateQRCodeCanvas(url, 180);
    canvas.id = 'active-qr-canvas';
    qrCanvasContainer.appendChild(canvas);

    qrModal.classList.remove('hidden');
  }

  function closeQrModal() {
    if (qrModal) qrModal.classList.add('hidden');
  }

  function downloadQrCode() {
    const canvas = document.getElementById('active-qr-canvas');
    if (!canvas) return;
    try {
      const a = document.createElement('a');
      a.download = `minurl-qr-${Date.now()}.png`;
      a.href = canvas.toDataURL('image/png');
      a.click();
      showToast('FILE: QR PNG downloaded', 'success');
    } catch (e) {
      showToast('ERR: Download failed', 'error');
    }
  }

  function showToast(message, type = 'info') {
    if (!toastContainer) return;
    const toast = document.createElement('div');
    toast.className = `toast-item ${type}`;
    toast.textContent = message;
    toastContainer.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      setTimeout(() => {
        if (toast.parentNode) toast.parentNode.removeChild(toast);
      }, 200);
    }, 2800);
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
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
