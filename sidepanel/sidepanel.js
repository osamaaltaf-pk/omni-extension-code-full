/**
 * Omni Automator – Side Panel Logic
 * Supports Meta AI, Google Gemini, ChatGPT
 */
(function () {
  'use strict';

  // State
  let currentSettings = {};
  let currentMode = 'image';
  let currentInputMode = 'text';
  let currentPlatform = 'meta';
  let currentAspectRatio = '1:1';
  let currentConcurrency = 1;
  let currentDownloadFactor = 1;
  let referenceImages = [];
  let statusInterval = null;
  let lastRenderedState = '';
  let previewTimeout = null;

  // ─── Init ───────────────────────────────────────────────────
  document.addEventListener('DOMContentLoaded', async () => {
    await loadSettings();
    await loadPlatform();
    setupPlatformSelector();
    setupTabs();
    setupModeSelectors();
    setupInputModes();
    setupPromptInput();
    setupContextImage();
    setupReferenceImages();
    setupResolutionAndConcurrency();
    setupDownloadFactor();
    setupFlowSelectors(); // New
    setupControls();
    setupSettingsUI();
    setupTheme();
    startStatusPolling();
    // Licensing setup
    updateLicenseUI();
    setupLicensingUI();
  });

  // ─── Platform Selector ─────────────────────────────────────
  async function loadPlatform() {
    try {
      const r = await sendMessage({ type: 'GET_PLATFORM' });
      if (r?.platform) currentPlatform = r.platform;
    } catch (e) {
      console.warn('[Sidepanel] Could not get platform from SW:', e);
    }
    document.querySelectorAll('.sp-platform-btn').forEach(b => {
      b.classList.toggle('active', b.dataset.platform === currentPlatform);
    });
  }

  function setupPlatformSelector() {
    document.querySelectorAll('.sp-platform-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        document.querySelectorAll('.sp-platform-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        currentPlatform = btn.dataset.platform;
        await sendMessage({ type: 'SET_PLATFORM', data: { platform: currentPlatform } });
        updateUIState();
        showToast('Platform: ' + { meta: 'Meta AI', gemini: 'Gemini (Flash)', chatgpt: 'ChatGPT' }[currentPlatform]);
      });
    });

    document.querySelectorAll('.sp-open-site-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const url = btn.dataset.url;
        if (url) window.open(url, '_blank');
      });
    });
  }

  // ─── Tabs ───────────────────────────────────────────────────
  function setupTabs() {
    document.querySelectorAll('.sp-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        document.querySelectorAll('.sp-tab').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.sp-panel').forEach(p => p.classList.remove('active'));
        tab.classList.add('active');
        const panelId = 'panel-' + tab.dataset.tab;
        document.getElementById(panelId).classList.add('active');
      });
    });
  }

  // ─── Mode Selectors ────────────────────────────────────────
  function setupModeSelectors() {
    document.querySelectorAll('.sp-mode-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.sp-mode-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        currentMode = btn.dataset.genMode;
        updateUIState();
      });
    });
  }

  // ─── Input Modes ───────────────────────────────────────────
  function setupInputModes() {
    document.querySelectorAll('.sp-chip[data-input-mode]').forEach(chip => {
      chip.addEventListener('click', () => {
        document.querySelectorAll('.sp-chip[data-input-mode]').forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
        currentInputMode = chip.dataset.inputMode;
        updateUIState();
      });
    });
  }

  function updateUIState() {
    const refSection = document.getElementById('refSection');
    const contextSection = document.getElementById('contextSection');
    const videoPromptWrapper = document.getElementById('videoPromptWrapper');
    const promptAreaLabel = document.getElementById('promptAreaLabel');
    const platformNote = document.getElementById('platformNote');
    const genModeGrid = document.getElementById('genModeGrid');
    const inputModeBtnGroup = document.getElementById('inputModeBtnGroup');
    const inputModeHint = document.getElementById('inputModeHint');
    const refSectionLabel = document.getElementById('refSectionLabel');

    // ── Platform-specific: hide Video/Pipeline for Gemini & ChatGPT ──
    const isMetaPlatform = currentPlatform === 'meta';
    const modeVideo = document.getElementById('modeVideo');
    const modePipeline = document.getElementById('modePipeline');
    if (modeVideo) modeVideo.style.display = isMetaPlatform ? 'flex' : 'none';
    if (modePipeline) modePipeline.style.display = isMetaPlatform ? 'flex' : 'none';

    if (!isMetaPlatform) {
      currentMode = 'image';
      document.querySelectorAll('.sp-mode-btn').forEach(b => b.classList.remove('active'));
      document.getElementById('modeImage').classList.add('active');
    }
    genModeGrid.style.gridTemplateColumns = isMetaPlatform ? '1fr 1fr 1fr' : '1fr';

    // Platform note
    if (!isMetaPlatform) {
      const notes = {
        gemini: '⚡ Using Gemini Flash mode (image only)',
        chatgpt: '◎ Using ChatGPT (image only)'
      };
      platformNote.textContent = notes[currentPlatform] || '';
      platformNote.style.display = 'block';
    } else {
      platformNote.style.display = 'none';
    }

    // ── Input method chips ──
    const chipSingle = document.getElementById('chipSingle');
    const chipPaired = document.getElementById('chipPaired');
    const isVideoMode = currentMode === 'video';
    const isPipelineMode = currentMode === 'pipeline';

    // Video Mode: only Text and Paired allowed
    if (chipSingle) chipSingle.style.display = isVideoMode ? 'none' : 'inline-flex';

    // Pipeline Mode: Paired not allowed
    if (chipPaired) chipPaired.style.display = isPipelineMode ? 'none' : 'inline-flex';

    // Auto-fallback
    if (isVideoMode && currentInputMode === 'single') {
      currentInputMode = 'text';
    } else if (isPipelineMode && currentInputMode === 'paired') {
      currentInputMode = 'single';
    }

    // Refresh active chips
    inputModeBtnGroup.querySelectorAll('.sp-chip').forEach(c => {
      c.classList.toggle('active', c.dataset.inputMode === currentInputMode);
    });

    // Concurrency Visibility: Only for Video mode
    const concurrencyRow = document.getElementById('concurrencySelector')?.parentElement;
    if (concurrencyRow) {
      concurrencyRow.style.display = currentMode === 'video' ? 'block' : 'none';
      if (currentMode !== 'video') currentConcurrency = 1; // Reset to 1 if hidden
    }

    // Download Selector Visibility: Always visible now, including Pipeline
    const dlRow = document.getElementById('downloadSelectorRow');
    if (dlRow) dlRow.style.display = 'block';

    // ── Hint text per platform ──
    if (inputModeHint) {
      const hints = {
        meta: 'Meta AI supports up to 4 reference images per generation.',
        gemini: 'Gemini: reference image upload may vary. Single ref recommended.',
        chatgpt: 'ChatGPT: supports 1 reference image per generation.'
      };
      inputModeHint.textContent = (currentInputMode !== 'text') ? (hints[currentPlatform] || '') : '';
    }

    // ── Reference label text ──
    if (refSectionLabel) {
      if (currentMode === 'pipeline') {
        refSectionLabel.textContent = 'Character & Environment Sheets (Up to 4)';
      } else if (currentInputMode === 'single') {
        refSectionLabel.textContent = 'Character & Environment Sheets (Up to 4)';
      } else {
        refSectionLabel.textContent = 'Reference Images';
      }
    }

    // ── Reference Image Section — only for non-text modes ──
    refSection.style.display = (currentInputMode !== 'text') ? 'block' : 'none';

    // ── Story Context — Always visible ──
    contextSection.style.display = 'block';

    // ── Video Prompts box — only in Pipeline mode ──
    if (currentMode === 'pipeline') {
      videoPromptWrapper.style.display = 'block';
      promptAreaLabel.childNodes[0].textContent = 'Image Prompts ';
    } else {
      videoPromptWrapper.style.display = 'none';
      promptAreaLabel.childNodes[0].textContent = 'Prompts ';
    }

    // ── Folder Visibility ──
    const folderMetaImageGroup = document.getElementById('folderMetaImageGroup');
    const folderMetaVideoGroup = document.getElementById('folderMetaVideoGroup');
    const folderGeminiGroup = document.getElementById('folderGeminiGroup');
    const folderChatGPTGroup = document.getElementById('folderChatGPTGroup');
    const modeFolderSection = document.getElementById('modeFolderSection');

    if (modeFolderSection) {
      
      // Show/hide based on platform and mode
      const isMetaPipe = (currentPlatform === 'meta' && currentMode === 'pipeline');
      
      if (folderMetaImageGroup) folderMetaImageGroup.style.display = (currentPlatform === 'meta' && currentMode === 'image') ? 'block' : 'none';
      if (folderMetaVideoGroup) folderMetaVideoGroup.style.display = (currentPlatform === 'meta' && currentMode === 'video') ? 'block' : 'none';
      if (folderGeminiGroup) folderGeminiGroup.style.display = (currentPlatform === 'gemini') ? 'block' : 'none';
      if (folderChatGPTGroup) folderChatGPTGroup.style.display = (currentPlatform === 'chatgpt') ? 'block' : 'none';
      
      // Meta Pipeline specific folders
      const folderMetaPipeVideoGroup = document.getElementById('folderMetaPipeVideoGroup');
      if (folderMetaPipeVideoGroup) folderMetaPipeVideoGroup.style.display = isMetaPipe ? 'block' : 'none';

      // Hide section completely if in Flow Pipeline tab (Flow has its own folder setting in its tab)
      modeFolderSection.style.display = (currentMode === 'pipeline' && document.getElementById('panel-flow-pipeline').classList.contains('active')) ? 'none' : 'block';
    }
  }

  // ─── Prompt Input ──────────────────────────────────────────
  function setupPromptInput() {
    const textarea = document.getElementById('promptInput');
    const vidTextarea = document.getElementById('videoPromptInput');

    textarea.addEventListener('input', () => {
      const counter = document.getElementById('promptCount');
      const lines = textarea.value.split('\n').filter(l => l.trim());
      counter.textContent = lines.length + ' prompt' + (lines.length !== 1 ? 's' : '');

      // Debounce preview rendering
      if (previewTimeout) clearTimeout(previewTimeout);
      previewTimeout = setTimeout(() => renderPreviewQueue(), 500);
    });

    if (vidTextarea) {
      vidTextarea.addEventListener('input', () => {
        const vidCounter = document.getElementById('videoPromptCount');
        if (vidCounter) {
          const lines = vidTextarea.value.split('\n').filter(l => l.trim());
          vidCounter.textContent = lines.length + ' prompt' + (lines.length !== 1 ? 's' : '');
        }
      });
    }

    document.getElementById('uploadPromptsBtn').addEventListener('click', () => {
      document.getElementById('promptFileInput').click();
    });

    document.getElementById('promptFileInput').addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const text = await readFile(file);
      textarea.value = (textarea.value ? textarea.value + '\n' : '') + text;
      textarea.dispatchEvent(new Event('input'));
    });

    const uploadVidBtn = document.getElementById('uploadVidPromptsBtn');
    const vidFileInput = document.getElementById('vidPromptFileInput');
    if (uploadVidBtn && vidFileInput) {
      uploadVidBtn.addEventListener('click', () => vidFileInput.click());
      vidFileInput.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const text = await readFile(file);
        vidTextarea.value = (vidTextarea.value ? vidTextarea.value + '\n' : '') + text;
        vidTextarea.dispatchEvent(new Event('input'));
      });
    }

    document.getElementById('refinePromptsBtn').addEventListener('click', () => {
      if (!window.PromptRefiner) return;
      const lines = textarea.value.split('\n');
      const refinedLines = lines.map(line => window.PromptRefiner.refine(line));
      textarea.value = refinedLines.join('\n');
      textarea.dispatchEvent(new Event('input'));
      showToast('Prompts refined and cleaned! ✨');
    });

    document.getElementById('clearPromptsBtn').addEventListener('click', async () => {
      textarea.value = '';
      textarea.dispatchEvent(new Event('input'));

      // Clear queue to fix the "restart error" (old session showing)
      await chrome.storage.local.set({
        meta_automator_queue: [],
        meta_automator_phase: null,
        meta_automator_queue_state: 'idle'
      });
      document.getElementById('queueList').innerHTML = '';
      showProgress(false);
      showToast('Image Prompts & Queue Cleared');

      // Stop any background execution
      await sendMessage({ type: 'STOP_QUEUE' });
      showToast('Image Prompts & Queue Cleared');
    });

    const clearVidBtn = document.getElementById('clearVidPromptsBtn');
    if (clearVidBtn) {
      clearVidBtn.addEventListener('click', () => {
        if (vidTextarea) {
          vidTextarea.value = '';
          vidTextarea.dispatchEvent(new Event('input'));
        }
        showToast('Video Prompts Cleared');
      });
    }
  }

  // ─── Context Image (removed from UI — no-op) ───────────────
  function setupContextImage() {
    // Context image upload was removed. Reference Images section now
    // serves as the character/environment sheet upload for all modes.
  }

  // ─── Reference Images ─────────────────────────────────────
  function setupReferenceImages() {
    const dropzone = document.getElementById('refDropzone');
    const fileInput = document.getElementById('refFileInput');

    document.getElementById('refBrowse').addEventListener('click', () => fileInput.click());

    dropzone.addEventListener('dragover', (e) => { e.preventDefault(); dropzone.classList.add('dragover'); });
    dropzone.addEventListener('dragleave', () => dropzone.classList.remove('dragover'));
    dropzone.addEventListener('drop', async (e) => {
      e.preventDefault();
      dropzone.classList.remove('dragover');
      await handleImageFiles(e.dataTransfer.files);
    });

    fileInput.addEventListener('change', async (e) => {
      await handleImageFiles(e.target.files);
      fileInput.value = ''; // allow re-uploading same file
    });

    async function handleImageFiles(files) {
      for (const file of files) {
        if (!file.type.startsWith('image/')) continue;
        const dataUrl = await readFileAsDataURL(file);
        // Resize reference images to max 2048px to preserve quality while keeping storage manageable
        const optimizedUrl = await resizeImageSidepanel(dataUrl, 2048);
        referenceImages.push({ name: file.name, dataUrl: optimizedUrl });
      }
      renderRefList();
      renderPreviewQueue();
    }
  }

  function renderRefList() {
    const refList = document.getElementById('refList');
    if (!refList) return;
    refList.innerHTML = '';

    referenceImages.forEach((img, idx) => {
      const wrapper = document.createElement('div');
      wrapper.className = 'sp-ref-thumb-wrap';
      wrapper.title = img.name;

      const imgEl = document.createElement('img');
      imgEl.src = img.dataUrl;
      imgEl.className = 'sp-ref-thumb';

      const removeBtn = document.createElement('button');
      removeBtn.className = 'sp-ref-remove-btn';
      removeBtn.textContent = '✕';
      removeBtn.title = 'Remove ' + img.name;
      removeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        referenceImages.splice(idx, 1);
        renderRefList();
        showToast('Image removed');
      });

      wrapper.appendChild(imgEl);
      wrapper.appendChild(removeBtn);
      refList.appendChild(wrapper);
    });
  }
  function setupResolutionAndConcurrency() {
    document.querySelectorAll('#resolutionSelector .sp-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        document.querySelectorAll('#resolutionSelector .sp-chip').forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
        currentAspectRatio = chip.dataset.res;
      });
    });

    document.querySelectorAll('#concurrencySelector .sp-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        document.querySelectorAll('#concurrencySelector .sp-chip').forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
        currentConcurrency = parseInt(chip.dataset.factor);
      });
    });
  }

  function setupDownloadFactor() {
    document.querySelectorAll('#downloadFactorSelector .sp-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        document.querySelectorAll('#downloadFactorSelector .sp-chip').forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
        currentDownloadFactor = parseInt(chip.dataset.factor);
      });
    });
  }

  function setupFlowSelectors() {
    // Flow Aspect Ratio
    document.querySelectorAll('#flpResolutionSelector .sp-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        document.querySelectorAll('#flpResolutionSelector .sp-chip').forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
      });
    });

    // Flow Concurrency
    document.querySelectorAll('#flpConcurrencySelector .sp-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        document.querySelectorAll('#flpConcurrencySelector .sp-chip').forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
      });
    });
  }

  // ─── Controls ──────────────────────────────────────────────
  function setupControls() {
    const startBtn = document.getElementById('startBtn');
    const pauseBtn = document.getElementById('pauseBtn');
    const stopBtn = document.getElementById('stopBtn');

    startBtn.addEventListener('click', async () => {
      const textarea = document.getElementById('promptInput');
      const lines = textarea.value.split('\n').filter(l => l.trim());
      const vidTextarea = document.getElementById('videoPromptInput');
      const vidLines = vidTextarea ? vidTextarea.value.split('\n').filter(l => l.trim()) : [];

      if (lines.length === 0) { showToast('Please enter at least one prompt'); return; }

      // Licensing Check
      if (!(await window.LicenseManager.canGenerate())) {
        showToast('Trial limit reached! Please upgrade to Premium.', 'error');
        document.getElementById('licensingTab').click();
        return;
      }

      const baseChars = document.getElementById('pipeCharsEnv').value.trim();
      const baseAtmo = document.getElementById('pipeAtmosphere').value.trim();
      const isContextEnabled = document.getElementById('contextEnabled').checked;
      const baseContext = isContextEnabled ? [baseChars, baseAtmo].filter(Boolean).join('. ') : '';

      // Build queue items
      let queueItems = [];
      let itemIdx = 0;

      for (let i = 0; i < lines.length; i++) {
        const text = lines[i];
        const vidText = vidLines[i] || text;

        // Apply Concurrency
        for (let c = 0; c < currentConcurrency; c++) {
          let item = {
            id: Date.now().toString(36) + itemIdx,
            status: 'pending',
            index: itemIdx,
            originalIndex: i,
            variation: c + 1
          };

          // Handle Resolution Phrasing
          const imgKeyword = `Create an image of aspect ratio ${currentAspectRatio}.`;
          const vidKeyword = `Create a video of aspect ratio ${currentAspectRatio}.`;

          // Construct Full Prompt with Story Context & Engineering
          let fullText = '';
          const isReferenced = currentInputMode !== 'text' && referenceImages.length > 0;

          // Use image keyword for fullText (Phase 1 / Image Mode)
          if (isReferenced) {
            // Edit/Modify instructions for reference-based generation
            fullText = `${imgKeyword} Modify the reference image based on this description: ${text}. ${baseContext}`;
          } else {
            // Standard generation
            fullText = `${imgKeyword} ${text}. ${baseContext}`;
          }

          // Attach Reference Image Indices
          if (referenceImages.length > 0) {
            if (currentInputMode === 'paired') {
              item.refIdx = referenceImages[i] ? i : null;
            } else {
              // Both 'Single' and 'Pipeline' now support up to 4 images from the sheet
              item.refIndices = [0, 1, 2, 3].slice(0, referenceImages.length);
            }
          }

          if (currentMode === 'pipeline') {
            item.text = fullText;
            item.imagePrompt = fullText;
            // Pipeline Phase 2 (Video): Use vidKeyword and remove "Animate" if present
            const cleanVidText = vidText.replace(/^animate\s+/i, '');
            item.videoPrompt = baseContext ? `${vidKeyword} ${cleanVidText}. ${baseContext}` : `${vidKeyword} ${cleanVidText}`;
            item.inputMode = 'pipeline';
            item.maxDownloads = currentDownloadFactor; // Now respects the selector
          } else if (currentMode === 'video') {
            // Video Mode: Use vidKeyword and remove "Animate" if present
            const cleanText = text.replace(/animate\s+/gi, '');
            if (isReferenced) {
              item.text = `${vidKeyword} Modify the reference image based on this description: ${cleanText}. ${baseContext}`;
            } else {
              item.text = baseContext ? `${vidKeyword} ${cleanText}. ${baseContext}` : `${vidKeyword} ${cleanText}`;
            }
            item.maxDownloads = currentDownloadFactor;
          } else {
            // Image Mode
            const cleanText = text.replace(/animate\s+/gi, '');
            item.text = baseContext ? `${imgKeyword} ${cleanText}. ${baseContext}` : `${imgKeyword} ${cleanText}`;
            item.maxDownloads = currentDownloadFactor;
          }

          queueItems.push(item);
          itemIdx++;
        }
      }

      await chrome.storage.local.set({
        meta_automator_queue: queueItems,
        meta_automator_ref_images: referenceImages.map(r => r.dataUrl), // Store images separately
        meta_automator_phase: currentMode === 'pipeline' ? 'image' : null
      });

      // Send to content script via background
      const response = await sendMessage({
        type: 'START_QUEUE',
        data: {
          mode: currentMode,
          inputMode: currentMode === 'pipeline' ? 'pipeline' : currentInputMode,
          phase: currentMode === 'pipeline' ? 'image' : null,
          tabTarget: currentMode === 'video' ? 'video' : 'image',
          platform: currentPlatform
        }
      });

      if (response && response.success) {
        // Record usage for trial/paid tracking
        await window.LicenseManager.recordGeneration();
        updateLicenseUI(); // Refresh counts

        startBtn.disabled = true;
        pauseBtn.disabled = false;
        stopBtn.disabled = false;
        showProgress(true, lines.length);
        showToast('Generation started! ' + lines.length + ' prompts queued');
      } else {
        showToast(response?.error || 'Failed to start. Is meta.ai open?', 'error');
      }
    });

    pauseBtn.addEventListener('click', async () => {
      const isPausedState = pauseBtn.classList.contains('sp-btn-resume');
      const action = isPausedState ? 'RESUME_QUEUE' : 'PAUSE_QUEUE';

      const r = await sendMessage({ type: action });
      if (r?.success) {
        if (isPausedState) {
          pauseBtn.textContent = '⏸ Pause';
          pauseBtn.classList.remove('sp-btn-resume');
        } else {
          pauseBtn.textContent = '▶ Resume';
          pauseBtn.classList.add('sp-btn-resume');
        }
      }
    });

    stopBtn.addEventListener('click', async () => {
      await sendMessage({ type: 'STOP_QUEUE' });
      resetControls();
      showToast('Generation stopped');
    });
  }

  function resetControls() {
    document.getElementById('startBtn').disabled = false;
    document.getElementById('pauseBtn').disabled = true;
    document.getElementById('stopBtn').disabled = true;
  }

  function showProgress(show, total) {
    const section = document.getElementById('progressSection');
    section.style.display = show ? 'block' : 'none';
    if (total) {
      document.getElementById('progressCount').textContent = '0/' + total;
      document.getElementById('progressBar').style.width = '0%';
    }
  }

  // ─── Interactive Queue UI ───────────────────────────────────────
  async function renderQueueList(status) {
    const r = await chrome.storage.local.get(['meta_automator_queue', 'meta_automator_phase']);
    const queue = r.meta_automator_queue || [];
    const phase = r.meta_automator_phase;
    const listEl = document.getElementById('queueList');

    // Check if we need a full re-render or just status updates
    // For simplicity, we re-render but preserve focus if possible (only block if editing textarea)
    const activeEl = document.activeElement;
    const activeId = activeEl && activeEl.tagName === 'TEXTAREA' ? activeEl.dataset.id : null;

    let html = '';
    queue.forEach((item, idx) => {
      // Determine what text to show/edit
      let displayText = item.text;
      if (currentMode === 'pipeline') {
        displayText = phase === 'video' ? item.videoPrompt : item.imagePrompt;
      }

      let imgHtml = '';
      if (currentPlatform === 'meta' && (item.capturedImages?.length > 0 || item.capturedImage)) {
        const capturedImages = item.capturedImages || (item.capturedImage ? [item.capturedImage] : []);
        const isPipelineSelection = currentMode === 'pipeline' && phase === 'image';

        if (capturedImages.length > 1) {
          // 2x2 Grid
          let gridHtml = '';
          capturedImages.slice(0, 4).forEach((src, vIdx) => {
            const isSelected = isPipelineSelection && (item.selectedVariation === vIdx || (!item.selectedVariation && vIdx === 0));
            // Only add 'selected' and 'selectable' classes if in Pipeline Phase 1
            const classes = ['sp-variation-thumb'];
            if (isPipelineSelection) {
              classes.push('selectable');
              if (isSelected) classes.push('selected');
            }
            gridHtml += `<img src="${src}" class="${classes.join(' ')}" data-id="${item.id}" data-v-idx="${vIdx}">`;
          });
          imgHtml = `<div class="sp-variation-grid">${gridHtml}</div>`;
        } else {
          // ... single image ...
          // Use thumbnail if available to keep the UI snappy, fallback to capturedImage
          const imgSrc = item.thumbnail || item.capturedImage || '';
          const imgStyle = imgSrc ? `background-image: url(${imgSrc}); background-size: cover;` : '';
          imgHtml = `
            <div class="sp-queue-img-drop" data-id="${item.id}" style="${imgStyle}">
              <input type="file" class="sp-queue-img-input" data-id="${item.id}" accept="image/*" style="display:none;">
            </div>
          `;
        }
      }

      // Check if it failed but we actually have captured content
      const hasImages = (item.capturedImages && item.capturedImages.length > 0) || item.capturedImage;
      let statusIcon = '⏳';
      let statusClass = item.status;
      let statusText = item.status;
      
      if (item.status === 'completed' || (item.status === 'failed' && hasImages)) {
        statusIcon = '✅';
        statusClass = 'completed';
        statusText = 'completed';
      } else if (item.status === 'failed') {
        statusIcon = '⚠️';
        statusText = 'Failed / Flagged';
      } else if (item.status === 'processing') {
        statusIcon = '⚡';
      }

      html += `
        <div class="sp-queue-item" data-id="${item.id}">
          <div class="sp-queue-header">
            <span class="sp-queue-status ${statusClass}">${statusIcon} ${statusText}</span>
            <div class="sp-queue-actions-btn">
              ${(item.status === 'failed' || item.status === 'completed') ? `<button class="sp-queue-icon-btn" data-action="retry-item" data-id="${item.id}" title="Retry this item" style="background:rgba(99,102,241,0.18);color:#818cf8;border:1px solid #4f46e5;border-radius:6px;padding:2px 8px;cursor:pointer;font-size:11px;margin-right:4px;">🔄 Retry</button>` : ''}
              <button class="sp-queue-icon-btn delete" data-action="delete" data-id="${item.id}" title="Delete Item">❌</button>
            </div>
          </div>
          <div style="display: flex; gap: 8px;">
            ${imgHtml}
            <textarea class="sp-queue-text" data-id="${item.id}" rows="2" style="flex:1; ${item.status === 'failed' ? 'border: 1px dashed var(--red);' : ''}" ${item.status === 'processing' ? 'disabled' : ''}>${displayText}</textarea>
          </div>
        </div>
      `;
    });

    // Performance optimization: Force re-render if queue length or image count changes
    const queueStateStr = queue.map(q => q.id + q.status + (q.capturedImages?.length || 0) + (q.capturedImage ? 'y' : 'n') + (q.selectedVariation || '')).join('|');
    const renderState = queueStateStr + phase + currentMode;
    if (renderState === lastRenderedState && !activeId) return;
    lastRenderedState = renderState;

    listEl.innerHTML = html;
    attachQueueListeners();

    // Update labels and action buttons
    const actionsEl = document.getElementById('queueActions');
    const labelEl = document.getElementById('progressLabel');

    if (currentMode === 'pipeline') {
      labelEl.textContent = phase === 'video' ? '🎬 Phase 2: Video' : '🖼️ Phase 1: Image';
      actionsEl.style.display = 'flex';

      // If idle and not all failed, show Phase 2 button
      const allDone = queue.every(q => q.status === 'completed' || q.status === 'failed');
      if (status.queueState === 'idle' && phase === 'image' && allDone) {
        document.getElementById('queuePhase2Btn').style.display = 'block';
      } else {
        document.getElementById('queuePhase2Btn').style.display = 'none';
      }
    } else {
      labelEl.textContent = 'Processing...';
      actionsEl.style.display = status.queueState === 'idle' && queue.length > 0 ? 'flex' : 'none';
      document.getElementById('queuePhase2Btn').style.display = 'none';
    }
  }

  // ─── Preview Queue ──────────────────────────────────────────
  function renderPreviewQueue() {
    const textarea = document.getElementById('promptInput');
    if (!textarea) return;

    // Only show preview if NOT currently running a queue
    chrome.storage.local.get(['meta_automator_queue_state'], (r) => {
      if (r.meta_automator_queue_state === 'running' || r.meta_automator_queue_state === 'paused') return;

      const lines = textarea.value.split('\n').filter(l => l.trim());
      if (lines.length === 0) {
        document.getElementById('queueList').innerHTML = '';
        showProgress(false);
        return;
      }

      showProgress(true, lines.length);
      document.getElementById('progressLabel').textContent = 'Queue Preview (Verify Alignment)';
      document.getElementById('progressCount').textContent = `0/${lines.length}`;
      document.getElementById('progressBar').style.width = '0%';

      const previewLimit = 50;
      const displayLines = lines.slice(0, previewLimit);
      let html = '';

      displayLines.forEach((text, i) => {
        let refImg = null;
        if (currentInputMode === 'paired') {
          refImg = referenceImages[i] ? referenceImages[i].dataUrl : null;
        } else if (currentInputMode === 'single') {
          refImg = referenceImages.length > 0 ? referenceImages[0].dataUrl : null;
        } else if (currentInputMode === 'multi') {
          refImg = referenceImages.length > 0 ? referenceImages[0].dataUrl : null; // Show first as proxy
        }

        const imgHtml = refImg ? `<img src="${refImg}" class="sp-queue-preview-thumb">` : '<div class="sp-queue-preview-thumb empty">No Img</div>';

        html += `
          <div class="sp-queue-item preview">
            <div class="sp-queue-header">
              <span class="sp-queue-status pending">⏳ Ready</span>
              <span class="sp-queue-index">#${i + 1}</span>
            </div>
            <div style="display: flex; gap: 10px; align-items: center;">
              ${imgHtml}
              <div class="sp-queue-text-preview">${text}</div>
            </div>
          </div>
        `;
      });

      if (lines.length > previewLimit) {
        html += `<div class="sp-hint" style="text-align:center; padding:10px;">... and ${lines.length - previewLimit} more items</div>`;
      }
      document.getElementById('queueList').innerHTML = html;
    });
  }

  function attachQueueListeners() {
    // Delete buttons
    document.querySelectorAll('.sp-queue-icon-btn.delete').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.currentTarget.blur(); // Ensure it doesn't block re-render
        const id = e.currentTarget.dataset.id;
        const r = await chrome.storage.local.get('meta_automator_queue');
        let queue = r.meta_automator_queue || [];
        queue = queue.filter(q => q.id !== id);
        await chrome.storage.local.set({ meta_automator_queue: queue });

        // Optimistically remove from DOM immediately
        const itemEl = document.querySelector(`.sp-queue-item[data-id="${id}"]`);
        if (itemEl) itemEl.remove();

        showToast('Item removed from queue');
      });
    });

    // Inline Edits
    document.querySelectorAll('.sp-queue-text').forEach(textarea => {
      textarea.addEventListener('change', async (e) => {
        const id = e.currentTarget.dataset.id;
        const newText = e.currentTarget.value;
        const r = await chrome.storage.local.get(['meta_automator_queue', 'meta_automator_phase']);
        let queue = r.meta_automator_queue || [];
        const phase = r.meta_automator_phase;

        const item = queue.find(q => q.id === id);
        if (item) {
          if (currentMode === 'pipeline') {
            if (phase === 'video') item.videoPrompt = newText;
            else item.imagePrompt = newText;
          } else {
            item.text = newText;
          }
          await chrome.storage.local.set({ meta_automator_queue: queue });
        }
      });
    });

    // Per-item Retry button
    document.querySelectorAll('[data-action="retry-item"]').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const id = e.currentTarget.dataset.id;
        const r = await chrome.storage.local.get(['meta_automator_queue', 'meta_automator_phase']);
        let queue = r.meta_automator_queue || [];
        const item = queue.find(q => q.id === id);
        if (item && (item.status === 'failed' || item.status === 'completed')) {
          item.status = 'pending';
          item.isRefined = false; // Allow auto-fix again
          await chrome.storage.local.set({ meta_automator_queue: queue });
          showToast('Item queued for retry!');

          // Auto-start queue if it's currently idle
          const status = await sendMessage({ type: 'GET_STATUS' });
          if (status && status.queueState === 'idle') {
            const phase = (currentMode === 'pipeline') ? r.meta_automator_phase : null;
            await sendMessage({
              type: 'START_QUEUE',
              data: {
                mode: currentMode,
                inputMode: currentMode === 'pipeline' ? 'pipeline' : currentInputMode,
                phase: phase,
                tabTarget: (currentMode === 'video' || (currentMode === 'pipeline' && phase === 'video')) ? 'video' : 'image',
                platform: currentPlatform
              }
            });
          }

          // Force refresh UI status
          const nextStatus = await sendMessage({ type: 'GET_STATUS' });
          if (nextStatus) updateStatusUI(nextStatus);
        }
      });
    });

    // Queue Image Overrides
    document.querySelectorAll('.sp-queue-img-drop').forEach(dropzone => {
      const id = dropzone.dataset.id;
      const input = dropzone.querySelector('input');

      dropzone.addEventListener('click', () => input.click());

      dropzone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropzone.style.borderColor = 'var(--accent)';
      });
      dropzone.addEventListener('dragleave', () => {
        dropzone.style.borderColor = 'rgba(255, 255, 255, 0.1)';
      });

      dropzone.addEventListener('drop', async (e) => {
        e.preventDefault();
        dropzone.style.borderColor = 'rgba(255, 255, 255, 0.1)';
        const file = e.dataTransfer.files[0];
        if (file && file.type.startsWith('image/')) {
          await handleQueueImageOverride(id, file);
        }
      });

      input.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (file) {
          await handleQueueImageOverride(id, file);
        }
      });
    });

    // Variation selection
    document.querySelectorAll('.sp-variation-thumb.selectable').forEach(thumb => {
      thumb.addEventListener('click', async () => {
        const id = thumb.dataset.id;
        const vIdx = parseInt(thumb.dataset.vIdx);
        const r = await chrome.storage.local.get('meta_automator_queue');
        let queue = r.meta_automator_queue || [];
        const item = queue.find(q => q.id === id);
        if (item && (item.capturedImages || item.fullResImages)) {
          item.selectedVariation = vIdx;
          // Update both full res and thumbnail for the selection
          if (item.fullResImages) item.capturedImage = item.fullResImages[vIdx];
          else if (item.capturedImages) item.capturedImage = item.capturedImages[vIdx];

          if (item.capturedImages) item.thumbnail = item.capturedImages[vIdx];

          await chrome.storage.local.set({ meta_automator_queue: queue });
          // Manual re-render to show selection immediately
          thumb.parentElement.querySelectorAll('.sp-variation-thumb').forEach(t => t.classList.remove('selected'));
          thumb.classList.add('selected');
          showToast('Variation selected for Video Phase');
        }
      });
    });
  }

  async function handleQueueImageOverride(id, file) {
    const dataUrl = await readFileAsDataURL(file);
    const r = await chrome.storage.local.get('meta_automator_queue');
    let queue = r.meta_automator_queue || [];
    const item = queue.find(q => q.id === id);
    if (item) {
      item.capturedImage = dataUrl;
      await chrome.storage.local.set({ meta_automator_queue: queue });
      showToast('Image successfully overridden!');
    }
  }

  // Action Buttons
  const queueRegenerateBtn = document.getElementById('queueRegenerateBtn');
  if (queueRegenerateBtn) {
    queueRegenerateBtn.addEventListener('click', async () => {
      const r = await chrome.storage.local.get(['meta_automator_queue', 'meta_automator_phase']);
      let queue = r.meta_automator_queue || [];
      let toRetry = 0;
      const isAutoFixOn = isChecked('autoFixToggle');

      queue.forEach(q => {
        // Only retry failed/pending items, never touch completed or processing
        if (q.status === 'failed' || q.status === 'pending') {
          q.status = 'pending';
          q.isRefined = false; // Allow auto-fix to run again
          toRetry++;

          // If Auto-Fix is ON, refine the prompts before retrying
          if (isAutoFixOn && window.PromptRefiner) {
            q.isRefined = true;
            if (currentMode === 'pipeline') {
              if (r.meta_automator_phase === 'video') {
                q.videoPrompt = window.PromptRefiner.refine(q.videoPrompt || q.text);
                q.text = q.videoPrompt;
              } else {
                q.imagePrompt = window.PromptRefiner.refine(q.imagePrompt || q.text);
                q.videoPrompt = window.PromptRefiner.refine(q.videoPrompt);
                q.text = q.imagePrompt;
              }
            } else {
              q.text = window.PromptRefiner.refine(q.text);
            }
          }
        }
      });

      if (toRetry > 0) {
        await chrome.storage.local.set({ meta_automator_queue: queue });
        showToast(`Retrying ${toRetry} failed prompts!`);
        
        // Auto-start queue if it's currently idle
        const status = await sendMessage({ type: 'GET_STATUS' });
        if (status && status.queueState === 'idle') {
          await sendMessage({
            type: 'START_QUEUE',
            data: {
              mode: currentMode,
              inputMode: currentMode === 'pipeline' ? 'pipeline' : currentInputMode,
              phase: currentMode === 'pipeline' ? r.meta_automator_phase : null,
              tabTarget: (currentMode === 'video' || (currentMode === 'pipeline' && r.meta_automator_phase === 'video')) ? 'video' : 'image',
              platform: currentPlatform
            }
          });
        }
        
        // Force refresh UI status
        const nextStatus = await sendMessage({ type: 'GET_STATUS' });
        if (nextStatus) updateStatusUI(nextStatus);
      } else {
        showToast('No failed or pending items to retry.');
      }
    });
  }

  // Clean Queue Button
  const queueCleanBtn = document.getElementById('queueCleanBtn');
  if (queueCleanBtn) {
    queueCleanBtn.addEventListener('click', async () => {
      const r = await chrome.storage.local.get(['meta_automator_queue', 'meta_automator_phase']);
      let queue = r.meta_automator_queue || [];
      const initialCount = queue.length;
      
      // Filter out completed and failed items, leaving only pending/processing
      queue = queue.filter(q => q.status !== 'completed' && q.status !== 'failed');
      
      await chrome.storage.local.set({ meta_automator_queue: queue });
      const removed = initialCount - queue.length;
      showToast(`Cleaned ${removed} finished items from queue.`);
      
      // Force refresh UI status
      const nextStatus = await sendMessage({ type: 'GET_STATUS' });
      if (nextStatus) updateStatusUI(nextStatus);
      else renderQueueList({ queueState: 'idle' });
    });
  }

  const queuePhase2Btn = document.getElementById('queuePhase2Btn');
  if (queuePhase2Btn) {
    queuePhase2Btn.addEventListener('click', async () => {
      const r = await chrome.storage.local.get('meta_automator_queue');
      let oldQueue = r.meta_automator_queue || [];
      let newQueue = [];

      // Expand each item's variations into separate video tasks
      oldQueue.forEach(item => {
        // Use full resolution images if available, otherwise fallback to capturedImages/capturedImage
        let fullVariations = item.fullResImages || (item.capturedImage ? [item.capturedImage] : []);
        let thumbVariations = item.capturedImages || (item.thumbnail ? [item.thumbnail] : []);

        // If user selected "1 (Best)" but manually picked a different variation, use that
        if (currentDownloadFactor === 1 && typeof item.selectedVariation === 'number') {
          const vIdx = item.selectedVariation;
          if (fullVariations[vIdx]) fullVariations = [fullVariations[vIdx]];
          if (thumbVariations[vIdx]) thumbVariations = [thumbVariations[vIdx]];
        } else {
          // Otherwise limit variations based on the current download factor (chip selection)
          fullVariations = fullVariations.slice(0, currentDownloadFactor);
          thumbVariations = thumbVariations.slice(0, currentDownloadFactor);
        }

        fullVariations.forEach((fullImg, vIdx) => {
          const thumbImg = thumbVariations[vIdx] || fullImg;
          newQueue.push({
            id: item.id + '_v' + vIdx,
            status: 'pending',
            index: newQueue.length,
            originalIndex: item.originalIndex,
            variation: vIdx + 1,
            text: item.videoPrompt,
            videoPrompt: item.videoPrompt,
            capturedImage: fullImg, // High quality for processing
            thumbnail: thumbImg, // Thumbnail for UI display
            inputMode: 'pipeline',
            mode: 'pipeline',
            maxDownloads: 1 // Each individual video task downloads its own result
          });
        });
      });

      if (newQueue.length === 0) {
        showToast('No images captured from Phase 1!', 'error');
        return;
      }

      await chrome.storage.local.set({
        meta_automator_queue: newQueue,
        meta_automator_phase: 'video'
      });

      // Send to content script to run Phase 2
      await sendMessage({
        type: 'START_QUEUE',
        data: {
          mode: 'pipeline',
          inputMode: 'pipeline',
          phase: 'video',
          tabTarget: 'video'
        }
      });
      showToast(`Starting Video Phase for ${newQueue.length} variations! 🎬`);
    });
  }



  // ─── Settings UI ───────────────────────────────────────────
  function setupSettingsUI() {
    // Range sliders
    setupRange('minDelay', 'minDelayVal', v => (v / 1000) + 's');
    setupRange('maxDelay', 'maxDelayVal', v => (v / 1000) + 's');
    setupRange('typingSpeed', 'typingVal', v => v + 'ms');

    // Save
    document.getElementById('saveSettingsBtn').addEventListener('click', saveCurrentSettings);

    // Clear Cache
    const clearCacheBtn = document.getElementById('clearCacheBtn');
    if (clearCacheBtn) {
      clearCacheBtn.addEventListener('click', async () => {
        await sendMessage({ type: 'CLEAR_CACHE' });
        showToast('Browser cache cleared!');
      });
    }

    // Reset Storage
    const resetStorageBtn = document.getElementById('resetStorageBtn');
    if (resetStorageBtn) {
      resetStorageBtn.addEventListener('click', async () => {
        if (!confirm('Are you sure you want to clear the entire queue and all captured images? This cannot be undone.')) return;
        await chrome.storage.local.set({
          meta_automator_queue: [],
          meta_automator_downloads: [],
          meta_automator_queue_state: 'idle'
        });
        showToast('Queue and storage reset!');
        setTimeout(() => location.reload(), 500);
      });
    }

    // Restart Extension
    const restartBtn = document.getElementById('restartExtensionBtn');
    if (restartBtn) {
      restartBtn.addEventListener('click', () => {
        showToast('Restarting extension...');
        setTimeout(() => {
          chrome.runtime.reload();
        }, 500);
      });
    }
  }

  function setupRange(inputId, labelId, formatter) {
    const input = document.getElementById(inputId);
    const label = document.getElementById(labelId);
    if (!input || !label) return;
    input.addEventListener('input', () => { label.textContent = formatter(parseInt(input.value)); });
  }

  async function loadSettings() {
    const r = await sendMessage({ type: 'GET_SETTINGS' });
    currentSettings = r?.settings || {};
    applySettingsToUI();
  }

  function applySettingsToUI() {
    const s = currentSettings;
    setChecked('stealthToggle', s.stealthMode !== false);
    setChecked('autoDownloadToggle', s.autoDownload !== false);
    setChecked('autoFixToggle', s.autoFix !== false);
    setChecked('cacheToggle', s.autoCacheClear !== false);
    setValue('minDelay', s.minDelay || 3000);
    setValue('maxDelay', s.maxDelay || 7000);
    setValue('typingSpeed', s.typingSpeed || 50);

    setValue('folderMetaImage', s.folderMetaImage || 'Meta_Images');
    setValue('folderMetaVideo', s.folderMetaVideo || 'Meta_Videos');
    setValue('folderGemini', s.folderGemini || 'Gemini_Images');
    setValue('folderChatGPT', s.folderChatGPT || 'ChatGPT_Images');
    setValue('folderPipeline', s.folderPipeline || 'Pipeline_Final');

    setValue('imageFormat', s.imageFormat || 'png');
    setValue('cacheClearInterval', s.cacheClearInterval || 50);
    setValue('genTimeout', (s.generationTimeout || 120000) / 1000);

    // Custom fields
    setValue('pipeCharsEnv', s.storyContextCharacters || '');
    setValue('pipeAtmosphere', s.storyContextAtmosphere || '');

    currentAspectRatio = s.aspectRatio || '1:1';
    document.querySelectorAll('#resolutionSelector .sp-chip').forEach(c => {
      c.classList.toggle('active', c.dataset.res === currentAspectRatio);
    });

    currentConcurrency = s.concurrencyFactor || 1;
    document.querySelectorAll('#concurrencySelector .sp-chip').forEach(c => {
      c.classList.toggle('active', parseInt(c.dataset.factor) === currentConcurrency);
    });

    // Update labels
    const minLabel = document.getElementById('minDelayVal');
    if (minLabel) minLabel.textContent = ((s.minDelay || 3000) / 1000) + 's';
    const maxLabel = document.getElementById('maxDelayVal');
    if (maxLabel) maxLabel.textContent = ((s.maxDelay || 7000) / 1000) + 's';
    const typeLabel = document.getElementById('typingVal');
    if (typeLabel) typeLabel.textContent = (s.typingSpeed || 50) + 'ms';
  }

  async function saveCurrentSettings() {
    const settings = {
      stealthMode: isChecked('stealthToggle'),
      autoDownload: isChecked('autoDownloadToggle'),
      autoFix: isChecked('autoFixToggle'),
      autoCacheClear: isChecked('cacheToggle'),
      minDelay: intVal('minDelay'),
      maxDelay: intVal('maxDelay'),
      typingSpeed: intVal('typingSpeed'),

      folderMetaImage: strVal('folderMetaImage') || 'Meta_Images',
      folderMetaVideo: strVal('folderMetaVideo') || 'Meta_Videos',
      folderGemini: strVal('folderGemini') || 'Gemini_Images',
      folderChatGPT: strVal('folderChatGPT') || 'ChatGPT_Images',
      folderMetaPipeVideo: strVal('folderMetaPipeVideo') || 'Meta_Pipe_Videos',
      folderPipeline: strVal('flpVideoFolder') || 'Pipeline_Final',

      imageFormat: strVal('imageFormat') || 'png',
      cacheClearInterval: intVal('cacheClearInterval'),
      generationTimeout: intVal('genTimeout') * 1000,
      generationMode: currentMode,
      inputMode: currentInputMode,
      storyContextCharacters: strVal('pipeCharsEnv'),
      storyContextAtmosphere: strVal('pipeAtmosphere'),
      aspectRatio: currentAspectRatio,
      concurrencyFactor: currentConcurrency
    };
    await sendMessage({ type: 'UPDATE_SETTINGS', data: settings });
    currentSettings = settings;
    showToast('Settings saved!');
  }

  // ─── Status Polling ────────────────────────────────────────
  // ─── Status Polling ────────────────────────────────────────
  function startStatusPolling() {
    statusInterval = setInterval(async () => {
      // Get state from background
      const r = await sendMessage({ type: 'GET_STATUS' });
      if (!r?.success) return;

      // Get latest queue directly from storage for real-time accuracy
      const storage = await chrome.storage.local.get(['meta_automator_queue', 'meta_automator_phase']);
      const queue = storage.meta_automator_queue || [];

      // Calculate counts locally
      const completed = queue.filter(p => p.status === 'completed').length;
      const failed = queue.filter(p => p.status === 'failed').length;
      const processing = queue.filter(p => p.status === 'processing').length;
      const pending = queue.filter(p => p.status === 'pending').length;

      const fullStatus = {
        ...r,
        queueLength: queue.length,
        completed,
        failed,
        pending,
        processing
      };

      updateStatusUI(fullStatus);
    }, 2000);
  }

  function updateStatusUI(status) {
    // console.log('[OmniAutomator] Status Update:', status);
    const dot = document.getElementById('statusDot');
    if (!dot) return;
    dot.className = 'sp-status-dot';
    if (status.queueState === 'running') dot.classList.add('running');
    else if (status.queueState === 'paused') dot.classList.add('paused');

    if (status.queueLength > 0) {
      showProgress(true, status.queueLength);
      const done = status.completed || 0;
      const total = status.queueLength;
      document.getElementById('progressCount').textContent = done + '/' + total;
      document.getElementById('progressBar').style.width = (total > 0 ? (done / total) * 100 : 0) + '%';
      document.getElementById('statCompleted').textContent = '✅ ' + (status.completed || 0);
      document.getElementById('statFailed').textContent = '❌ ' + (status.failed || 0);
      document.getElementById('statPending').textContent = '⏳ ' + ((status.pending || 0) + (status.processing || 0));

      if (status.queueState === 'idle' && done + (status.failed || 0) >= total) {
        resetControls();
        if (currentMode !== 'pipeline') {
          document.getElementById('progressLabel').textContent = 'Complete!';
        }
      }

      // Render the interactive queue list
      renderQueueList(status);
    } else {
      showProgress(false);
      document.getElementById('queueList').innerHTML = '';
    }
  }

  // ─── Helpers ───────────────────────────────────────────────
  function sendMessage(msg) {
    return new Promise(resolve => {
      try {
        chrome.runtime.sendMessage(msg, r => {
          if (chrome.runtime.lastError) {
            const err = chrome.runtime.lastError.message;
            if (err.includes('Receiving end does not exist')) {
              console.warn('[Sidepanel] Connection issue (likely tab not ready):', err);
              resolve({ success: false, error: 'Connection lost. Please refresh the AI tab (Meta AI/Gemini) and try again.' });
            } else {
              resolve({ success: false, error: err });
            }
          } else {
            resolve(r);
          }
        });
      } catch (e) {
        resolve({ success: false, error: e.message });
      }
    });
  }

  async function getDownloads() {
    const r = await chrome.storage.local.get('meta_automator_downloads');
    return r.meta_automator_downloads || [];
  }

  function readFile(file) {
    return new Promise((res, rej) => {
      const r = new FileReader();
      r.onload = () => res(r.result);
      r.onerror = () => rej(r.error);
      r.readAsText(file);
    });
  }

  async function resizeImageSidepanel(dataUrl, maxDim) {
    return new Promise((res) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let w = img.width; let h = img.height;
        if (w > h) { if (w > maxDim) { h *= maxDim / w; w = maxDim; } }
        else { if (h > maxDim) { w *= maxDim / h; h = maxDim; } }
        canvas.width = w; canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, w, h);
        res(canvas.toDataURL('image/jpeg', 0.7));
      };
      img.onerror = () => res(dataUrl);
      img.src = dataUrl;
    });
  }

  function readFileAsDataURL(file) {
    return new Promise((res, rej) => {
      const r = new FileReader();
      r.onload = () => res(r.result);
      r.onerror = () => rej(r.error);
      r.readAsDataURL(file);
    });
  }

  function exportCSV(downloads) {
    const h = ['Index', 'Prompt', 'Mode', 'Filename', 'Timestamp'];
    const rows = downloads.map((d, i) =>
      [i + 1, '"' + (d.prompt || '').replace(/"/g, '""') + '"', d.mode || 'image', d.filename || '', d.timestamp || ''].join(',')
    );
    return [h.join(','), ...rows].join('\n');
  }

  function downloadString(content, filename) {
    const blob = new Blob([content], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  function formatTime(ts) {
    if (!ts) return '';
    const d = new Date(ts);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  function setChecked(id, val) { const el = document.getElementById(id); if (el) el.checked = val; }
  function isChecked(id) { return document.getElementById(id)?.checked || false; }
  function setValue(id, val) { const el = document.getElementById(id); if (el) el.value = val; }
  function strVal(id) { return document.getElementById(id)?.value || ''; }
  function intVal(id) { return parseInt(document.getElementById(id)?.value || '0', 10); }

  function showToast(msg, type = 'success') {
    const existing = document.querySelector('.sp-toast');
    if (existing) existing.remove();
    const toast = document.createElement('div');
    toast.className = 'sp-toast sp-toast-' + type;
    toast.textContent = msg;
    toast.style.cssText = 'position:fixed;bottom:60px;left:50%;transform:translateX(-50%);padding:8px 16px;border-radius:8px;font-size:12px;font-weight:500;z-index:9999;animation:sp-fade-in 0.3s ease;' +
      (type === 'error' ? 'background:rgba(239,68,68,0.9);color:white;' : 'background:rgba(139,92,246,0.9);color:white;');
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
  }

  // ═══════════════════════════════════════════════════════════════
  // ─── FLOW PIPELINE TAB — sidepanel side ────────────────────────
  // All download watching happens in the service worker (service-worker.js).
  // This code only handles UI: sends FLP_START/FLP_STOP to SW,
  // receives FLP_EVENT messages back, updates the UI accordingly.
  // ═══════════════════════════════════════════════════════════════

  const flpUI = {
    imagesReceived: 0,
    videosQueued:   0,
    videosDone:     0,
    videosFailed:   0,
    totalPrompts:   0,
    watching:       false,
  };

  // ─── Setup (called on DOMContentLoaded) ────────────────────────
  function setupFlowPipeline() {

    // Prompt counter
    const ta = document.getElementById('flpVideoPrompts');
    ta.addEventListener('input', () => {
      const n = ta.value.split('\n').filter(l => l.trim()).length;
      document.getElementById('flpVidCount').textContent = n + ' prompt' + (n !== 1 ? 's' : '');
    });

    // Upload TXT
    document.getElementById('flpUploadBtn').addEventListener('click', () => {
      document.getElementById('flpFileInput').click();
    });
    document.getElementById('flpFileInput').addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const text = await readFile(file);
      ta.value = (ta.value ? ta.value + '\n' : '') + text.trim();
      ta.dispatchEvent(new Event('input'));
      e.target.value = '';
    });

    // Clear prompts
    document.getElementById('flpClearPromptsBtn').addEventListener('click', () => {
      ta.value = '';
      ta.dispatchEvent(new Event('input'));
    });

    // Context toggle
    document.getElementById('flpContextEnabled').addEventListener('change', (e) => {
      document.getElementById('flpContextFields').style.display = e.target.checked ? 'block' : 'none';
    });

    // Start
    document.getElementById('flpStartBtn').addEventListener('click', flpStart);

    // Stop
    document.getElementById('flpStopBtn').addEventListener('click', flpStop);

    // FLP Regenerate
    const flpRegenerateBtn = document.getElementById('flpRegenerateBtn');
    if (flpRegenerateBtn) {
      flpRegenerateBtn.addEventListener('click', async () => {
        const r = await chrome.storage.local.get('meta_automator_queue');
        let queue = r.meta_automator_queue || [];
        let count = 0;
        const isAutoFixOn = isChecked('autoFixToggle');

        queue.forEach(q => {
          if (q.status === 'failed') {
            q.status = 'pending';
            count++;

            // Use PromptRefiner if enabled
            if (isAutoFixOn && window.PromptRefiner) {
              q.videoPrompt = window.PromptRefiner.refine(q.videoPrompt);
              q.text = q.videoPrompt;
              q.isRefined = true;
            }
          }
        });

        if (count > 0) {
          await chrome.storage.local.set({ meta_automator_queue: queue });
          // Start the queue if not running
          await sendMessage({
            type: 'START_QUEUE',
            data: { 
              inputMode: 'pipeline', 
              mode: 'pipeline', // Changed from 'video' to 'pipeline' to match FLP logic
              phase: 'video', 
              tabTarget: 'video' 
            }
          });
          showToast(`Retrying ${count} failed items in Flow Pipeline...`);
        }
      });
    }

    // FLP Clean Queue
    const flpCleanBtn = document.getElementById('flpCleanBtn');
    if (flpCleanBtn) {
      flpCleanBtn.addEventListener('click', async () => {
        const r = await chrome.storage.local.get('meta_automator_queue');
        let queue = r.meta_automator_queue || [];
        const initialCount = queue.length;
        
        // Remove flow pipeline items that are completed or failed, keep others
        queue = queue.filter(q => {
          if (q.id && q.id.startsWith('flp_')) {
            return q.status !== 'completed' && q.status !== 'failed';
          }
          return true; // Keep non-flp items
        });
        
        await chrome.storage.local.set({ meta_automator_queue: queue });
        const removed = initialCount - queue.length;
        showToast(`Cleaned ${removed} finished items from Flow Pipeline queue.`);
        
        // Update counts
        flpUI.videosDone = 0;
        flpUI.videosFailed = 0;
        flpRenderQueueFromStorage();
      });
    }

    // Clear log
    document.getElementById('flpClearLogBtn').addEventListener('click', () => {
      document.getElementById('flpLog').innerHTML = '';
    });

    // Listen for FLP_EVENT messages from service worker
    chrome.runtime.onMessage.addListener((msg) => {
      if (msg.type !== 'FLP_EVENT') return;
      flpHandleEvent(msg.data);
    });

    // Restore UI state if SW says pipeline was already active
    chrome.storage.local.get('flp_config', (r) => {
      if (r.flp_config?.active) {
        flpUI.watching = true;
        flpSetWatchingUI(true);
        flpLog('Restored — pipeline was already running', 'info');
        // Sync counts from queue storage
        chrome.storage.local.get('meta_automator_queue', (qr) => {
          const q = (qr.meta_automator_queue || []).filter(i => i.id?.startsWith('flp_'));
          flpUI.videosQueued  = q.length;
          flpUI.videosDone    = q.filter(i => i.status === 'completed').length;
          flpUI.videosFailed  = q.filter(i => i.status === 'failed').length;
          flpUI.totalPrompts  = r.flp_config.videoPrompts?.length || 0;
          flpUpdateProgress();
          flpRenderQueueFromStorage();
        });
      }
    });
  }

  // ─── Start ──────────────────────────────────────────────────────
  async function flpStart() {
    const ta = document.getElementById('flpVideoPrompts');
    const videoPrompts = ta.value.split('\n').filter(l => l.trim());
    if (videoPrompts.length === 0) {
      showToast('Enter at least one video prompt first', 'error');
      return;
    }

    const contextEnabled = document.getElementById('flpContextEnabled').checked;
    const chars = document.getElementById('flpCharsEnv').value.trim();
    const atmo  = document.getElementById('flpAtmosphere').value.trim();
    const contextStr = contextEnabled ? [chars, atmo].filter(Boolean).join('. ') : '';

    const config = {
      videoPrompts,
      contextStr,
      aspectRatio: document.querySelector('#flpResolutionSelector .sp-chip.active').dataset.res,
      concurrency: parseInt(document.querySelector('#flpConcurrencySelector .sp-chip.active').dataset.factor),
      folderMarker: document.getElementById('flpFolderMarker').value.trim() || 'pipeline_images',
      videoFolder:  document.getElementById('flpVideoFolder').value.trim()  || 'pipeline_videos',
    };

    // Reset UI counters
    flpUI.imagesReceived = 0;
    flpUI.videosQueued   = 0;
    flpUI.videosDone     = 0;
    flpUI.videosFailed   = 0;
    flpUI.totalPrompts   = videoPrompts.length;
    flpUI.watching       = true;

    const resp = await sendMessage({ type: 'FLP_START', config });
    if (resp && resp.success) {
      // Record usage
      await window.LicenseManager.recordGeneration();
      updateLicenseUI();
      
      flpSetWatchingUI(true);
      flpUpdateProgress();
      flpLog('Pipeline started. Watching for images in: ' + config.folderMarker, 'info');
      flpLog('Video prompts loaded: ' + videoPrompts.length, 'info');
    } else {
      flpUI.watching = false;
      showToast('Failed to start pipeline: ' + (resp?.error || 'unknown'), 'error');
    }
  }

  // ─── Stop ───────────────────────────────────────────────────────
  async function flpStop() {
    flpUI.watching = false;
    await sendMessage({ type: 'FLP_STOP' });
    flpSetWatchingUI(false);
    flpLog('Pipeline stopped.', 'warn');
    flpSetStatus('idle', '⏹ Stopped');
  }

  // ─── Handle events from SW ──────────────────────────────────────
  function flpHandleEvent(data) {
    switch (data.event) {
      case 'log':
        flpLog(data.msg, data.type || 'info');
        break;

      case 'status':
        flpSetStatus(data.state, data.text);
        break;

      case 'image_queued':
        flpUI.imagesReceived = data.imagesReceived;
        flpUI.videosQueued   = data.videosQueued;
        flpLog(`Image #${data.order} queued → "${(data.rawPrompt || '').substring(0, 50)}${(data.rawPrompt||'').length > 50 ? '…' : ''}"`, 'success');
        flpUpdateProgress();
        flpRenderQueueFromStorage();
        break;
    }
  }

  // Also poll storage every 3s to catch video completions
  setInterval(() => {
    if (!flpUI.watching) return;
    chrome.storage.local.get('meta_automator_queue', (r) => {
      const q = (r.meta_automator_queue || []).filter(i => i.id?.startsWith('flp_'));
      const done   = q.filter(i => i.status === 'completed').length;
      const failed = q.filter(i => i.status === 'failed').length;
      if (done !== flpUI.videosDone || failed !== flpUI.videosFailed) {
        flpUI.videosDone   = done;
        flpUI.videosFailed = failed;
        flpUpdateProgress();
        flpRenderQueueFromStorage();
        if (flpUI.totalPrompts > 0 && (done + failed) >= flpUI.totalPrompts) {
          flpSetStatus('done', `✅ Pipeline complete — ${done} videos done`);
          flpLog('All videos processed!', 'success');
        }
      }
    });
  }, 3000);

  // ─── UI helpers ─────────────────────────────────────────────────
  function flpSetWatchingUI(watching) {
    document.getElementById('flpStartBtn').disabled = watching;
    document.getElementById('flpStopBtn').disabled  = !watching;
    document.getElementById('flpProgressSection').style.display = watching ? 'block' : 'none';
    document.getElementById('flpLog').style.display        = 'block';
    document.getElementById('flpInstruction').style.display = watching ? 'block' : 'none';
    if (watching) flpSetStatus('watching', '👀 Watching for Flow images...');
  }

  function flpSetStatus(state, text) {
    const dot  = document.getElementById('flpStatusDot');
    const span = document.getElementById('flpStatusText');
    if (!dot || !span) return;
    dot.className = 'flp-status-dot ' + state;
    span.textContent = text;
  }

  function flpUpdateProgress() {
    const total = flpUI.totalPrompts;
    document.getElementById('flpProgressCount').textContent =
      flpUI.videosDone + ' / ' + total;
    document.getElementById('flpProgressBar').style.width =
      (total > 0 ? (flpUI.videosDone / total) * 100 : 0) + '%';
    document.getElementById('flpStatImages').textContent =
      '🖼️ ' + flpUI.imagesReceived + ' received';
    document.getElementById('flpStatVideos').textContent =
      '🎬 ' + flpUI.videosDone + ' done';
    document.getElementById('flpStatFailed').textContent =
      '❌ ' + flpUI.videosFailed + ' failed';

    // Show/hide regenerate & clean buttons if there are failures/completions
    const regBtn = document.getElementById('flpRegenerateBtn');
    const cleanBtn = document.getElementById('flpCleanBtn');
    if (regBtn) {
      regBtn.style.display = (flpUI.videosFailed > 0) ? 'block' : 'none';
    }
    if (cleanBtn) {
      cleanBtn.style.display = (flpUI.videosFailed > 0 || flpUI.videosDone > 0) ? 'block' : 'none';
    }
  }

  async function flpRenderQueueFromStorage() {
    const r = await new Promise(res => chrome.storage.local.get('meta_automator_queue', res));
    const queue = (r.meta_automator_queue || []).filter(i => i.id?.startsWith('flp_'));
    const el = document.getElementById('flpQueueList');
    if (!el) return;

    let html = '';
    queue.forEach((item, i) => {
      const icon = item.status === 'completed' ? '✅'
                 : item.status === 'failed'    ? '⚠️'
                 : item.status === 'processing' ? '⚡' : '⏳';
      // Use thumbnail for display — capturedImage may be huge
      const imgSrc = item.thumbnail || item.capturedImage || '';
      const thumbHtml = imgSrc
        ? `<img src="${imgSrc}" class="flp-queue-thumb" alt="" data-id="${item.id}">`
        : '<div class="flp-queue-thumb-empty">No img</div>';
      
      html += `
        <div class="flp-queue-item ${item.status}" data-id="${item.id}">
          <div class="flp-queue-item-header">
            <span class="sp-queue-status ${item.status}">${icon} #${i + 1} ${item.status}</span>
            <div class="sp-queue-actions-btn">
               <button class="sp-queue-icon-btn delete" data-action="delete-flp" data-id="${item.id}" title="Delete Item">❌</button>
            </div>
          </div>
          <div class="flp-queue-item-body">
            ${thumbHtml}
            <textarea class="flp-queue-prompt-edit" data-id="${item.id}" rows="2" style="${item.status === 'failed' ? 'border: 1px dashed var(--red);' : ''}" ${item.status === 'processing' ? 'disabled' : ''}>${item.videoPrompt || ''}</textarea>
          </div>
        </div>`;
    });
    el.innerHTML = html;
    attachFlpQueueListeners();
  }

  function attachFlpQueueListeners() {
    // Delete buttons
    document.querySelectorAll('[data-action="delete-flp"]').forEach(btn => {
      btn.onclick = async (e) => {
        const id = e.currentTarget.dataset.id;
        const r = await chrome.storage.local.get('meta_automator_queue');
        let queue = r.meta_automator_queue || [];
        queue = queue.filter(q => q.id !== id);
        await chrome.storage.local.set({ meta_automator_queue: queue });
        showToast('Item removed from Flow Pipeline');
        flpRenderQueueFromStorage();
      };
    });

    // Prompt edits
    document.querySelectorAll('.flp-queue-prompt-edit').forEach(ta => {
      ta.onchange = async (e) => {
        const id = e.currentTarget.dataset.id;
        const text = e.currentTarget.value;
        const r = await chrome.storage.local.get('meta_automator_queue');
        let queue = r.meta_automator_queue || [];
        const item = queue.find(q => q.id === id);
        if (item) {
          item.videoPrompt = text;
          item.text = text;
          await chrome.storage.local.set({ meta_automator_queue: queue });
          showToast('Prompt updated');
        }
      };
    });
  }

  function flpLog(msg, type = 'info') {
    const box = document.getElementById('flpLog');
    if (!box) return;
    const div = document.createElement('div');
    div.className = 'flp-log-line flp-log-' + type;
    div.textContent = '[' + new Date().toLocaleTimeString() + '] ' + msg;
    box.appendChild(div);
    box.scrollTop = box.scrollHeight;
  }

  // Wire into DOMContentLoaded
  document.addEventListener('DOMContentLoaded', () => {
    setupFlowPipeline();
  });

  // ═══════════════════════════════════════════════════════════════
  // END FLOW PIPELINE
  // ═══════════════════════════════════════════════════════════════

  function setupTheme() {
    const btn = document.getElementById('themeToggleBtn');
    const icon = document.getElementById('themeIcon');
    
    // Load saved theme
    chrome.storage.local.get('theme', (r) => {
      const theme = r.theme || 'dark';
      if (theme === 'light') {
        document.body.classList.add('light-mode');
        if (icon) icon.textContent = '☀️';
      } else {
        document.body.classList.remove('light-mode');
        if (icon) icon.textContent = '🌙';
      }
    });

    if (btn) {
      btn.onclick = () => {
        const isLight = document.body.classList.toggle('light-mode');
        const newTheme = isLight ? 'light' : 'dark';
        if (icon) icon.textContent = isLight ? '☀️' : '🌙';
        chrome.storage.local.set({ theme: newTheme });
      };
    }
  }

  // Licensing Tab UI Updates
  async function updateLicenseUI() {
    try {
      const status = await window.LicenseManager.getStatus();
      
      const deviceIdInput = document.getElementById('deviceIdInput');
      if (deviceIdInput) {
        deviceIdInput.value = status.userId || '';
      }
      
      const licenseStatusTitle = document.getElementById('licenseStatusTitle');
      const licenseStatusDesc = document.getElementById('licenseStatusDesc');
      const trialProgress = document.getElementById('trialProgress');
      
      if (licenseStatusTitle && licenseStatusDesc && trialProgress) {
        if (status.type === 'premium') {
          licenseStatusTitle.textContent = `Current Status: Premium (${status.plan || 'Active'})`;
          
          if (status.plan === 'Lifetime') {
            licenseStatusDesc.textContent = 'Unlimited generations. Permanent access enabled.';
            trialProgress.style.width = '100%';
            trialProgress.style.background = 'linear-gradient(90deg, #10b981, #34d399)';
          } else {
            const used = status.used || 0;
            const limit = status.credits || 0;
            const remaining = Math.max(0, limit - used);
            licenseStatusDesc.textContent = `${remaining} / ${limit} generations remaining. Plan expires on: ${status.expiry ? new Date(status.expiry).toLocaleDateString() : 'N/A'}`;
            const pct = limit > 0 ? (remaining / limit) * 100 : 0;
            trialProgress.style.width = `${pct}%`;
            trialProgress.style.background = 'linear-gradient(90deg, #3b82f6, #60a5fa)';
          }
        } else {
          // Trial status
          const count = status.count || 0;
          const limit = status.limit || 3;
          const remaining = Math.max(0, limit - count);
          licenseStatusTitle.textContent = 'Current Status: Trial';
          licenseStatusDesc.textContent = `You are using the free trial. ${remaining} / ${limit} generations remaining.`;
          const pct = limit > 0 ? (remaining / limit) * 100 : 0;
          trialProgress.style.width = `${pct}%`;
          if (remaining === 0) {
            trialProgress.style.background = 'linear-gradient(90deg, #ef4444, #f87171)';
          } else {
            trialProgress.style.background = 'linear-gradient(90deg, #8b5cf6, #a78bfa)';
          }
        }
      }
    } catch (e) {
      console.error('[Sidepanel] Failed to update license UI:', e);
    }
  }

  function setupLicensingUI() {
    const copyDeviceIdBtn = document.getElementById('copyDeviceIdBtn');
    if (copyDeviceIdBtn) {
      copyDeviceIdBtn.addEventListener('click', () => {
        const deviceIdInput = document.getElementById('deviceIdInput');
        if (deviceIdInput && deviceIdInput.value && deviceIdInput.value !== 'Loading...') {
          navigator.clipboard.writeText(deviceIdInput.value);
          showToast('Device ID copied to clipboard!', 'success');
        }
      });
    }

    const activateLicenseBtn = document.getElementById('activateLicenseBtn');
    if (activateLicenseBtn) {
      activateLicenseBtn.addEventListener('click', async () => {
        const keyInput = document.getElementById('licenseKeyInput');
        const key = keyInput ? keyInput.value.trim() : '';
        if (!key) {
          showToast('Please enter an activation code', 'error');
          return;
        }
        
        activateLicenseBtn.disabled = true;
        const originalText = activateLicenseBtn.textContent;
        activateLicenseBtn.textContent = '🔄 Activating...';
        
        try {
          const res = await window.LicenseManager.activate(key);
          if (res.success) {
            showToast(`Premium activated! Plan: ${res.plan}`, 'success');
            if (keyInput) keyInput.value = '';
            updateLicenseUI();
          } else {
            showToast(res.error || 'Failed to activate license code', 'error');
          }
        } catch (e) {
          showToast('Server error during activation', 'error');
        } finally {
          activateLicenseBtn.disabled = false;
          activateLicenseBtn.textContent = originalText;
        }
      });
    }
  }

})();
