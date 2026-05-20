/**
 * Meta Automator – Utility Functions
 */

const MetaUtils = {
  /**
   * Generate a random delay between min and max (inclusive)
   */
  randomDelay(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  },

  /**
   * Sleep for a given number of milliseconds
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  },

  /**
   * Sleep for a random duration between min and max
   */
  async randomSleep(min, max) {
    const delay = this.randomDelay(min, max);
    await this.sleep(delay);
    return delay;
  },

  /**
   * Generate a unique ID
   */
  generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
  },

  /**
   * Format a timestamp for filenames
   */
  formatTimestamp(date = new Date()) {
    return date.toISOString().replace(/[:.]/g, '-').slice(0, 19);
  },

  /**
   * Generate a filename from a template
   */
  generateFilename(template, data) {
    let filename = template;
    const replacements = {
      '{prompt}': (data.prompt || 'untitled').slice(0, 50).replace(/[^a-zA-Z0-9\s-]/g, '').trim().replace(/\s+/g, '_'),
      '{index}': String(data.index || 0).padStart(4, '0'),
      '{timestamp}': this.formatTimestamp(),
      '{mode}': data.mode || 'image',
      '{id}': this.generateId()
    };

    for (const [key, value] of Object.entries(replacements)) {
      filename = filename.replace(key, value);
    }

    return filename;
  },

  /**
   * Parse a TXT file content into an array of prompts (one per line)
   */
  parsePromptFile(content) {
    return content
      .split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 0 && !line.startsWith('#'));
  },

  /**
   * Read a file as text
   */
  readFileAsText(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(reader.error);
      reader.readAsText(file);
    });
  },

  /**
   * Read a file as data URL
   */
  readFileAsDataURL(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });
  },

  /**
   * Convert download history to CSV
   */
  exportToCSV(downloads) {
    const headers = ['Index', 'Prompt', 'Mode', 'Status', 'Filename', 'Timestamp', 'URL'];
    const rows = downloads.map((d, i) => [
      i + 1,
      `"${(d.prompt || '').replace(/"/g, '""')}"`,
      d.mode || 'image',
      d.status || 'completed',
      d.filename || '',
      d.timestamp || '',
      d.url || ''
    ]);

    const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    return csv;
  },

  /**
   * Download a string as a file
   */
  downloadStringAsFile(content, filename, mimeType = 'text/csv') {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  },

  /**
   * Truncate text to a maximum length
   */
  truncate(text, maxLength = 100) {
    if (!text) return '';
    return text.length > maxLength ? text.slice(0, maxLength) + '...' : text;
  },

  /**
   * Sanitize a string for use as a filename
   */
  sanitizeFilename(name) {
    return name
      .replace(/[<>:"/\\|?*]/g, '')
      .replace(/\s+/g, '_')
      .slice(0, 100);
  },

  /**
   * Debounce function
   */
  debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
      const later = () => {
        clearTimeout(timeout);
        func(...args);
      };
      clearTimeout(timeout);
      timeout = setTimeout(later, wait);
    };
  },

  /**
   * Format bytes to human readable
   */
  formatBytes(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }
};

// Make available globally for content scripts
if (typeof window !== 'undefined') {
  window.MetaUtils = MetaUtils;
}
