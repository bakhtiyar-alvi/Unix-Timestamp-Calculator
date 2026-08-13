 
/**
 * Unix Timestamp Converter - Client-Side Engine
 * ES2022 Vanilla JavaScript
 */

(function () {
  'use strict';

  // State & Interval References
  let liveClockInterval = null;
  let urlCountdownInterval = null;
  let currentUrlTimestampMs = null;

  // Common Priority URL Parameters that store timestamps
  const PRIORITY_TS_PARAMS = [
    'expires',
    'expiration',
    'exp',
    'timestamp',
    'ts',
    'time',
    'date',
    'created',
    'updated',
    'valid_until'
  ];

  // ==========================================================================
  // Initialization & Event Listeners
  // ==========================================================================
  document.addEventListener('DOMContentLoaded', () => {
    initTheme();
    initLiveClock();
    initDatePickerDefaults();
    bindEvents();
    registerServiceWorker();
  });

  function bindEvents() {
    // Theme Selector
    document.getElementById('themeSelect').addEventListener('change', (e) => {
      setTheme(e.target.value);
    });

    // Section A: Timestamp -> Date
    document.getElementById('convertTsBtn').addEventListener('click', processTimestampInput);
    document.getElementById('tsInput').addEventListener('keyup', (e) => {
      if (e.key === 'Enter') processTimestampInput();
    });
    document.getElementById('tsInput').addEventListener('input', processTimestampInput);
    document.getElementById('unitSelect').addEventListener('change', processTimestampInput);
    document.getElementById('targetTimezoneSelect').addEventListener('change', processTimestampInput);
    
    document.getElementById('useCurrentTsBtn').addEventListener('click', () => {
      const mode = document.getElementById('unitSelect').value;
      const now = Date.now();
      document.getElementById('tsInput').value = mode === 'seconds' ? Math.floor(now / 1000) : now;
      processTimestampInput();
    });

    document.getElementById('clearTsBtn').addEventListener('click', () => {
      document.getElementById('tsInput').value = '';
      document.getElementById('tsResults').classList.add('hidden');
      document.getElementById('tsError').classList.add('hidden');
      document.getElementById('tsWarning').classList.add('hidden');
    });

    document.getElementById('shareTsBtn').addEventListener('click', shareTimestampResult);

    // Section B: Date -> Timestamp
    document.getElementById('datePickerInput').addEventListener('input', processDateToTs);
    document.getElementById('timePickerInput').addEventListener('input', processDateToTs);
    document.getElementById('datePickerTzSelect').addEventListener('change', processDateToTs);

    document.getElementById('setCurrentDateBtn').addEventListener('click', () => {
      initDatePickerDefaults();
      processDateToTs();
    });

    // Section C: URL Extractor
    document.getElementById('analyzeUrlBtn').addEventListener('click', processUrlAnalysis);
    document.getElementById('urlInput').addEventListener('keyup', (e) => {
      if (e.key === 'Enter') processUrlAnalysis();
    });
    document.getElementById('urlInput').addEventListener('input', processUrlAnalysis);

    // Global Clipboard Event Delegation
    document.addEventListener('click', (e) => {
      if (e.target && e.target.classList.contains('copy-btn')) {
        handleCopyClick(e.target);
      }
    });
  }

  // ==========================================================================
  // Theme Management
  // ==========================================================================
  function initTheme() {
    const savedTheme = localStorage.getItem('utc_app_theme') || 'system';
    document.getElementById('themeSelect').value = savedTheme;
    setTheme(savedTheme);

    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
      if (localStorage.getItem('utc_app_theme') === 'system') {
        applyTheme('system');
      }
    });
  }

  function setTheme(theme) {
    localStorage.setItem('utc_app_theme', theme);
    applyTheme(theme);
  }

  function applyTheme(theme) {
    const root = document.documentElement;
    if (theme === 'dark') {
      root.setAttribute('data-theme', 'dark');
    } else if (theme === 'light') {
      root.setAttribute('data-theme', 'light');
    } else {
      const isSystemDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      root.setAttribute('data-theme', isSystemDark ? 'dark' : 'light');
    }
  }

  // ==========================================================================
  // Section D: Live Clock
  // ==========================================================================
  function initLiveClock() {
    const update = () => {
      const now = Date.now();
      const seconds = Math.floor(now / 1000);
      document.getElementById('liveSeconds').textContent = seconds;
      document.getElementById('liveMilliseconds').textContent = now;

      const utcStr = new Date(now).toUTCString();
      document.getElementById('liveUtcFormatted').textContent = utcStr;
    };

    update();
    liveClockInterval = setInterval(update, 1000);
  }

  // ==========================================================================
  // Core Timestamp Detection & Calculation Logic
  // ==========================================================================
  /**
   * Automatic Timestamp Unit Detection
   * @param {number|string} rawVal
   * @param {string} forcedMode - 'auto' | 'seconds' | 'milliseconds'
   * @returns {{ unit: 'seconds'|'milliseconds'|'micro_nano'|'unknown', valueMs: number, valueSec: number, originalNum: number, isAmbiguous: boolean }}
   */
  function detectAndNormalizeTimestamp(rawVal, forcedMode = 'auto') {
    const cleanStr = String(rawVal).trim();
    if (!cleanStr || isNaN(cleanStr)) {
      return { error: 'Please enter a valid numeric timestamp.' };
    }

    const num = Number(cleanStr);

    if (!Number.isFinite(num)) {
      return { error: 'Timestamp value is outside numeric precision limits.' };
    }

    const digitCount = cleanStr.replace(/[-.]/g, '').length;

    // Handle microsecond/nanosecond warnings
    if (digitCount >= 15) {
      return {
        unit: 'micro_nano',
        digitCount,
        warning: `This appears to be a ${digitCount >= 18 ? 'nanosecond' : 'microsecond'} timestamp (${digitCount} digits). Convert by dividing by ${digitCount >= 18 ? '1,000,000' : '1,000'}.`
      };
    }

    if (forcedMode === 'seconds') {
      return {
        unit: 'seconds',
        valueMs: num * 1000,
        valueSec: num,
        originalNum: num,
        isAmbiguous: false
      };
    }

    if (forcedMode === 'milliseconds') {
      return {
        unit: 'milliseconds',
        valueMs: num,
        valueSec: num / 1000,
        originalNum: num,
        isAmbiguous: false
      };
    }

    // Auto Detection Logic based on digit length and reasonable date boundaries (1970 to 2100)
    // 10 digits = Seconds (up to 9,999,999,999 = year 2286)
    // 13 digits = Milliseconds
    if (digitCount <= 11) {
      return {
        unit: 'seconds',
        valueMs: num * 1000,
        valueSec: num,
        originalNum: num,
        isAmbiguous: false
      };
    } else {
      return {
        unit: 'milliseconds',
        valueMs: num,
        valueSec: num / 1000,
        originalNum: num,
        isAmbiguous: digitCount === 12
      };
    }
  }

  // ==========================================================================
  // Section A: Timestamp -> Date Implementation
  // ==========================================================================
  function processTimestampInput() {
    const rawVal = document.getElementById('tsInput').value.trim();
    const mode = document.getElementById('unitSelect').value;
    const targetTz = document.getElementById('targetTimezoneSelect').value;

    const errorEl = document.getElementById('tsError');
    const warningEl = document.getElementById('tsWarning');
    const resultsEl = document.getElementById('tsResults');

    if (!rawVal) {
      errorEl.classList.add('hidden');
      warningEl.classList.add('hidden');
      resultsEl.classList.add('hidden');
      return;
    }

    const detected = detectAndNormalizeTimestamp(rawVal, mode);

    if (detected.error) {
      errorEl.textContent = detected.error;
      errorEl.classList.remove('hidden');
      warningEl.classList.add('hidden');
      resultsEl.classList.add('hidden');
      return;
    }

    errorEl.classList.add('hidden');

    if (detected.unit === 'micro_nano') {
      warningEl.textContent = detected.warning;
      warningEl.classList.remove('hidden');
      resultsEl.classList.add('hidden');
      return;
    }

    if (detected.isAmbiguous) {
      warningEl.textContent = 'Likely unit: Milliseconds. You can manually lock the unit above if required.';
      warningEl.classList.remove('hidden');
    } else {
      warningEl.classList.add('hidden');
    }

    const date = new Date(detected.valueMs);

    if (isNaN(date.getTime())) {
      errorEl.textContent = 'The entered value results in an invalid calendar date.';
      errorEl.classList.remove('hidden');
      resultsEl.classList.add('hidden');
      return;
    }

    // Populate Results
    document.getElementById('resOriginal').textContent = rawVal;
    document.getElementById('resDetectedUnit').textContent = detected.unit.toUpperCase();

    // UTC Format
    document.getElementById('resUtcDate').textContent = formatDateInTz(date, 'UTC');

    // Selected Timezone Format
    const selectedTz = targetTz === 'LOCAL' ? Intl.DateTimeFormat().resolvedOptions().timeZone : targetTz;
    document.getElementById('resLocalDate').textContent = `${formatDateInTz(date, selectedTz)} (${selectedTz})`;

    // ISO 8601
    document.getElementById('resIsoDate').textContent = date.toISOString();

    // Values
    document.getElementById('resSeconds').textContent = detected.valueSec;
    document.getElementById('resMilliseconds').textContent = Math.round(detected.valueMs);

    // Relative Time
    document.getElementById('resRelativeTime').textContent = getRelativeTimeString(date);

    resultsEl.classList.remove('hidden');
  }

  // ==========================================================================
  // Section B: Date -> Timestamp Implementation
  // ==========================================================================
  function initDatePickerDefaults() {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const seconds = String(now.getSeconds()).padStart(2, '0');

    document.getElementById('datePickerInput').value = `${year}-${month}-${day}`;
    document.getElementById('timePickerInput').value = `${hours}:${minutes}:${seconds}`;
    processDateToTs();
  }

  function processDateToTs() {
    const dateVal = document.getElementById('datePickerInput').value;
    const timeVal = document.getElementById('timePickerInput').value || '00:00:00';
    const tzSelect = document.getElementById('datePickerTzSelect').value;

    if (!dateVal) return;

    const isoString = `${dateVal}T${timeVal}`;
    let dateObj;

    if (tzSelect === 'UTC') {
      dateObj = new Date(`${isoString}Z`);
    } else if (tzSelect === 'LOCAL') {
      dateObj = new Date(isoString);
    } else {
      // Specific IANA Timezone handling
      dateObj = createDateInTimezone(isoString, tzSelect);
    }

    if (isNaN(dateObj.getTime())) {
      document.getElementById('dateResSeconds').textContent = 'Invalid Date';
      document.getElementById('dateResMilliseconds').textContent = 'Invalid Date';
      return;
    }

    const ms = dateObj.getTime();
    const sec = Math.floor(ms / 1000);

    document.getElementById('dateResSeconds').textContent = sec;
    document.getElementById('dateResMilliseconds').textContent = ms;
  }

  // Helper to parse date string in targeted IANA timezone
  function createDateInTimezone(dateStr, timeZone) {
    try {
      const dummyDate = new Date(`${dateStr}Z`);
      const formatter = new Intl.DateTimeFormat('en-US', {
        timeZone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
      });

      const parts = formatter.formatToParts(dummyDate);
      const getPart = (type) => parts.find(p => p.type === type)?.value;
      
      const tzDateStr = `${getPart('year')}-${getPart('month')}-${getPart('day')}T${getPart('hour')}:${getPart('minute')}:${getPart('second')}`;
      const diff = dummyDate.getTime() - new Date(`${tzDateStr}Z`).getTime();

      return new Date(new Date(dateStr).getTime() + diff);
    } catch {
      return new Date(dateStr);
    }
  }

  // ==========================================================================
  // Section C: URL Extractor & Expiration Analyzer
  // ==========================================================================
  function processUrlAnalysis() {
    let rawUrl = document.getElementById('urlInput').value.trim();
    const errorEl = document.getElementById('urlError');
    const resultsEl = document.getElementById('urlResults');

    if (!rawUrl) {
      errorEl.classList.add('hidden');
      resultsEl.classList.add('hidden');
      if (urlCountdownInterval) clearInterval(urlCountdownInterval);
      return;
    }

    // Prepend https:// if user pasted domain without protocol
    if (!/^https?:\/\//i.test(rawUrl) && rawUrl.includes('.')) {
      rawUrl = 'https://' + rawUrl;
    }

    let parsedUrl;
    try {
      parsedUrl = new URL(rawUrl);
    } catch {
      errorEl.textContent = 'Invalid URL structure. Please enter a valid URL (e.g. https://example.com/?expires=1786558070492).';
      errorEl.classList.remove('hidden');
      resultsEl.classList.add('hidden');
      if (urlCountdownInterval) clearInterval(urlCountdownInterval);
      return;
    }

    errorEl.classList.add('hidden');

    const searchParams = new URLSearchParams(parsedUrl.search);
    const paramsList = [];
    let detectedTsParam = null;

    // Parse all query parameters safely
    for (const [key, value] of searchParams.entries()) {
      const inferredType = inferParamType(key, value);
      paramsList.push({ key, value, inferredType });

      if (!detectedTsParam && (inferredType === 'Timestamp' || PRIORITY_TS_PARAMS.includes(key.toLowerCase()))) {
        const detected = detectAndNormalizeTimestamp(value);
        if (!detected.error && detected.unit !== 'micro_nano') {
          detectedTsParam = {
            key,
            value,
            valueMs: detected.valueMs,
            unit: detected.unit
          };
        }
      }
    }

    if (!detectedTsParam) {
      errorEl.textContent = 'No valid timestamp parameters (e.g. expires, ts, time) were found in the provided URL.';
      errorEl.classList.remove('hidden');
      resultsEl.classList.add('hidden');
      if (urlCountdownInterval) clearInterval(urlCountdownInterval);
      return;
    }

    // Populate URL Summary
    document.getElementById('urlParamName').textContent = detectedTsParam.key;
    document.getElementById('urlParamValue').textContent = detectedTsParam.value;
    document.getElementById('urlParamUnit').textContent = detectedTsParam.unit.toUpperCase();

    const expDate = new Date(detectedTsParam.valueMs);
    document.getElementById('urlExpirationDate').textContent = formatDateInTz(expDate, Intl.DateTimeFormat().resolvedOptions().timeZone);

    currentUrlTimestampMs = detectedTsParam.valueMs;

    // Start Live Expiration Countdown
    updateUrlCountdown();
    if (urlCountdownInterval) clearInterval(urlCountdownInterval);
    urlCountdownInterval = setInterval(updateUrlCountdown, 1000);

    // Populate Parameters Table safely using DOM creation
    const tableBody = document.getElementById('urlParamTableBody');
    tableBody.innerHTML = '';

    paramsList.forEach((p) => {
      const tr = document.createElement('tr');

      const tdKey = document.createElement('td');
      tdKey.className = 'mono-font bold-text';
      tdKey.textContent = p.key;

      const tdVal = document.createElement('td');
      tdVal.className = 'mono-font';
      tdVal.textContent = p.value;

      const tdType = document.createElement('td');
      const badge = document.createElement('span');
      badge.className = `badge ${p.inferredType === 'Timestamp' ? 'badge-primary' : 'badge-info'}`;
      badge.textContent = p.inferredType;
      tdType.appendChild(badge);

      tr.appendChild(tdKey);
      tr.appendChild(tdVal);
      tr.appendChild(tdType);

      tableBody.appendChild(tr);
    });

    resultsEl.classList.remove('hidden');
  }

  function updateUrlCountdown() {
    if (!currentUrlTimestampMs) return;

    const now = Date.now();
    const diff = currentUrlTimestampMs - now;

    const badgeEl = document.getElementById('urlStatusBadge');
    const statusTextEl = document.getElementById('urlStatusText');
    const countdownEl = document.getElementById('urlCountdown');

    if (diff <= 0) {
      // Expired
      badgeEl.className = 'status-badge status-expired';
      statusTextEl.textContent = 'EXPIRED';
      countdownEl.textContent = `Expired ${formatDuration(Math.abs(diff))} ago`;
    } else if (diff < 300000) {
      // Expiring soon (< 5 minutes)
      badgeEl.className = 'status-badge status-warning';
      statusTextEl.textContent = 'EXPIRING SOON';
      countdownEl.textContent = `Expires in ${formatDuration(diff)}`;
    } else {
      // Active
      badgeEl.className = 'status-badge status-active';
      statusTextEl.textContent = 'ACTIVE';
      countdownEl.textContent = `Expires in ${formatDuration(diff)}`;
    }
  }

  function inferParamType(key, val) {
    const keyLower = key.toLowerCase();
    if (PRIORITY_TS_PARAMS.includes(keyLower)) return 'Timestamp';

    if (!isNaN(val) && val.trim() !== '') {
      const num = Number(val);
      if (num > 500000000 && num < 2524608000000) return 'Timestamp';
      return 'Number';
    }

    if (/^(true|false)$/i.test(val)) return 'Boolean';
    if (/^([0-9]{1,3}\.){3}[0-9]{1,3}$/.test(val)) return 'IP Address';
    if (/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(val)) return 'UUID';

    return 'Text';
  }

  // ==========================================================================
  // Helper Utilities (Formatting & Clipboard)
  // ==========================================================================
  function formatDateInTz(date, timeZone) {
    try {
      return new Intl.DateTimeFormat('en-US', {
        timeZone,
        year: 'numeric',
        month: 'short',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        timeZoneName: 'short'
      }).format(date);
    } catch {
      return date.toUTCString();
    }
  }

  function getRelativeTimeString(date) {
    const now = Date.now();
    const diffMs = date.getTime() - now;
    const diffSec = Math.round(diffMs / 1000);

    const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });

    const absSec = Math.abs(diffSec);
    if (absSec < 60) return rtf.format(diffSec, 'second');
    if (absSec < 3600) return rtf.format(Math.round(diffSec / 60), 'minute');
    if (absSec < 86400) return rtf.format(Math.round(diffSec / 3600), 'hour');
    if (absSec < 2592000) return rtf.format(Math.round(diffSec / 86400), 'day');
    if (absSec < 31536000) return rtf.format(Math.round(diffSec / 2592000), 'month');
    return rtf.format(Math.round(diffSec / 31536000), 'year');
  }

  function formatDuration(ms) {
    let seconds = Math.floor(ms / 1000);
    const days = Math.floor(seconds / 86400);
    seconds %= 86400;
    const hours = Math.floor(seconds / 3600);
    seconds %= 3600;
    const minutes = Math.floor(seconds / 60);
    const secs = seconds % 60;

    const parts = [];
    if (days > 0) parts.push(`${days}d`);
    if (hours > 0) parts.push(`${hours}h`);
    if (minutes > 0) parts.push(`${minutes}m`);
    parts.push(`${secs}s`);

    return parts.join(' ');
  }

  // Copy to Clipboard with fallback
  function handleCopyClick(btn) {
    const targetId = btn.getAttribute('data-target');
    const targetEl = document.getElementById(targetId);
    if (!targetEl) return;

    const textToCopy = targetEl.textContent.trim();

    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(textToCopy).then(() => {
        showCopyFeedback(btn);
      }).catch(() => {
        fallbackCopyText(textToCopy, btn);
      });
    } else {
      fallbackCopyText(textToCopy, btn);
    }
  }

  function fallbackCopyText(text, btn) {
    const textArea = document.createElement('textarea');
    textArea.value = text;
    textArea.style.position = 'fixed';
    textArea.style.left = '-9999px';
    document.body.appendChild(textArea);
    textArea.select();
    try {
      document.execCommand('copy');
      showCopyFeedback(btn);
    } catch {
      alert('Manual copy required.');
    }
    document.body.removeChild(textArea);
  }

  function showCopyFeedback(btn) {
    const originalText = btn.textContent;
    btn.textContent = 'Copied!';
    btn.classList.add('btn-primary');
    setTimeout(() => {
      btn.textContent = originalText;
      btn.classList.remove('btn-primary');
    }, 1500);
  }

  // Web Share API
  function shareTimestampResult() {
    const tsVal = document.getElementById('resOriginal').textContent;
    const utcDate = document.getElementById('resUtcDate').textContent;

    const shareData = {
      title: 'Unix Timestamp Conversion',
      text: `Unix Timestamp: ${tsVal}\nUTC Date: ${utcDate}`,
      url: window.location.href
    };

    if (navigator.share) {
      navigator.share(shareData).catch(() => {});
    } else {
      navigator.clipboard.writeText(`${shareData.text}\n${shareData.url}`).then(() => {
        alert('Result copied to clipboard!');
      });
    }
  }

  // Service Worker Registration for Offline PWA Capabilities
  function registerServiceWorker() {
    if ('serviceWorker' in navigator && window.location.protocol !== 'file:') {
      window.addEventListener('load', () => {
        navigator.serviceWorker.register('service-worker.js').catch(() => {
          // Silent fallback for restricted environments
        });
      });
    }
  }

})();
