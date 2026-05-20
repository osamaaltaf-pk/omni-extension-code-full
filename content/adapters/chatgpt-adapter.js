/**
 * Omni Automator – ChatGPT Platform Adapter
 * Handles all DOM interaction specifics for chatgpt.com
 * Image generation only
 */
(function() {
  'use strict';

  const ChatGPTAdapter = {
    platform: 'chatgpt',
    name: 'ChatGPT',
    maxReferenceImages: 1,

    // ─── Selectors ──────────────────────────────────────────────────
    selectors: {
      chatInput: '#prompt-textarea',
      chatInputFallback: '[contenteditable="true"]',
      sendButton: '[data-testid="send-button"], button[aria-label="Send prompt"]',
      sendButtonFallback: 'form button[type="submit"], button[class*="send"]',
      generatedImage: 'img[src*="oaidalleapiprodscus"], img[src*="blob:"], img[alt*="Generated"], [data-testid*="image"] img',
      fileInput: 'input[type="file"]',
      imageUploadButton: 'button[aria-label*="Attach"], button[aria-label*="Upload"], button[aria-label*="file"]',
      loadingIndicator: '[class*="streaming"], [class*="loading"], [data-testid*="loading"], .result-streaming',
      responseContainer: '[data-message-author-role="assistant"], [class*="agent-turn"]',
      downloadButton: 'button[aria-label*="Download"], a[download]',
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
        '#prompt-textarea',
        'div[contenteditable="true"][id="prompt-textarea"]',
        '[contenteditable="true"]',
        'textarea'
      ]);
    },

    // ─── Inject Prompt ──────────────────────────────────────────────
    async injectPrompt(text) {
      const input = this.findInput();
      if (!input) throw new Error('Could not find ChatGPT input field');

      input.focus();
      input.click();
      await window.MetaUtils.sleep(300);

      if (input.contentEditable === 'true') {
        // ChatGPT uses a contenteditable div — set via paragraph
        input.innerHTML = '';
        input.focus();
        await window.MetaUtils.sleep(100);

        // Create paragraph element (ChatGPT uses <p> inside contenteditable)
        const p = document.createElement('p');
        p.textContent = text;
        input.appendChild(p);

        // Fire input event for React detection
        input.dispatchEvent(new Event('input', { bubbles: true }));
      } else if (input.tagName === 'TEXTAREA') {
        // Textarea fallback — use native setter to bypass React
        const nativeInputValueSetter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set;
        nativeInputValueSetter.call(input, text);
        input.dispatchEvent(new Event('input', { bubbles: true }));
      } else {
        input.value = text;
        input.dispatchEvent(new Event('input', { bubbles: true }));
      }

      input.dispatchEvent(new Event('change', { bubbles: true }));
      await window.MetaUtils.sleep(200);
      return { success: true };
    },

    // ─── Click Send ─────────────────────────────────────────────────
    async clickSend() {
      // Wait briefly for send button to become active
      await window.MetaUtils.sleep(300);

      const sendSelectors = [
        this.selectors.sendButton,
        this.selectors.sendButtonFallback,
        'button[data-testid="send-button"]',
        'button[aria-label="Send prompt"]',
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

      // Fallback: Enter key on input
      const input = this.findInput();
      if (input) {
        input.dispatchEvent(new KeyboardEvent('keydown', {
          key: 'Enter', code: 'Enter', keyCode: 13,
          bubbles: true
        }));
        await window.MetaUtils.sleep(50);
        input.dispatchEvent(new KeyboardEvent('keyup', {
          key: 'Enter', code: 'Enter', keyCode: 13,
          bubbles: true
        }));
      }
    },

    // ─── Switch Mode ────────────────────────────────────────────────
    async switchMode(mode) {
      // ChatGPT doesn't have separate image/video tabs
      // Image gen is prompt-based ("Generate an image of...")
      return { success: true };
    },

    // ─── Select Model ───────────────────────────────────────────────
    async selectModel() {
      // ChatGPT model selection is automatic
      return { success: true };
    },

    // ─── Upload Reference ───────────────────────────────────────────
    async uploadReference(data) {
      try {
        // Click the attach/upload button
        const uploadBtn = this.findElement([
          this.selectors.imageUploadButton,
          'button[aria-label*="Attach"]',
          'button[aria-label*="upload"]',
        ]);

        if (uploadBtn) {
          uploadBtn.click();
          await window.MetaUtils.sleep(500);
        }

        let fileInput = document.querySelector('input[type="file"]');
        if (!fileInput) return { success: false, error: 'No file input found on ChatGPT' };

        if (data.dataUrl) {
          const res = await fetch(data.dataUrl);
          const blob = await res.blob();
          const file = new File([blob], data.filename || 'reference.png', { type: blob.type });
          const dt = new DataTransfer();
          dt.items.add(file);
          fileInput.files = dt.files;
          fileInput.dispatchEvent(new Event('change', { bubbles: true }));
          await window.MetaUtils.sleep(1500);
          return { success: true };
        }
        return { success: false, error: 'No image data' };
      } catch (e) {
        return { success: false, error: e.message };
      }
    },

    async uploadMultipleReferences(images) {
      if (!images || images.length === 0) return { success: false };
      for (let i = 0; i < images.length; i++) {
        const dataUrl = typeof images[i] === 'string' ? images[i] : images[i].dataUrl;
        await this.uploadReference({ dataUrl, filename: `ref_${i}.png` });
        await window.MetaUtils.sleep(1000); 
      }
      return { success: true };
    },

    // ─── Get Content URLs ───────────────────────────────────────────
    getContentUrls() {
      const urls = [];
      // ChatGPT generated images
      document.querySelectorAll('img').forEach(img => {
        if (img.src && !img.src.includes('data:image/svg') && !img.src.includes('favicon') &&
            !img.src.includes('avatar') && !img.src.includes('icon') &&
            (img.src.includes('oaidalleapiprodscus') || img.src.includes('blob:') ||
             img.naturalWidth > 200)) {
          urls.push(img.src);
        }
      });
      return urls;
    },

    // ─── Check Loading ──────────────────────────────────────────────
    isLoading() {
      // ChatGPT streaming indicator
      const streaming = document.querySelector('.result-streaming, [class*="streaming"]');
      if (streaming) return true;
      
      // Also check for thinking/loading dots
      const dots = document.querySelector('[class*="loading"], [class*="thinking"]');
      return !!dots;
    }
  };

  window.PlatformAdapter = ChatGPTAdapter;
})();
