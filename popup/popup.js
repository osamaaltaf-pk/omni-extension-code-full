/**
 * Meta Automator – Popup Logic
 */
(function () {
  'use strict';

  document.addEventListener('DOMContentLoaded', async () => {
    // Automatically open side panel and close popup
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab) {
      try {
        await chrome.sidePanel.open({ tabId: tab.id });
      } catch (e) {
        // Fallback for older Chrome versions or if message is needed
        chrome.runtime.sendMessage({ type: 'OPEN_SIDE_PANEL', tabId: tab.id });
      }
    }
    window.close();
  });

  async function fetchStatus() {
    try {
      const r = await chrome.runtime.sendMessage({ type: 'GET_STATUS' });
      if (!r || !r.success) return;

      document.getElementById('totalGenerated').textContent = r.totalGenerated || 0;
      document.getElementById('totalDownloads').textContent = r.totalDownloads || 0;
      document.getElementById('queueLength').textContent = r.pending || 0;

      const dot = document.getElementById('statusDot');
      const text = document.getElementById('statusText');
      dot.className = 'status-dot ' + (r.queueState || 'idle');
      text.textContent = r.queueState || 'Idle';

      const stopBtn = document.getElementById('quickStop');
      stopBtn.disabled = r.queueState === 'idle';

      const progress = document.getElementById('progressSection');
      if (r.queueState === 'running' || r.queueState === 'paused') {
        progress.style.display = 'block';
        const total = r.queueLength || 1;
        const done = r.completed || 0;
        document.getElementById('progressLabel').textContent =
          r.queueState === 'paused' ? 'Paused' : 'Processing...';
        document.getElementById('progressCount').textContent = done + '/' + total;
        document.getElementById('progressBar').style.width = ((done / total) * 100) + '%';
      } else {
        progress.style.display = 'none';
      }
    } catch (e) { /* ignore */ }
  }

  function showToast(msg) {
    const t = document.createElement('div');
    t.textContent = msg;
    t.style.cssText = 'position:fixed;bottom:50px;left:50%;transform:translateX(-50%);padding:6px 14px;border-radius:8px;background:rgba(139,92,246,0.9);color:white;font-size:11px;font-weight:500;z-index:9999;';
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 2000);
  }
})();
