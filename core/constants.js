/**
 * Meta Automator – Constants & Configuration
 * Central configuration for all selectors, defaults, and enums.
 */

// ─── Generation Modes ───────────────────────────────────────────────
const GENERATION_MODE = {
  IMAGE: 'image',
  VIDEO: 'video'
};

const INPUT_MODE = {
  TEXT: 'text',         // Text-to-Image/Video: prompts only
  SINGLE: 'single',    // Single reference image for all prompts
  PAIRED: 'paired',    // Each prompt paired with a specific image
  PIPELINE: 'pipeline' // Story Sheet Pipeline: Image -> Capture -> Video
};

// ─── Queue Status ───────────────────────────────────────────────────
const QUEUE_STATUS = {
  IDLE: 'idle',
  RUNNING: 'running',
  PAUSED: 'paused',
  STOPPED: 'stopped'
};

const QUEUE_PHASE = {
  IMAGE: 'image',    // Phase 1: Generating images
  VIDEO: 'video'     // Phase 2: Generating videos from captured images
};

const PROMPT_STATUS = {
  PENDING: 'pending',
  PROCESSING: 'processing',
  COMPLETED: 'completed',
  FAILED: 'failed',
  SKIPPED: 'skipped'
};

// ─── Meta AI DOM Selectors (update as site changes) ─────────────────
// These selectors target Meta AI's current interface.
// They may need updating when Meta AI changes their DOM structure.
const META_SELECTORS = {
  // Main chat input
  chatInput: '[contenteditable="true"]',
  chatInputFallback: 'textarea',

  // Send/Submit button
  sendButton: '[aria-label="Send"], button[type="submit"]',
  sendButtonFallback: 'form button:last-of-type',

  // Create mode tabs
  createImageTab: '[role="tab"]:has-text("Create image"), button:has-text("Create image")',
  createVideoTab: '[role="tab"]:has-text("Create video"), button:has-text("Create video")',

  // Generated content containers
  generatedImage: 'img[src*="scontent"], img[src*="blob:"], img[alt*="Generated"]',
  generatedVideo: 'video source, video[src]',

  // Image upload / reference
  fileInput: 'input[type="file"]',
  imageUploadButton: '[aria-label*="upload"], [aria-label*="image"], button:has-text("Add image")',

  // Loading / generation indicators
  loadingIndicator: '[role="progressbar"], .loading, [class*="spinner"], [class*="loading"]',

  // Response container
  responseContainer: '[class*="response"], [class*="message"], [role="article"]',
  lastResponse: '[role="article"]:last-of-type, [class*="message"]:last-of-type',

  // Download buttons on generated content
  downloadButton: '[aria-label*="download"], [aria-label*="Download"], button:has-text("Download")',

  // Navigation
  createNav: '[href*="create"], a:has-text("Create")',
};

// ─── Default Settings ───────────────────────────────────────────────
const DEFAULT_SETTINGS = {
  // Generation
  generationMode: GENERATION_MODE.IMAGE,
  inputMode: INPUT_MODE.TEXT,

  // Stealth Mode
  stealthMode: true,
  minDelay: 3000,      // Minimum delay between actions (ms)
  maxDelay: 7000,      // Maximum delay between actions (ms)
  typingSpeed: 50,     // Milliseconds between keystrokes
  typingVariance: 30,  // Random variance in typing speed

  // Auto-Download
  autoDownload: true,
  downloadFormat: 'original',  // 'original', 'png', 'jpg'
  filenameTemplate: '{prompt}_{index}_{timestamp}',
  downloadFolder: 'MetaAutomator',

  // Cache Cleaner
  autoCacheClear: true,
  cacheClearInterval: 50,  // Clear cache every N generations

  // Queue
  maxRetries: 2,
  retryDelay: 5000,

  // Prompt generation wait
  generationTimeout: 120000,  // 2 minutes max wait per generation

  // Story Context
  storyContextCharacters: '',
  storyContextAtmosphere: '',

  // Resolution
  aspectRatio: '1:1',

  // Concurrency
  concurrencyFactor: 1,

  // UI
  theme: 'dark',
  notifications: true
};

// ─── Message Types ──────────────────────────────────────────────────
const MSG = {
  // Queue control
  START_QUEUE: 'START_QUEUE',
  PAUSE_QUEUE: 'PAUSE_QUEUE',
  RESUME_QUEUE: 'RESUME_QUEUE',
  STOP_QUEUE: 'STOP_QUEUE',

  // Prompt operations
  PROCESS_PROMPT: 'PROCESS_PROMPT',
  PROMPT_COMPLETE: 'PROMPT_COMPLETE',
  PROMPT_FAILED: 'PROMPT_FAILED',

  // Download
  DOWNLOAD_FILE: 'DOWNLOAD_FILE',
  DOWNLOAD_COMPLETE: 'DOWNLOAD_COMPLETE',
  DOWNLOAD_ALL: 'DOWNLOAD_ALL',

  // Status
  GET_STATUS: 'GET_STATUS',
  STATUS_UPDATE: 'STATUS_UPDATE',

  // Content script
  INJECT_PROMPT: 'INJECT_PROMPT',
  SWITCH_MODE: 'SWITCH_MODE',
  UPLOAD_REFERENCE: 'UPLOAD_REFERENCE',
  CONTENT_DETECTED: 'CONTENT_DETECTED',

  // Settings
  GET_SETTINGS: 'GET_SETTINGS',
  UPDATE_SETTINGS: 'UPDATE_SETTINGS',

  // Cache
  CLEAR_CACHE: 'CLEAR_CACHE',

  // Side panel
  OPEN_SIDE_PANEL: 'OPEN_SIDE_PANEL',

  // CSV export
  EXPORT_CSV: 'EXPORT_CSV',

  // Prompt generator
  GENERATE_PROMPTS: 'GENERATE_PROMPTS'
};

// ─── Storage Keys ───────────────────────────────────────────────────
const STORAGE_KEYS = {
  SETTINGS: 'meta_automator_settings',
  QUEUE: 'meta_automator_queue',
  QUEUE_STATE: 'meta_automator_queue_state',
  DOWNLOADS: 'meta_automator_downloads',
  PROMPTS_HISTORY: 'meta_automator_prompts_history',
  GENERATION_COUNT: 'meta_automator_gen_count',
  REFERENCE_IMAGES: 'meta_automator_ref_images'
};

// Make available in content scripts (non-module context)
if (typeof window !== 'undefined') {
  window.META_CONSTANTS = {
    GENERATION_MODE,
    INPUT_MODE,
    QUEUE_STATUS,
    PROMPT_STATUS,
    META_SELECTORS,
    DEFAULT_SETTINGS,
    MSG,
    STORAGE_KEYS
  };
}
