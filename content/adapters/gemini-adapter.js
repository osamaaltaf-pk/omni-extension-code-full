/**
 * Omni Automator – Google Gemini Platform Adapter
 * Handles all DOM interaction specifics for gemini.google.com
 * Image generation only — enforces Fast/Flash model
 */
(function() {
  'use strict';

  const GeminiAdapter = {
    platform: 'gemini',
    name: 'Google Gemini',
    maxReferenceImages: 4,

    // ─── Selectors ──────────────────────────────────────────────────
    selectors: {
      chatInput: '[contenteditable="true"][role="textbox"]',
      chatInputFallback: '[contenteditable="true"]',
      sendButton: 'button[aria-label="Send message"], button[aria-label="Send"], button[data-mat-icon-name="send"]',
      sendButtonFallback: '.send-button, button.submit-button',
      modelSelector: 'button[data-test-id="model-selector"], [class*="model-selector"], button[aria-haspopup="listbox"]',
      generatedImage: 'img[src*="lh3.googleusercontent.com"], img[src*="blob:"], img[alt*="Generated"], img[class*="generated"]',
      fileInput: 'input[type="file"]',
      imageUploadButton: 'button[aria-label*="Upload"], button[aria-label*="Add image"], button[aria-label*="file"], button[data-mat-icon-name="upload_file"]',
      loadingIndicator: '[class*="loading"], [class*="spinner"], [class*="progress"], mat-progress-bar, .loading-indicator',
      responseContainer: '[class*="response"], [class*="message-content"], model-response',
      downloadButton: 'button[aria-label*="Download"], button[aria-label*="download"]',
    },

    // ─── Find Element ───────────────────────────────────────────────
    findElement(selectors) {
      if (typeof selectors === 'string') selectors = [selectors];
      for (const sel of selectors) {
        try {
          const el = document.querySelector(sel);
          if (el) return el;
        } catch (e) { /* next */ }
      }
      return null;
    },

    // ─── Find Input ─────────────────────────────────────────────────
    findInput() {
      return this.findElement([
        this.selectors.chatInput,
        this.selectors.chatInputFallback,
        '[contenteditable="true"]',
        'rich-textarea [contenteditable="true"]',
        '.ql-editor',
        'textarea'
      ]);
    },

    // ─── Inject Prompt ──────────────────────────────────────────────
    async injectPrompt(text) {
      const input = this.findInput();
      if (!input) throw new Error('Could not find Gemini input field');

      input.focus();
      input.click();
      await window.MetaUtils.sleep(300);

      // Clear existing content
      if (input.contentEditable === 'true') {
        input.innerHTML = '';
        input.focus();
        await window.MetaUtils.sleep(100);

        // Use execCommand for React/Angular compatibility
        if (document.queryCommandSupported('insertText')) {
          document.execCommand('insertText', false, text);
        } else {
          input.textContent = text;
        }
      } else {
        // Textarea fallback
        const nativeInputValueSetter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set;
        nativeInputValueSetter.call(input, text);
      }

      // Fire events for Angular/Lit framework detection
      input.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
      input.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
      
      await window.MetaUtils.sleep(200);
      return { success: true };
    },

    // ─── Click Send ─────────────────────────────────────────────────
    async clickSend() {
      // Try multiple send button selectors
      const sendSelectors = [
        this.selectors.sendButton,
        this.selectors.sendButtonFallback,
        'button[aria-label*="Send"]',
        'button[mattooltip*="Send"]',
      ];

      for (const sel of sendSelectors) {
        try {
          const btns = document.querySelectorAll(sel);
          for (const btn of btns) {
            if (btn && !btn.disabled && btn.offsetParent !== null) {
              btn.click();
              return;
            }
          }
        } catch(e) { /* next */ }
      }

      // Fallback: Enter key
      const input = this.findInput();
      if (input) {
        input.dispatchEvent(new KeyboardEvent('keydown', {
          key: 'Enter', code: 'Enter', keyCode: 13,
          bubbles: true, composed: true
        }));
        await window.MetaUtils.sleep(50);
        input.dispatchEvent(new KeyboardEvent('keyup', {
          key: 'Enter', code: 'Enter', keyCode: 13,
          bubbles: true, composed: true
        }));
      }
    },

    // ─── Switch Mode ────────────────────────────────────────────────
    async switchMode(mode) {
      // Gemini doesn't have image/video tabs — image gen is prompt-based
      // No-op for image mode (which is all we support)
      return { success: true };
    },

    // ─── Select Model (Fast/Flash) ──────────────────────────────────
    async selectModel() {
      try {
        // Find and click model selector
        const modelBtn = this.findElement([
          this.selectors.modelSelector,
          'button[class*="model"]',
          '[data-test-id="model-selector"]'
        ]);

        if (modelBtn) {
          // Check if already on Flash
          const currentModel = modelBtn.textContent.toLowerCase();
          if (currentModel.includes('flash') || currentModel.includes('fast')) {
            console.log('[OmniAutomator] Already on Flash model');
            return { success: true };
          }

          modelBtn.click();
          await window.MetaUtils.sleep(500);

          // Find Flash option in dropdown
          const options = document.querySelectorAll('[role="option"], [role="menuitem"], [role="listbox"] button, mat-option');
          for (const opt of options) {
            const text = opt.textContent.toLowerCase();
            if (text.includes('flash') || text.includes('fast')) {
              opt.click();
              await window.MetaUtils.sleep(500);
              console.log('[OmniAutomator] Switched to Flash model');
              return { success: true };
            }
          }

          // Also check for regular list items
          const listItems = document.querySelectorAll('li, [class*="option"]');
          for (const li of listItems) {
            const text = li.textContent.toLowerCase();
            if (text.includes('flash') || text.includes('fast')) {
              li.click();
              await window.MetaUtils.sleep(500);
              console.log('[OmniAutomator] Switched to Flash model');
              return { success: true };
            }
          }
        }

        console.warn('[OmniAutomator] Could not find model selector for Gemini');
        return { success: false, error: 'Model selector not found' };
      } catch (e) {
        return { success: false, error: e.message };
      }
    },

    // ─── Upload Reference ───────────────────────────────────────────
    async uploadReference(data) {
      if (!data.dataUrl) return { success: false, error: 'No image data' };
      try {
        const res = await fetch(data.dataUrl);
        const blob = await res.blob();
        const file = new File([blob], data.filename || 'reference.png', { type: blob.type });

        // Strategy 1: Find file input directly (Gemini keeps it hidden in DOM)
        let fileInput = document.querySelector('input[type="file"][accept*="image"]')
                     || document.querySelector('input[type="file"]');

        if (!fileInput) {
          // Try clicking the upload/attach button to reveal the input
          const uploadSelectors = [
            'button[aria-label*="Upload image"]',
            'button[aria-label*="Add image"]',
            'button[aria-label*="upload"]',
            '[data-mat-icon-name="upload_file"]',
            'button.upload-button',
            'label[for*="file"]',
          ];
          for (const sel of uploadSelectors) {
            try {
              const btn = document.querySelector(sel);
              if (btn) { btn.click(); await window.MetaUtils.sleep(600); break; }
            } catch(e) {}
          }
          fileInput = document.querySelector('input[type="file"]');
        }

        if (fileInput) {
          // Inject via DataTransfer
          const dt = new DataTransfer();
          dt.items.add(file);
          fileInput.files = dt.files;
          fileInput.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
          fileInput.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
          await window.MetaUtils.sleep(1500);
          console.log('[GeminiAdapter] Image injected via file input');
          return { success: true };
        }

        // Strategy 2: Simulate clipboard paste into the contenteditable input
        const inputEl = this.findInput();
        if (inputEl) {
          inputEl.focus();
          await window.MetaUtils.sleep(200);
          const dt2 = new DataTransfer();
          dt2.items.add(file);
          const pasteEvent = new ClipboardEvent('paste', {
            bubbles: true,
            cancelable: true,
            clipboardData: dt2
          });
          inputEl.dispatchEvent(pasteEvent);
          await window.MetaUtils.sleep(1500);
          console.log('[GeminiAdapter] Image injected via paste event');
          return { success: true };
        }

        console.error('[GeminiAdapter] No upload method worked');
        return { success: false, error: 'Could not find upload target on Gemini' };
      } catch (e) {
        console.error('[GeminiAdapter] Upload error:', e);
        return { success: false, error: e.message };
      }
    },
    
    async uploadMultipleReferences(images) {
      if (!images || images.length === 0) return { success: false };
      console.log(`[GeminiAdapter] Uploading ${images.length} images...`);
      for (let i = 0; i < images.length; i++) {
        const dataUrl = typeof images[i] === 'string' ? images[i] : images[i].dataUrl;
        await this.uploadReference({ dataUrl, filename: `ref_${i}.png` });
        await window.MetaUtils.sleep(1000); // Wait for Gemini to process between uploads
      }
      return { success: true };
    },

    // ─── Get Content URLs ───────────────────────────────────────────
    getContentUrls() {
      const urls = new Set();
      document.querySelectorAll('img').forEach(img => {
        const src = img.src || '';
        if (!src) return;
        if (src.startsWith('data:image/svg')) return;
        if (src.includes('favicon') || src.includes('avatar') || src.includes('icon')) return;
        if (src.includes('lh3.googleusercontent.com') || src.includes('blob:') || img.naturalWidth > 200) {
          urls.add(src);
        }
      });
      // Gemini sometimes puts images in picture/source elements
      document.querySelectorAll('picture source').forEach(s => {
        const src = s.srcset || s.src || '';
        if (src && (src.includes('lh3.googleusercontent.com') || src.includes('blob:'))) {
          urls.add(src.split(' ')[0]);
        }
      });
      return Array.from(urls);
    },

    // ─── Check Loading ──────────────────────────────────────────────
    isLoading() {
      // Gemini shows a progress bar or a "thinking" spinner
      const indicators = document.querySelectorAll(
        'mat-progress-bar, [class*="loading"], [class*="spinner"], [class*="thinking"], [class*="progress"]'
      );
      // Filter to only visible ones
      for (const el of indicators) {
        if (el.offsetParent !== null) return true;
      }
      return false;
    }
  };

  window.PlatformAdapter = GeminiAdapter;
})();
