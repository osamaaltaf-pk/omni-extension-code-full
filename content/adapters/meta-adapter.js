/**
 * Omni Automator – Meta AI Platform Adapter
 * Handles all DOM interaction specifics for meta.ai
 */
(function() {
  'use strict';

  const MetaAdapter = {
    platform: 'meta',
    name: 'Meta AI',
    maxReferenceImages: 4,

    // ─── Selectors ──────────────────────────────────────────────────
    selectors: {
      chatInput: '[contenteditable="true"]',
      chatInputFallback: 'textarea',
      sendButton: '[aria-label="Send"], button[type="submit"]',
      sendButtonFallback: 'form button:last-of-type',
      createImageTab: '[role="tab"]',
      createVideoTab: '[role="tab"]',
      generatedImage: 'img[src*="scontent"], img[src*="blob:"], img[alt*="Generated"]',
      generatedVideo: 'video source, video[src]',
      fileInput: 'input[type="file"]',
      loadingIndicator: '[role="progressbar"], .loading, [class*="spinner"], [class*="loading"]',
      responseContainer: '[class*="response"], [class*="message"], [role="article"]',
      lastResponse: '[role="article"]:last-of-type, [class*="message"]:last-of-type',
      downloadButton: '[aria-label*="download"], [aria-label*="Download"]',
    },

    // Max reference images Meta AI accepts per prompt
    maxReferenceImages: 4,

    // ─── Find Element ───────────────────────────────────────────────
    findElement(selectors) {
      if (typeof selectors === 'string') selectors = [selectors];
      for (const sel of selectors) {
        try {
          if (sel.includes(':has-text(')) {
            const match = sel.match(/(.+):has-text\("(.+)"\)/);
            if (match) {
              const elements = document.querySelectorAll(match[1]);
              for (const el of elements) {
                if (el.textContent.includes(match[2])) return el;
              }
            }
            continue;
          }
          const el = document.querySelector(sel);
          if (el) return el;
        } catch (e) { /* next */ }
      }
      return null;
    },

    // ─── Find Upload Button ─────────────────────────────────────────
    findUploadButton() {
      // Try specific aria-labels first
      const ariaSelectors = [
        '[aria-label*="Add attachment"]',
        '[aria-label*="add attachment"]',
        '[aria-label*="Attach"]',
        '[aria-label*="attach"]',
        '[aria-label*="Upload"]',
        '[aria-label*="upload"]',
        '[aria-label*="Add image"]',
        '[aria-label*="add image"]',
        '[aria-label*="Add file"]',
      ];
      for (const sel of ariaSelectors) {
        try {
          const el = document.querySelector(sel);
          if (el) return el;
        } catch(e) {}
      }
      // Try finding by icon/svg inside buttons near the input area
      const allButtons = document.querySelectorAll('button');
      for (const btn of allButtons) {
        const label = (btn.getAttribute('aria-label') || '').toLowerCase();
        const text = btn.textContent.toLowerCase().trim();
        if (label.includes('attach') || label.includes('upload') || label.includes('add image') || 
            label.includes('add file') || label.includes('image') || text.includes('attach')) {
          return btn;
        }
      }
      return null;
    },

    // ─── Find Input ─────────────────────────────────────────────────
    findInput() {
      return this.findElement([this.selectors.chatInput, this.selectors.chatInputFallback, '[contenteditable="true"]', 'textarea']);
    },

    // ─── Inject Prompt ──────────────────────────────────────────────
    async injectPrompt(text) {
      const input = this.findInput();
      if (!input) throw new Error('Could not find Meta AI input field');

      input.focus();
      input.click();
      await window.MetaUtils.sleep(200);

      if (input.contentEditable === 'true') {
        input.innerHTML = '';
        input.focus();
        if (document.queryCommandSupported('insertText')) {
          document.execCommand('insertText', false, text);
        } else {
          input.textContent = text;
          input.dispatchEvent(new Event('input', { bubbles: true }));
        }
      } else {
        input.value = '';
        input.value = text;
        input.dispatchEvent(new Event('input', { bubbles: true }));
      }

      input.dispatchEvent(new Event('change', { bubbles: true }));
      input.blur();
      await window.MetaUtils.sleep(100);
      input.focus();
      await window.MetaUtils.sleep(100);
      return { success: true };
    },

    // ─── Click Send ─────────────────────────────────────────────────
    async clickSend() {
      const btn = this.findElement([this.selectors.sendButton, this.selectors.sendButtonFallback, '[aria-label="Send"]', 'button[type="submit"]']);
      if (!btn) {
        const input = this.findInput();
        if (input) {
          input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, bubbles: true }));
          await window.MetaUtils.sleep(100);
          input.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', code: 'Enter', keyCode: 13, bubbles: true }));
        }
        return;
      }
      btn.click();
    },

    // ─── Switch Mode (Image/Video tabs) ─────────────────────────────
    async switchMode(mode, phase) {
      const buttons = document.querySelectorAll('button, [role="tab"]');
      const targetText = (mode === 'video' || phase === 'video') ? 'video' : 'image';
      for (const btn of buttons) {
        if (btn.textContent.toLowerCase().includes(targetText) && btn.textContent.toLowerCase().includes('create')) {
          btn.click();
          await window.MetaUtils.sleep(1000);
          return { success: true };
        }
      }
      for (const btn of buttons) {
        if (btn.textContent.toLowerCase().includes(targetText)) {
          btn.click();
          await window.MetaUtils.sleep(1000);
          return { success: true };
        }
      }
      return { success: false, error: `Could not find ${targetText} tab` };
    },

    // ─── Upload Reference (single image) ────────────────────────────
    async uploadReference(data) {
      try {
        // First try to find existing file input
        let fileInput = document.querySelector('input[type="file"]');
        
        // If no file input visible, click the upload/attach button to reveal it
        if (!fileInput) {
          const uploadBtn = this.findUploadButton();
          if (uploadBtn) {
            console.log('[MetaAdapter] Clicking upload button:', uploadBtn.getAttribute('aria-label'));
            uploadBtn.click();
            await window.MetaUtils.sleep(800);
          }
        }

        fileInput = document.querySelector('input[type="file"]');
        if (!fileInput) {
          console.error('[MetaAdapter] No file input found after clicking upload button');
          return { success: false, error: 'No file input found' };
        }

        if (data.dataUrl) {
          const res = await fetch(data.dataUrl);
          const blob = await res.blob();
          const file = new File([blob], data.filename || 'reference.png', { type: blob.type });
          const dt = new DataTransfer();
          dt.items.add(file);
          fileInput.files = dt.files;
          fileInput.dispatchEvent(new Event('change', { bubbles: true }));
          await window.MetaUtils.sleep(1500);
          console.log('[MetaAdapter] Image uploaded successfully');
          return { success: true };
        }
        return { success: false, error: 'No image data' };
      } catch (e) {
        console.error('[MetaAdapter] Upload error:', e);
        return { success: false, error: e.message };
      }
    },

    // ─── Upload Multiple References (up to 4) ──────────────────────
    async uploadMultipleReferences(dataUrls) {
      if (!dataUrls || dataUrls.length === 0) return { success: false, error: 'No images' };
      
      const maxImages = Math.min(dataUrls.length, this.maxReferenceImages);
      let successCount = 0;

      for (let i = 0; i < maxImages; i++) {
        const result = await this.uploadReference({ 
          dataUrl: dataUrls[i], 
          filename: `reference_${i + 1}.png` 
        });
        if (result.success) {
          successCount++;
          // Wait between uploads for UI to process
          if (i < maxImages - 1) {
            await window.MetaUtils.sleep(1000);
          }
        } else {
          console.warn(`[MetaAdapter] Failed to upload image ${i + 1}:`, result.error);
        }
      }

      console.log(`[MetaAdapter] Uploaded ${successCount}/${maxImages} images`);
      return { success: successCount > 0, uploaded: successCount, total: maxImages };
    },

    // ─── Get Content URLs ───────────────────────────────────────────
    getContentUrls() {
      const urls = [];
      // Prefer images that look like generated content and have high resolution
      document.querySelectorAll('img').forEach(img => {
        const src = img.src || '';
        if (!src || src.includes('data:image')) return; // Skip small data URLs
        
        // Meta AI generated images usually have 'scontent' in URL or are blobs
        const isGenerated = src.includes('scontent') || src.includes('blob:');
        
        // Check dimensions to filter out icons/avatars (generated images are usually >= 512px)
        const isLarge = (img.naturalWidth >= 512 || img.naturalHeight >= 512 || img.width >= 512);
        
        if (isGenerated || isLarge) {
          // If it has a srcset, the last one is usually the highest res version
          if (img.srcset) {
            const sources = img.srcset.split(',').map(s => s.trim().split(' ')[0]);
            if (sources.length > 0) {
              urls.push(sources[sources.length - 1]);
              return;
            }
          }
          urls.push(src);
        }
      });

      // Also look for videos
      document.querySelectorAll('video, video source').forEach(vid => {
        const src = vid.src || vid.getAttribute('src');
        if (src) urls.push(src);
      });

      return [...new Set(urls)];
    },

    // ─── Check Loading ──────────────────────────────────────────────
    isLoading() {
      return !!this.findElement([this.selectors.loadingIndicator]);
    },

    // ─── Check Flagged Content ──────────────────────────────────────
    isFlagged() {
      const lastMsg = this.findElement(this.selectors.lastResponse);
      if (!lastMsg) return false;
      const text = lastMsg.textContent.toLowerCase();
      const flaggedPhrases = [
        "can't generate",
        "can't create",
        "can't do that",
        "violate our policies",
        "safety guidelines",
        "inappropriate",
        "sensitive content",
        "i'm sorry",
        "i am sorry"
      ];
      return flaggedPhrases.some(phrase => text.includes(phrase));
    },

    // ─── Select Model ───────────────────────────────────────────────
    async selectModel(model) {
      // Meta AI doesn't have model selection – no-op
      return { success: true };
    }
  };

  window.PlatformAdapter = MetaAdapter;
})();
