/**
 * Omni Automator – Background Service Worker
 * Central coordinator: message routing, downloads, cache, side panel.
 * Supports Meta AI, Google Gemini, ChatGPT.
 */

// ─── Constants (duplicated for module context) ──────────────────────
const MSG = {
  START_QUEUE: 'START_QUEUE', PAUSE_QUEUE: 'PAUSE_QUEUE', RESUME_QUEUE: 'RESUME_QUEUE',
  STOP_QUEUE: 'STOP_QUEUE', PROCESS_PROMPT: 'PROCESS_PROMPT', PROMPT_COMPLETE: 'PROMPT_COMPLETE',
  PROMPT_FAILED: 'PROMPT_FAILED', DOWNLOAD_FILE: 'DOWNLOAD_FILE', DOWNLOAD_COMPLETE: 'DOWNLOAD_COMPLETE',
  DOWNLOAD_ALL: 'DOWNLOAD_ALL', GET_STATUS: 'GET_STATUS', STATUS_UPDATE: 'STATUS_UPDATE',
  INJECT_PROMPT: 'INJECT_PROMPT', SWITCH_MODE: 'SWITCH_MODE', UPLOAD_REFERENCE: 'UPLOAD_REFERENCE',
  CONTENT_DETECTED: 'CONTENT_DETECTED', GET_SETTINGS: 'GET_SETTINGS', UPDATE_SETTINGS: 'UPDATE_SETTINGS',
  CLEAR_CACHE: 'CLEAR_CACHE', OPEN_SIDE_PANEL: 'OPEN_SIDE_PANEL', EXPORT_CSV: 'EXPORT_CSV',
  GENERATE_PROMPTS: 'GENERATE_PROMPTS', SELECT_MODEL: 'SELECT_MODEL'
};

const STORAGE_KEYS = {
  SETTINGS: 'meta_automator_settings',
  QUEUE: 'meta_automator_queue',
  QUEUE_STATE: 'meta_automator_queue_state',
  DOWNLOADS: 'meta_automator_downloads',
  GENERATION_COUNT: 'meta_automator_gen_count',
  CURRENT_PLATFORM: 'omni_automator_platform'
};

const DEFAULT_SETTINGS = {
  generationMode: 'image', inputMode: 'text', stealthMode: true,
  minDelay: 3000, maxDelay: 7000, typingSpeed: 50, typingVariance: 30,
  autoDownload: true, downloadFormat: 'original',
  filenameTemplate: '{prompt}_{index}_{timestamp}',
  imageFormat: 'png',

  folderMetaImage: 'Meta_Images',
  folderMetaVideo: 'Meta_Videos',
  folderGemini: 'Gemini_Images',
  folderChatGPT: 'ChatGPT_Images',
  folderMetaPipeVideo: 'Meta_Pipe_Videos',
  folderPipeline: 'Pipeline_Final',

  storyContextCharacters: '',
  storyContextAtmosphere: '',
  aspectRatio: '1:1',
  concurrencyFactor: 1,
  autoCacheClear: true,
  cacheClearInterval: 50, maxRetries: 2, retryDelay: 5000,
  generationTimeout: 180000, theme: 'dark', notifications: true
};

// Platform URL patterns for tab matching
const PLATFORM_URLS = {
  meta: '*://*.meta.ai/*',
  gemini: '*://gemini.google.com/*',
  chatgpt: '*://chatgpt.com/*'
};

// ─── Storage helpers ────────────────────────────────────────────────
async function storageGet(key, def = null) {
  const r = await chrome.storage.local.get(key);
  return r[key] !== undefined ? r[key] : def;
}
async function storageSet(key, val) {
  await chrome.storage.local.set({ [key]: val });
}

// ─── Initialization ──────────────────────────────────────────────────
chrome.runtime.onInstalled.addListener((details) => {
  // Set default behavior to open side panel on icon click (Chrome 116+)
  if (chrome.sidePanel && chrome.sidePanel.setPanelBehavior) {
    chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true })
      .catch(error => console.warn('[SW] setPanelBehavior not supported or failed:', error));
  }

  if (details.reason === 'install') {
    // Synchronous storage set for safety
    chrome.storage.local.set({
      [STORAGE_KEYS.SETTINGS]: DEFAULT_SETTINGS,
      [STORAGE_KEYS.QUEUE]: [],
      [STORAGE_KEYS.DOWNLOADS]: [],
      [STORAGE_KEYS.GENERATION_COUNT]: 0,
      [STORAGE_KEYS.CURRENT_PLATFORM]: 'meta'
    }, () => {
      console.log('[OmniAutomator] Extension installed, defaults set.');
    });
  }
});

chrome.runtime.onStartup.addListener(() => {
  if (chrome.sidePanel && chrome.sidePanel.setPanelBehavior) {
    chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true })
      .catch(error => console.warn('[SW] setPanelBehavior failed on startup:', error));
  }
});

// ─── Message router ─────────────────────────────────────────────────
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  handleMessage(message, sender).then(sendResponse).catch(err => {
    console.error('[SW] Message error:', err);
    sendResponse({ success: false, error: err.message });
  });
  return true; // Keep channel open for async
});

async function handleMessage(msg, sender) {
  switch (msg.type) {
    case MSG.DOWNLOAD_FILE:
      return await handleDownload(msg.data);

    case MSG.CLEAR_CACHE:
      return await handleClearCache();

    case MSG.GET_SETTINGS:
      return await getSettings();

    case MSG.UPDATE_SETTINGS:
      return await updateSettings(msg.data);

    case MSG.GET_STATUS:
      return await getStatus();

    case MSG.OPEN_SIDE_PANEL:
      return await openSidePanel(msg.tabId || sender.tab?.id);

    case MSG.CONTENT_DETECTED:
      return await handleContentDetected(msg.data);

    case 'SET_PLATFORM':
      await storageSet(STORAGE_KEYS.CURRENT_PLATFORM, msg.data.platform);
      return { success: true };

    case 'GET_PLATFORM':
      const platform = await storageGet(STORAGE_KEYS.CURRENT_PLATFORM, 'meta');
      return { success: true, platform };

    case 'FLP_START':
      return await handleFlpStart(msg.config);

    case 'FLP_STOP':
      return await handleFlpStop();

    case MSG.START_QUEUE:
    case MSG.PAUSE_QUEUE:
    case MSG.RESUME_QUEUE:
    case MSG.STOP_QUEUE:
    case MSG.INJECT_PROMPT:
    case MSG.SWITCH_MODE:
    case MSG.UPLOAD_REFERENCE:
    case MSG.SELECT_MODEL:
      // Forward to content script on correct platform tab
      return await forwardToContentTab(msg);

    default:
      return { success: false, error: 'Unknown message type' };
  }
}

// ─── Download handler ───────────────────────────────────────────────
async function handleDownload(data) {
  try {
    const { settings } = await getSettings();
    let folder = 'OmniAutomator';

    // Pick folder based on platform and mode
    if (data.mode === 'pipeline') {
      if (data.inputMode === 'pipeline') {
        // VEO Flow Pipeline
        folder = settings.folderPipeline || 'Pipeline_Final';
      } else {
        // Internal Meta Pipeline
        folder = data.type === 'video'
          ? (settings.folderMetaPipeVideo || 'Meta_Pipe_Videos')
          : (settings.folderMetaImage || 'Meta_Images'); 
      }
    } else if (data.platform === 'gemini') {
      folder = settings.folderGemini || 'Gemini_Images';
    } else if (data.platform === 'chatgpt') {
      folder = settings.folderChatGPT || 'ChatGPT_Images';
    } else if (data.platform === 'meta') {
      folder = data.type === 'video'
        ? (settings.folderMetaVideo || 'Meta_Videos')
        : (settings.folderMetaImage || 'Meta_Images');
    }

    folder = folder.trim().replace(/^\/+|\/+$/g, '');
    let filename = data.filename || `omni_${Date.now()}`;

    // Add extension if missing
    if (data.type === 'video' && !filename.match(/\.(mp4|webm)$/i)) {
      filename += '.mp4';
    } else if (data.type === 'image' && !filename.match(/\.(png|jpg|jpeg|webp)$/i)) {
      filename += '.png';
    }

    const downloadOptions = {
      url: data.url,
      filename: `${folder}/${filename}`,
      saveAs: false,
      conflictAction: 'uniquify'
    };

    const downloadId = await chrome.downloads.download(downloadOptions);

    // Track download
    const downloads = await storageGet(STORAGE_KEYS.DOWNLOADS, []);
    downloads.push({
      id: downloadId,
      prompt: data.prompt || '',
      mode: data.type || 'image',
      filename: filename,
      url: data.url,
      status: 'completed',
      timestamp: new Date().toISOString()
    });
    await storageSet(STORAGE_KEYS.DOWNLOADS, downloads);

    // Increment generation count
    const count = await storageGet(STORAGE_KEYS.GENERATION_COUNT, 0);
    await storageSet(STORAGE_KEYS.GENERATION_COUNT, count + 1);

    // Auto cache clear check
    if (settings.autoCacheClear && (count + 1) % settings.cacheClearInterval === 0) {
      await handleClearCache();
    }

    return { success: true, downloadId };
  } catch (e) {
    console.error('[SW] Download error:', e);
    return { success: false, error: e.message };
  }
}

// ─── Cache cleaner ──────────────────────────────────────────────────
async function handleClearCache() {
  try {
    await chrome.browsingData.removeCache({ since: 0 });
    console.log('[OmniAutomator] Cache cleared.');
    return { success: true };
  } catch (e) {
    console.error('[SW] Cache clear error:', e);
    return { success: false, error: e.message };
  }
}

// ─── Settings ───────────────────────────────────────────────────────
async function getSettings() {
  const s = await storageGet(STORAGE_KEYS.SETTINGS, {});
  return { success: true, settings: { ...DEFAULT_SETTINGS, ...s } };
}

async function updateSettings(data) {
  const current = await storageGet(STORAGE_KEYS.SETTINGS, {});
  const updated = { ...DEFAULT_SETTINGS, ...current, ...data };
  await storageSet(STORAGE_KEYS.SETTINGS, updated);
  return { success: true, settings: updated };
}

// ─── Status ─────────────────────────────────────────────────────────
async function getStatus() {
  const queue = await storageGet(STORAGE_KEYS.QUEUE, []);
  const state = await storageGet(STORAGE_KEYS.QUEUE_STATE, 'idle');
  const count = await storageGet(STORAGE_KEYS.GENERATION_COUNT, 0);
  const downloads = await storageGet(STORAGE_KEYS.DOWNLOADS, []);
  const platform = await storageGet(STORAGE_KEYS.CURRENT_PLATFORM, 'meta');
  return {
    success: true,
    queueLength: queue.length,
    queueState: state,
    totalGenerated: count,
    totalDownloads: downloads.length,
    completed: queue.filter(p => p.status === 'completed').length,
    failed: queue.filter(p => p.status === 'failed').length,
    pending: queue.filter(p => p.status === 'pending').length,
    processing: queue.filter(p => p.status === 'processing').length,
    platform
  };
}

// ─── Side panel ─────────────────────────────────────────────────────
async function openSidePanel(tabId) {
  try {
    if (tabId) {
      await chrome.sidePanel.open({ tabId });
    }
    return { success: true };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

// ─── Content detection ──────────────────────────────────────────────
async function handleContentDetected(data) {
  const settings = (await getSettings()).settings;
  if (settings.autoDownload && data.url) {
    return await handleDownload(data);
  }
  return { success: true, autoDownload: false };
}

// ═══════════════════════════════════════════════════════════════════
// ─── FLOW PIPELINE — download watcher (must live in SW) ────────────
// chrome.downloads events only fire reliably in the service worker.
// The sidepanel sends FLP_START / FLP_STOP messages to activate this.
// ═══════════════════════════════════════════════════════════════════

const flpState = {
  active: false,
  folderMarker: 'pipeline_images',
  videoFolder: 'pipeline_videos',
  videoPrompts: [],
  contextStr: '',
  imagesReceived: 0,
  videosQueued: 0,
  metaQueueStarted: false,
  pendingDownloads: new Map(), // downloadId → { filename, order, url }
};

// Persistent listeners — attached once, guarded by flpState.active
chrome.downloads.onCreated.addListener((item) => {
  // We used to do logic here, but item.filename is often empty at onCreated.
  // Logic moved to onChanged for better reliability.
});

chrome.downloads.onChanged.addListener(async (delta) => {
  if (!flpState.active) return;

  // 1. Detect filename when it becomes available (sometimes it's empty in onCreated)
  if (delta.filename && delta.filename.current) {
    const filename = delta.filename.current.replace(/\\/g, '/').toLowerCase();

    // Check if it's in our target folder and has an image extension
    if (filename.includes(flpState.folderMarker) && /\.(png|jpg|jpeg|webp|jfif)$/i.test(filename)) {
      const order = flpExtractOrder(filename);
      if (order !== null) {
        // Track this download as a pending Flow image
        flpState.pendingDownloads.set(delta.id, { filename, order, url: '' });
        flpNotifySidepanel({ event: 'log', msg: `Detected Flow image #${order}: ${filename.split('/').pop()}`, type: 'info' });
      }
    }
  }

  // 2. Handle completion
  if (delta.state?.current === 'complete') {
    if (!flpState.pendingDownloads.has(delta.id)) return;

    const { filename, order } = flpState.pendingDownloads.get(delta.id);
    flpState.pendingDownloads.delete(delta.id);

    // Fetch the image as base64
    const dataUrl = await flpFetchAsDataUrl(delta.id);
    if (!dataUrl) {
      flpNotifySidepanel({ event: 'log', msg: `Failed to read image #${order} — blob may have expired or is inaccessible in SW`, type: 'error' });
      return;
    }
    await flpHandleNewImage(order, dataUrl);
  }
});

async function flpHandleNewImage(order, dataUrl) {
  flpState.imagesReceived = Math.max(flpState.imagesReceived, order);
  const promptIndex = order - 1;

  if (promptIndex >= flpState.videoPrompts.length) {
    flpNotifySidepanel({ event: 'log', msg: `No video prompt for image #${order} (${flpState.videoPrompts.length} prompts loaded)`, type: 'warn' });
    return;
  }

  const rawPrompt = flpState.videoPrompts[promptIndex];
  const clean = rawPrompt.replace(/animate\s+/gi, '');
  const concurrency = flpState.concurrency || 1;
  const ar = flpState.aspectRatio || '1:1';

  // Base prompt with aspect ratio
  const basePrompt = `Create a video of aspect ratio ${ar}. ${clean}`;
  const videoPrompt = flpState.contextStr
    ? `${basePrompt}. ${flpState.contextStr}`
    : basePrompt;

  // Queue N items based on concurrency
  const newItems = [];

  for (let c = 0; c < concurrency; c++) {
    newItems.push({
      id: 'flp_' + order + '_' + (c + 1) + '_' + Date.now().toString(36),
      status: 'pending',
      index: flpState.videosQueued + c,
      originalIndex: promptIndex,
      sceneOrder: order,
      filename: `Scene${order}`,
      variation: c + 1,
      text: videoPrompt,
      videoPrompt: videoPrompt,
      imagePrompt: '',
      capturedImage: dataUrl,
      referenceImage: dataUrl,
      inputMode: 'pipeline',
      mode: 'pipeline',
      maxDownloads: 1
    });
  }

  flpState.videosQueued += concurrency;

  // Append to Omni queue (read-modify-write)
  const r = await chrome.storage.local.get('meta_automator_queue');
  const queue = r.meta_automator_queue || [];
  queue.push(...newItems);
  await chrome.storage.local.set({ meta_automator_queue: queue, meta_automator_phase: 'video' });

  flpNotifySidepanel({
    event: 'image_queued',
    order,
    rawPrompt,
    imagesReceived: flpState.imagesReceived,
    videosQueued: flpState.videosQueued
  });

  // Start or re-start Omni queue when idle
  const stateR = await chrome.storage.local.get('meta_automator_queue_state');
  const queueState = stateR.meta_automator_queue_state || 'idle';

  if (!flpState.metaQueueStarted || queueState === 'idle') {
    flpState.metaQueueStarted = true;
    const resp = await forwardToContentTab({
      type: 'START_QUEUE',
      data: { mode: 'pipeline', inputMode: 'pipeline', phase: 'video', tabTarget: 'video', platform: 'meta' }
    });
    if (resp && resp.success) {
      flpNotifySidepanel({ event: 'log', msg: 'Meta AI queue started ✅', type: 'success' });
      flpNotifySidepanel({ event: 'status', state: 'running', text: '⚡ Meta AI processing...' });
    } else {
      flpNotifySidepanel({ event: 'log', msg: 'Could not start Meta AI: ' + (resp?.error || 'Is meta.ai open?'), type: 'error' });
      flpNotifySidepanel({ event: 'status', state: 'error', text: '❌ Meta AI tab not found' });
    }
  }
}

async function flpFetchAsDataUrl(downloadId) {
  // First, search for the download item to get the latest URLs
  let item = null;
  try {
    const items = await new Promise(res => chrome.downloads.search({ id: downloadId }, res));
    if (items && items.length > 0) item = items[0];
  } catch (e) { console.error('[SW] Download search failed:', e); }

  if (!item) return null;

  const tryFetch = async (u) => {
    if (!u) return null;

    // If it's a blob URL, we cannot fetch it directly in the Service Worker context.
    // We try to fetch it via a content script in an active tab.
    if (u.startsWith('blob:')) {
      return await tryFetchFromTabs(u);
    }

    try {
      const r = await fetch(u);
      if (!r.ok) return null;
      const blob = await r.blob();
      const buf = await blob.arrayBuffer();
      const bytes = new Uint8Array(buf);
      let binary = '';
      for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
      const b64 = btoa(binary);
      const mime = blob.type || 'image/png';
      return `data:${mime};base64,${b64}`;
    } catch { return null; }
  };

  // Try original URL first, then finalUrl
  let dataUrl = await tryFetch(item.url);
  if (!dataUrl && item.finalUrl && item.finalUrl !== item.url) {
    dataUrl = await tryFetch(item.finalUrl);
  }

  return dataUrl;
}

/**
 * Fallback: Ask content scripts to fetch a blob URL since SW can't access them
 */
async function tryFetchFromTabs(blobUrl) {
  try {
    // Query all tabs that might have access to this blob (usually the active one)
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tabs.length === 0) return null;

    // Send a message to the active tab to fetch the blob
    // We need a handler in content.js for this
    const response = await chrome.tabs.sendMessage(tabs[0].id, {
      type: 'FETCH_BLOB_AS_B64',
      url: blobUrl
    }).catch(() => null);

    if (response && response.success) {
      return response.dataUrl;
    }
  } catch (e) {
    console.warn('[SW] Tab fetch failed:', e);
  }
  return null;
}

function flpExtractOrder(filename) {
  const base = filename.split('/').pop();
  let m;
  // Patterns like "1_...", "01_...", "1-...", "1.jfif"
  m = base.match(/^(\d+)[_\-\s.]/); if (m) return parseInt(m[1], 10);
  m = base.match(/[_\-\s](\d{1,4})[_\-\s.]/); if (m) return parseInt(m[1], 10);
  m = base.match(/^(\d+)\./); if (m) return parseInt(m[1], 10);
  m = base.match(/(\d+)\.(png|jpg|jpeg|webp|jfif)$/i); if (m) return parseInt(m[1], 10);
  return null;
}

// Notify the sidepanel (best-effort — sidepanel may not be open)
function flpNotifySidepanel(data) {
  chrome.runtime.sendMessage({ type: 'FLP_EVENT', data }).catch(() => { });
}

// Message handlers for FLP_START / FLP_STOP
async function handleFlpStart(config) {
  // Reset state
  flpState.active = true;
  flpState.folderMarker = (config.folderMarker || 'pipeline_images').toLowerCase();
  flpState.videoFolder = config.videoFolder || 'pipeline_videos';
  flpState.videoPrompts = config.videoPrompts || [];
  flpState.contextStr = config.contextStr || '';
  flpState.aspectRatio = config.aspectRatio || '1:1';
  flpState.concurrency = config.concurrency || 1;
  flpState.imagesReceived = 0;
  flpState.videosQueued = 0;
  flpState.metaQueueStarted = false;
  flpState.pendingDownloads.clear();

  // Update Omni's download folder setting and reset its queue
  await updateSettings({ folderPipeline: flpState.videoFolder });
  await chrome.storage.local.set({
    meta_automator_queue: [],
    meta_automator_queue_state: 'idle',
    meta_automator_phase: 'video'
  });

  // Persist config in storage so SW can recover after sleep
  await chrome.storage.local.set({ flp_config: { ...config, active: true } });

  return { success: true };
}

async function handleFlpStop() {
  flpState.active = false;
  flpState.pendingDownloads.clear();
  await chrome.storage.local.set({ flp_config: { active: false } });
  // Stop Meta queue if running
  await forwardToContentTab({ type: 'STOP_QUEUE' }).catch(() => { });
  return { success: true };
}

// On SW startup, restore flp state if it was active before SW was killed
(async () => {
  try {
    const r = await chrome.storage.local.get('flp_config');
    const cfg = r.flp_config;
    if (cfg?.active) {
      flpState.active = true;
      flpState.folderMarker = (cfg.folderMarker || 'pipeline_images').toLowerCase();
      flpState.videoFolder = cfg.videoFolder || 'pipeline_videos';
      flpState.videoPrompts = cfg.videoPrompts || [];
      flpState.contextStr = cfg.contextStr || '';
      // imagesReceived/videosQueued are lost — sidepanel will re-sync from queue storage
      console.log('[FlowPipeline] Restored active state after SW restart');
    }
  } catch (e) {
    console.warn('[FlowPipeline] Could not restore state:', e);
  }
})();

// ═══════════════════════════════════════════════════════════════════
// END FLOW PIPELINE
// ═══════════════════════════════════════════════════════════════════

// ─── Forward to correct platform tab ────────────────────────────────
async function forwardToContentTab(msg) {
  try {
    const platform = await storageGet(STORAGE_KEYS.CURRENT_PLATFORM, 'meta');
    const urlPattern = PLATFORM_URLS[platform];

    if (!urlPattern) {
      return { success: false, error: `Unknown platform: ${platform}` };
    }

    const tabs = await chrome.tabs.query({ url: urlPattern });

    if (tabs.length === 0) {
      const platformNames = { meta: 'Meta AI (meta.ai)', gemini: 'Google Gemini (gemini.google.com)', chatgpt: 'ChatGPT (chatgpt.com)' };
      return { success: false, error: `No ${platformNames[platform] || platform} tab found. Please open it first.` };
    }

    const response = await chrome.tabs.sendMessage(tabs[0].id, msg);
    return response;
  } catch (e) {
    let errMsg = e.message;
    if (errMsg.includes('Receiving end does not exist')) {
      errMsg = 'The AI tab is not responding. Please refresh Meta AI / Gemini / ChatGPT and try again.';
    }
    return { success: false, error: errMsg };
  }
}
