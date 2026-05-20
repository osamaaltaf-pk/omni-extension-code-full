/**
 * Omni Automator – Content Script (Platform-Agnostic)
 * Runs on meta.ai, gemini.google.com, chatgpt.com
 * Uses platform adapter (loaded before this script) for DOM interaction.
 */
(function() {
  'use strict';

  const Utils = window.MetaUtils || {};
  const Storage = window.MetaStorage || {};
  const Adapter = window.PlatformAdapter;

  // ─── Message Listener (Must be registered early to handle blob fetches even without Adapter) ───
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    handleMessage(msg).then(sendResponse).catch(err => {
      sendResponse({ success: false, error: err.message });
    });
    return true;
  });

  if (!Adapter) {
    console.warn('[OmniAutomator] No platform adapter found for this page. Automation features disabled, but core bridge active.');
  }

  console.log(`[OmniAutomator] Content script loaded on ${Adapter.name} (${Adapter.platform})`);

  let isRunning = false;
  let isPaused = false;
  let currentQueue = [];
  let currentIndex = 0;
  let currentPhase = null;
  let currentMode = null;
  let currentInputMode = null;
  let settings = {};
  let observer = null;
  let processedUrls = new Set();

  // ─── Init ───────────────────────────────────────────────────────
  async function init() {
    if (!Adapter) return;
    settings = await Storage.getSettings();
    setupContentObserver();
    injectPrivacyBlur();
    injectStatusOverlay();

    // For Gemini: auto-select Flash model on load
    if (Adapter.platform === 'gemini') {
      setTimeout(async () => {
        await Adapter.selectModel('flash');
      }, 3000); // Wait for page to fully load
    }
  }


  async function handleMessage(msg) {
    switch (msg.type) {
      case 'START_QUEUE':
        return await startQueue(msg.data);
      case 'PAUSE_QUEUE':
        return pauseQueue();
      case 'RESUME_QUEUE':
        return resumeQueue();
      case 'STOP_QUEUE':
        return stopQueue();
      case 'INJECT_PROMPT':
        return await Adapter.injectPrompt(msg.data.prompt);
      case 'SWITCH_MODE':
        return await Adapter.switchMode(msg.data.mode, msg.data.phase);
      case 'UPLOAD_REFERENCE':
        return await Adapter.uploadReference(msg.data);
      case 'GET_STATUS':
        return getContentStatus();
      case 'UPDATE_SETTINGS':
        settings = { ...settings, ...msg.data };
        return { success: true };
      case 'SELECT_MODEL':
        return await Adapter.selectModel(msg.data.model);
      case 'FETCH_BLOB_AS_B64':
        return await fetchBlobAsB64(msg.url);
      default:
        return { success: false, error: 'Unknown content message' };
    }
  }

  /**
   * Helper to fetch a blob URL and convert to base64
   * This must run in the tab context that owns the blob
   */
  async function fetchBlobAsB64(url) {
    try {
      const response = await fetch(url);
      const blob = await response.blob();
      return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve({ success: true, dataUrl: reader.result });
        reader.onerror = () => resolve({ success: false, error: 'Read error' });
        reader.readAsDataURL(blob);
      });
    } catch (e) {
      return { success: false, error: e.message };
    }
  }

  // ─── Queue Processing ─────────────────────────────────────────
  async function startQueue(data) {
    if (isRunning) return { success: false, error: 'Already running' };

    // Load queue from storage instead of message (prevents 64MB limit error)
    const storage = await chrome.storage.local.get('meta_automator_queue');
    currentQueue = storage.meta_automator_queue || [];
    
    if (currentQueue.length === 0) {
      return { success: false, error: 'No prompts in queue' };
    }

    currentIndex = 0;
    isRunning = true;
    isPaused = false;
    currentInputMode = data.inputMode || 'text';
    currentPhase = data.phase || null;
    currentMode = data.mode || 'image';
    settings = await Storage.getSettings();

    // Switch mode if needed (Meta AI has image/video tabs)
    if (data.mode && Adapter.platform === 'meta') {
      await Adapter.switchMode(data.mode, data.phase);
    }

    // For Gemini: ensure Flash model is selected
    if (Adapter.platform === 'gemini') {
      await Adapter.selectModel('flash');
    }

    updateOverlay('running', `Processing 0/${currentQueue.length}`);
    await Storage.setQueueState('running');

    processNextPrompt();
    return { success: true, total: currentQueue.length };
  }

  function pauseQueue() {
    isPaused = true;
    updateOverlay('paused', `Paused at ${currentIndex}/${currentQueue.length}`);
    Storage.setQueueState('paused');
    return { success: true };
  }

  function resumeQueue() {
    if (!isRunning) return { success: false, error: 'Not running' };
    isPaused = false;
    updateOverlay('running', `Resuming ${currentIndex}/${currentQueue.length}`);
    Storage.setQueueState('running');
    processNextPrompt();
    return { success: true };
  }

  function stopQueue() {
    isRunning = false;
    isPaused = false;
    updateOverlay('idle', 'Stopped');
    Storage.setQueueState('idle');
    broadcastStatus();
    return { success: true };
  }

  async function processNextPrompt() {
    if (!isRunning || isPaused) return;

    // Refresh queue from storage
    const queueData = await chrome.storage.local.get(['meta_automator_queue', 'meta_automator_phase']);
    if (queueData.meta_automator_queue) currentQueue = queueData.meta_automator_queue;
    if (queueData.meta_automator_phase) currentPhase = queueData.meta_automator_phase;

    // Find the next pending prompt
    currentIndex = currentQueue.findIndex(q => q.status === 'pending');

    if (currentIndex === -1) {
      isRunning = false;
      updateOverlay('completed', `Done! ${currentQueue.length} prompts processed`);
      await Storage.setQueueState('idle');
      broadcastStatus();
      return;
    }

    const promptItem = currentQueue[currentIndex];
    
    // Mark as processing
    await updateQueueItem(promptItem.id, 'processing');
    broadcastStatus();
    
    // Determine the prompt text based on mode
    let promptText = promptItem.text;
    if (currentInputMode === 'pipeline') {
      promptText = currentPhase === 'video' ? promptItem.videoPrompt : promptItem.imagePrompt;
    }

    // For Gemini/ChatGPT: prepend "Generate an image of" if not already
    if (Adapter.platform !== 'meta' && currentMode === 'image') {
      const lower = promptText.toLowerCase();
      if (!lower.startsWith('generate') && !lower.startsWith('create') && !lower.startsWith('draw') && !lower.startsWith('make')) {
        promptText = 'Generate an image of: ' + promptText;
      }
    }

    // Determine the reference image(s)
    let refImage = promptItem.referenceImage || null;
    let refImages = promptItem.referenceImages || null;
    
    // If using decoupled storage (indices)
    const storage = await chrome.storage.local.get('meta_automator_ref_images');
    const allRefs = storage.meta_automator_ref_images || [];
    
    if (typeof promptItem.refIdx === 'number') {
      refImage = allRefs[promptItem.refIdx];
    } else if (Array.isArray(promptItem.refIndices)) {
      refImages = promptItem.refIndices.map(idx => allRefs[idx]).filter(Boolean);
    }

    if (currentInputMode === 'pipeline' && currentPhase === 'video') {
      refImage = promptItem.capturedImage;
      refImages = null; // Video phase uses single captured image
    }

    updateOverlay('running', `Processing ${currentIndex + 1}/${currentQueue.length}`);

    try {
      // 1. Upload reference image(s)
      if (refImages && refImages.length > 0 && Adapter.uploadMultipleReferences) {
        console.log(`[OmniAutomator] Uploading ${refImages.length} images...`);
        await Adapter.uploadMultipleReferences(refImages);
        await stealthDelay(settings.minDelay, settings.maxDelay);
      } else if (refImage) {
        console.log('[OmniAutomator] Uploading single image...');
        await Adapter.uploadReference({ dataUrl: refImage });
        await stealthDelay(settings.minDelay / 2, settings.minDelay); 
      }

      // 2. Inject prompt text
      console.log('[OmniAutomator] Injecting prompt...');
      await Adapter.injectPrompt(promptText);
      await stealthDelay(settings.minDelay / 3, settings.minDelay / 2);

      // 3. Click send
      console.log('[OmniAutomator] Clicking Send...');
      await Adapter.clickSend();

      // 4. Mandatory Post-Send Cooldown (Respects Sliders)
      console.log(`[OmniAutomator] Cooling down (${settings.minDelay}ms)...`);
      await stealthDelay(settings.minDelay, settings.maxDelay); 

      // 5. Wait for generation to finish
      const content = await waitForGeneration();

      if (content && content.length > 0) {
        // Capture all variations as optimized thumbnails AND full-res versions
        const capturedImages = [];
        const fullResImages = [];
        for (const item of content) {
          if (item.type === 'image') {
            try {
              const response = await fetch(item.url);
              const blob = await response.blob();
              const reader = new FileReader();
              const dataUrl = await new Promise((res) => {
                reader.onload = () => res(reader.result);
                reader.readAsDataURL(blob);
              });
              
              // Store full resolution for processing
              fullResImages.push(dataUrl);
              
              // Resize to ~200px for the UI grid (saves tons of memory)
              const thumbUrl = await resizeImage(dataUrl, 200);
              capturedImages.push(thumbUrl);
            } catch(e) {
              console.error('[OmniAutomator] Failed to capture variation:', e);
            }
          }
        }

        const extraData = { capturedImages, fullResImages };
        if (capturedImages.length > 0) {
          extraData.capturedImage = fullResImages[0]; // Set default main to full res
          extraData.thumbnail = capturedImages[0]; // Set default thumbnail
        }

        await updateQueueItem(promptItem.id, 'completed', extraData);

        // Auto-download if enabled (Skip if in Pipeline Phase 1 to save space)
        const isPipelinePhase1 = currentMode === 'pipeline' && currentPhase === 'image';
        if (settings.autoDownload && !isPipelinePhase1) {
          const maxDl = promptItem.maxDownloads || 1;
          let variant = 1;
          for (const item of content) {
            if (variant > maxDl) break; 
            await downloadContent(item, promptText, promptItem.index, variant, currentPhase || currentInputMode);
            variant++;
          }
        }
        broadcastStatus();
      } else {
        // Generation returned null (could be timeout or flagged)
        const isFlagged = Adapter.isFlagged && Adapter.isFlagged();
        
        if (isFlagged && settings.autoFix && !promptItem.isRefined && window.PromptRefiner) {
          console.warn('[OmniAutomator] Flag detected. Attempting auto-fix and retry...');
          const refinedText = window.PromptRefiner.refine(promptText);
          
          // Update the item in storage so we don't retry forever
          const updateData = { isRefined: true };
          if (currentInputMode === 'pipeline') {
            if (currentPhase === 'video') updateData.videoPrompt = refinedText;
            else updateData.imagePrompt = refinedText;
          } else {
            updateData.text = refinedText;
          }
          
          await updateQueueItem(promptItem.id, 'pending', updateData);
          updateOverlay('running', `Retrying refined prompt...`);
          
          // Small delay before retry
          await Utils.sleep(2000);
          processNextPrompt();
          return;
        }

        await updateQueueItem(promptItem.id, 'failed');
      }
    } catch (err) {
      console.error('[OmniAutomator] Prompt error:', err);
      await updateQueueItem(promptItem.id, 'failed');
    }

    // Stealth delay before next item
    if (isRunning && !isPaused) {
      await stealthDelay();
      processNextPrompt();
    }
  }

  // ─── Wait for Generation ──────────────────────────────────────
  async function waitForGeneration() {
    // Default to 60 seconds if not specified by user, as requested
    const timeout = settings.generationTimeout ? Math.min(settings.generationTimeout, 60000) : 60000;
    const startTime = Date.now();
    const startUrls = Adapter.getContentUrls();

    console.log(`[OmniAutomator] Waiting for generation (timeout: ${timeout/1000}s)...`);

    while (Date.now() - startTime < timeout) {
      await Utils.sleep(2000);
      if (!isRunning) return null;

      // 1. Check for new content URLs
      const currentUrls = Adapter.getContentUrls();
      const newUrls = currentUrls.filter(u => !startUrls.includes(u) && !processedUrls.has(u));

      if (newUrls.length > 0) {
        // Wait a bit more for all variations to appear (Meta AI often generates 4)
        await Utils.sleep(4000);
        const finalUrls = Adapter.getContentUrls().filter(u => !startUrls.includes(u) && !processedUrls.has(u));
        
        const content = finalUrls.map(url => {
          processedUrls.add(url);
          const isVideo = url.includes('video') || url.includes('.mp4') || url.includes('.webm');
          return { url, type: isVideo ? 'video' : 'image' };
        });
        return content;
      }

      // 2. Check for flagged content/safety filters
      if (Adapter.isFlagged && Adapter.isFlagged()) {
        console.warn('[OmniAutomator] Content flagged/blocked by safety filters.');
        return null; // Return null to trigger failure and move to next
      }

      // 3. Check if loading finished without content
      const loading = Adapter.isLoading();
      if (!loading && Date.now() - startTime > 10000) {
        const check = Adapter.getContentUrls().filter(u => !startUrls.includes(u) && !processedUrls.has(u));
        if (check.length > 0) {
          return check.map(url => {
            processedUrls.add(url);
            const isVideo = url.includes('video') || url.includes('.mp4') || url.includes('.webm');
            return { url, type: isVideo ? 'video' : 'image' };
          });
        }
        
        // Final safety check: if we've waited long enough and no loading icon, might be flagged or failed
        if (Date.now() - startTime > 15000 && Adapter.isFlagged && Adapter.isFlagged()) {
          console.warn('[OmniAutomator] Delayed flag detection.');
          return null;
        }
      }
    }

    console.warn('[OmniAutomator] Generation timeout (60s limit reached)');
    return null;
  }

  // ─── Download ─────────────────────────────────────────────────
  async function downloadContent(item, prompt, index, variant = 1, mode = '') {
    const promptItem = currentQueue[currentIndex];
    // Determine extension based on settings
    let type = item.type;
    let filename = generateFilename(prompt, index, type, variant, mode, promptItem ? promptItem.filename : null);
    
    // Pass everything SW needs to pick the right folder
    const metadata = {
      url: item.url,
      filename,
      type,
      prompt,
      platform: Adapter.platform,
      mode: currentMode,
      inputMode: currentInputMode
    };

    // If it's an image and we have a preferred format, convert it
    if (type === 'image' && settings.imageFormat && settings.imageFormat !== 'original') {
      try {
        const converted = await convertImage(item.url, settings.imageFormat);
        metadata.url = converted.dataUrl;
        metadata.filename = filename.replace(/\.[^.]+$/, `.${settings.imageFormat === 'jpg' ? 'jpg' : 'png'}`);
      } catch (e) {
        console.error('[OmniAutomator] Format conversion failed, using original:', e);
      }
    }

    if (metadata.url.startsWith('blob:')) {
      try {
        const response = await fetch(metadata.url);
        const blob = await response.blob();
        const reader = new FileReader();
        reader.onload = () => {
          metadata.url = reader.result;
          chrome.runtime.sendMessage({ type: 'DOWNLOAD_FILE', data: metadata });
        };
        reader.readAsDataURL(blob);
      } catch (e) {
        console.error('[OmniAutomator] Blob download error:', e);
      }
    } else {
      chrome.runtime.sendMessage({ type: 'DOWNLOAD_FILE', data: metadata });
    }
  }

  async function convertImage(url, format) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0);
        const mime = format === 'jpg' ? 'image/jpeg' : 'image/png';
        const dataUrl = canvas.toDataURL(mime, 0.95);
        resolve({ dataUrl });
      };
      img.onerror = reject;
      img.src = url;
    });
  }

  function generateFilename(prompt, index, type, variant = 1, mode = '', baseName = null) {
    const prefix = baseName || (type === 'video' ? 'scene' : 'shot') + (index + 1);
    const ext = type === 'video' ? '.mp4' : '.png';
    
    let filename = prefix;
    
    // If concurrency is > 1, add variation suffix
    if (variant > 1) {
      filename += `_v${variant}`;
    }
    
    return filename + ext;
  }

  // ─── Content Observer ─────────────────────────────────────────
  function setupContentObserver() {
    observer = new MutationObserver((mutations) => {
      // Auto-click "Stay" or dismiss dialogs
      if (isRunning) {
        const dialog = document.querySelector('[role="dialog"]');
        if (dialog) {
          const buttons = dialog.querySelectorAll('button');
          for (const btn of buttons) {
            const text = btn.textContent.trim().toLowerCase();
            if (text === 'stay' || text === 'dismiss' || text === 'close' || text === 'ok') {
              btn.click();
              console.log('[OmniAutomator] Auto-dismissed dialog');
              break;
            }
          }
        }
      }

      if (!settings.autoDownload || isRunning) return;
    });

    observer.observe(document.body, {
      childList: true, subtree: true,
      attributes: true, attributeFilter: ['src']
    });
  }

  // ─── Privacy Blur ──────────────────────────────────────────────
  function injectPrivacyBlur() {
    if (document.getElementById('ma-privacy-blur')) return;
    const blur = document.createElement('div');
    blur.id = 'ma-privacy-blur';
    document.body.appendChild(blur);
  }

  function togglePrivacy(active) {
    const blur = document.getElementById('ma-privacy-blur');
    const btn = document.getElementById('ma-privacy-toggle');
    if (!blur) return;
    
    if (active === undefined) active = !blur.classList.contains('active');
    
    blur.classList.toggle('active', active);
    if (btn) {
      btn.classList.toggle('active', active);
      btn.textContent = active ? '🔒 Privacy: ON' : '🔓 Privacy: OFF';
    }
  }

  // ─── Status Overlay ──────────────────────────────────────────
  function injectStatusOverlay() {
    if (document.getElementById('meta-automator-overlay')) return;
    
    const overlay = document.createElement('div');
    overlay.id = 'meta-automator-overlay';
    
    overlay.innerHTML = `
      <div class="ma-overlay-header" id="ma-overlay-handle">
        <div class="ma-header-top">
          <span class="ma-overlay-icon">⚡</span>
          <span class="ma-overlay-title">Omni Automator</span>
          <span id="oa-status-badge" class="ma-overlay-status ma-status-idle">Ready</span>
          <button id="oa-overlay-minimize" class="ma-overlay-toggle">─</button>
        </div>
        
        <div class="ma-header-branding">
          <div class="ma-branding-name">Osama_Altaf</div>
          <div class="ma-branding-links">
            <a href="https://linkedin.com/in/osamaaltafpk" target="_blank" class="ma-branding-link" title="LinkedIn">
              <svg viewBox="0 0 24 24" style="fill:#0077b5;"><path d="M19 0h-14c-2.761 0-5 2.239-5 5v14c0 2.761 2.239 5 5 5h14c2.762 0 5-2.239 5-5v-14c0-2.761-2.238-5-5-5zm-11 19h-3v-11h3v11zm-1.5-12.268c-.966 0-1.75-.79-1.75-1.764s.784-1.764 1.75-1.764 1.75.79 1.75 1.764-.783 1.764-1.75 1.764zm13.5 12.268h-3v-5.604c0-3.368-4-3.113-4 0v5.604h-3v-11h3v1.765c1.396-2.586 7-2.777 7 2.476v6.759z"/></svg>
            </a>
            <a href="https://www.fiverr.com/neural_networks" target="_blank" class="ma-branding-link" title="Fiverr">
              <svg viewBox="0 0 512 512" style="fill:#1dbf73;"><path d="M67.1 121.5c-24.2 0-44 19.8-44 44v181c0 24.2 19.8 44 44 44h377.8c24.2 0 44-19.8 44-44v-181c0-24.2-19.8-44-44-44H67.1zm81.4 75.8h41.7v28.4h.6c5.7-10.8 15.3-22.3 32.2-22.3 17.5 0 31.7 11.4 31.7 34.6v63.1h-33.1v-58.1c0-11-4.4-18.6-14.4-18.6-7.6 0-12.1 5.1-14.1 10.1-.7 1.8-1.1 4.3-1.1 6.8v59.8h-33.1v-103.8h-.4zm134.1 0h31.7v14.1h.4c4.4-8 11.7-15.5 24.2-15.5 13.1 0 23.4 8.7 23.4 25.8v61.1h-33.1v-56.1c0-10.5-3.8-17.6-13.3-17.6-7.3 0-11.6 4.9-13.5 9.7-.7 1.7-1 4.1-1 6.5v57.5h-33.1v-103.8h-.4z"/></svg>
            </a>
            <a href="https://wa.me/923187661096" target="_blank" class="ma-branding-link" title="WhatsApp">
              <svg viewBox="0 0 24 24" style="fill:#25d366;"><path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946.003-6.556 5.338-11.891 11.893-11.891 3.181.001 6.167 1.24 8.413 3.488 2.245 2.248 3.481 5.236 3.48 8.414-.003 6.557-5.338 11.892-11.893 11.892-1.99-.001-3.951-.5-5.688-1.448l-6.305 1.654zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884-.001 2.225.651 3.891 1.746 5.634l-.999 3.648 3.742-.981zm11.387-5.464c-.074-.124-.272-.198-.57-.347-.297-.149-1.758-.868-2.031-.967-.272-.099-.47-.149-.669.149-.198.297-.768.967-.941 1.165-.173.198-.347.223-.644.074-.297-.149-1.255-.462-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.297-.347.446-.521.151-.172.2-.296.3-.495.099-.198.05-.372-.025-.521-.075-.148-.669-1.611-.916-2.206-.242-.579-.487-.501-.669-.51l-.57-.01c-.198 0-.52.074-.792.372s-1.04 1.016-1.04 2.479 1.065 2.876 1.213 3.074c.149.198 2.095 3.2 5.076 4.487.709.306 1.263.489 1.694.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.695.248-1.29.173-1.414z"/></svg>
            </a>
          </div>
        </div>
      </div>

      <div id="oa-overlay-body" class="ma-overlay-body">
        <div class="ma-overlay-progress">
          <span id="oa-progress-text">Waiting for commands...</span>
          <span id="oa-progress-val" class="ma-progress-val">0%</span>
        </div>
        <div class="ma-progress-bar-container">
          <div id="oa-progress-bar" class="ma-progress-bar"></div>
        </div>
      </div>

      <div class="ma-overlay-footer" id="ma-overlay-footer">
        <button id="ma-privacy-toggle" class="ma-privacy-btn">🔓 Privacy: OFF</button>
      </div>
    `;
    document.body.appendChild(overlay);

    // Draggable Logic
    setupDraggable(overlay, document.getElementById('ma-overlay-handle'));

    document.getElementById('oa-overlay-minimize').addEventListener('click', () => {
      const body = document.getElementById('oa-overlay-body');
      const footer = document.getElementById('ma-overlay-footer');
      const branding = document.querySelector('.ma-header-branding');
      const isHidden = body.style.display === 'none';
      
      body.style.display = isHidden ? 'block' : 'none';
      if (footer) footer.style.display = isHidden ? 'flex' : 'none';
      if (branding) branding.style.display = isHidden ? 'flex' : 'none';
      
      document.getElementById('oa-overlay-minimize').textContent = isHidden ? '─' : '▢';
    });

    document.getElementById('ma-privacy-toggle').addEventListener('click', () => togglePrivacy());
  }

  function setupDraggable(el, handle) {
    let pos1 = 0, pos2 = 0, pos3 = 0, pos4 = 0;
    handle.onmousedown = dragMouseDown;

    function dragMouseDown(e) {
      e.preventDefault();
      pos3 = e.clientX;
      pos4 = e.clientY;
      document.onmouseup = closeDragElement;
      document.onmousemove = elementDrag;
    }

    function elementDrag(e) {
      e.preventDefault();
      pos1 = pos3 - e.clientX;
      pos2 = pos4 - e.clientY;
      pos3 = e.clientX;
      pos4 = e.clientY;
      el.style.top = (el.offsetTop - pos2) + "px";
      el.style.left = (el.offsetLeft - pos1) + "px";
      el.style.bottom = 'auto';
      el.style.right = 'auto';
    }

    function closeDragElement() {
      document.onmouseup = null;
      document.onmousemove = null;
    }
  }

  function updateOverlay(state, text) {
    const badge = document.getElementById('oa-status-badge');
    const progress = document.getElementById('oa-progress-text');
    const valText = document.getElementById('oa-progress-val');
    const bar = document.getElementById('oa-progress-bar');

    if (badge) {
      badge.textContent = state.charAt(0).toUpperCase() + state.slice(1);
      badge.className = `ma-overlay-status ma-status-${state}`;
    }
    if (progress) progress.textContent = text;
    if (bar && currentQueue.length > 0) {
      const pct = Math.round((currentIndex / currentQueue.length) * 100);
      bar.style.width = pct + '%';
      if (valText) valText.textContent = pct + '%';
    }
  }

  async function resizeImage(dataUrl, maxDim) {
    return new Promise((res) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let w = img.width;
        let h = img.height;
        if (w > h) {
          if (w > maxDim) { h *= maxDim / w; w = maxDim; }
        } else {
          if (h > maxDim) { w *= maxDim / h; h = maxDim; }
        }
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, w, h);
        res(canvas.toDataURL('image/jpeg', 0.8)); // Use JPEG for better compression
      };
      img.onerror = () => res(dataUrl);
      img.src = dataUrl;
    });
  }

  // ─── Helpers ──────────────────────────────────────────────────
  async function stealthDelay(min, max) {
    if (!settings.stealthMode) {
      await Utils.sleep(500);
      return;
    }
    const lo = min || settings.minDelay || 3000;
    const hi = max || settings.maxDelay || 7000;
    await Utils.randomSleep(lo, hi);
  }

  async function updateQueueItem(id, status, extraFields = {}) {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const queueData = await chrome.storage.local.get('meta_automator_queue');
        const queue = queueData.meta_automator_queue || currentQueue;
        const item = queue.find(q => q.id === id);
        
        if (item) {
          item.status = status;
          Object.assign(item, extraFields);
          await chrome.storage.local.set({ meta_automator_queue: queue });
          currentQueue = queue;
          console.log(`[OmniAutomator] Updated item ${id} to ${status}`);
          return;
        } else {
          console.warn(`[OmniAutomator] Item ${id} not found in queue (attempt ${attempt + 1})`);
        }
      } catch (e) {
        console.error(`[OmniAutomator] Update error:`, e);
      }
      await Utils.sleep(500);
    }
  }

  function getContentStatus() {
    const completed = currentQueue.filter(p => p.status === 'completed' || (p.status === 'failed' && ((p.capturedImages && p.capturedImages.length > 0) || p.capturedImage))).length;
    const failed = currentQueue.filter(p => p.status === 'failed' && !((p.capturedImages && p.capturedImages.length > 0) || p.capturedImage)).length;
    const pending = currentQueue.filter(p => p.status === 'pending').length;
    const processing = currentQueue.filter(p => p.status === 'processing').length;

    return {
      success: true,
      isRunning,
      isPaused,
      currentIndex,
      total: currentQueue.length,
      queueLength: currentQueue.length,
      queueState: isRunning ? (isPaused ? 'paused' : 'running') : 'idle',
      completed,
      failed,
      pending,
      processing,
      platform: Adapter.platform
    };
  }

  function broadcastStatus() {
    chrome.runtime.sendMessage({
      type: 'STATUS_UPDATE',
      data: getContentStatus()
    }).catch(() => {});
  }

  // ─── Start ────────────────────────────────────────────────────
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
