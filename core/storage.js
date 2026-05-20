/**
 * Meta Automator – Storage Wrapper
 */
const MetaStorage = {
  async get(key, defaultValue = null) {
    try {
      const result = await chrome.storage.local.get(key);
      return result[key] !== undefined ? result[key] : defaultValue;
    } catch (e) {
      console.error('[MetaStorage] Get error:', key, e);
      return defaultValue;
    }
  },
  async set(key, value) {
    try { await chrome.storage.local.set({ [key]: value }); }
    catch (e) { console.error('[MetaStorage] Set error:', key, e); }
  },
  async remove(key) {
    try { await chrome.storage.local.remove(key); }
    catch (e) { console.error('[MetaStorage] Remove error:', key, e); }
  },
  async getSettings() {
    const s = await this.get('meta_automator_settings', {});
    const d = (window.META_CONSTANTS || {}).DEFAULT_SETTINGS || {};
    return { ...d, ...s };
  },
  async saveSettings(settings) {
    await this.set('meta_automator_settings', settings);
  },
  async updateSettings(partial) {
    const c = await this.getSettings();
    const u = { ...c, ...partial };
    await this.saveSettings(u);
    return u;
  },
  async getQueue() { return await this.get('meta_automator_queue', []); },
  async saveQueue(q) { await this.set('meta_automator_queue', q); },
  async getQueueState() { return await this.get('meta_automator_queue_state', 'idle'); },
  async setQueueState(s) { await this.set('meta_automator_queue_state', s); },
  async getDownloads() { return await this.get('meta_automator_downloads', []); },
  async addDownload(d) {
    const ds = await this.getDownloads();
    ds.push({ ...d, id: Date.now().toString(36) + Math.random().toString(36).substr(2,5), timestamp: new Date().toISOString() });
    await this.set('meta_automator_downloads', ds);
    return ds;
  },
  async clearDownloads() { await this.set('meta_automator_downloads', []); },
  async getGenerationCount() { return await this.get('meta_automator_gen_count', 0); },
  async incrementGenerationCount() {
    const c = await this.getGenerationCount();
    await this.set('meta_automator_gen_count', c + 1);
    return c + 1;
  },
  async resetGenerationCount() { await this.set('meta_automator_gen_count', 0); }
};
if (typeof window !== 'undefined') { window.MetaStorage = MetaStorage; }
