// Enhanced Database Manager for PromptHive
class PromptHiveDatabase {
  constructor() {
    this.db = null;
    this.dbName = 'PromptHiveDB';
    this.dbVersion = 3;
  }

  async init() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.dbVersion);
      
      request.onerror = () => {
        console.error('Database failed to open:', request.error);
        reject(request.error);
      };
      
      request.onsuccess = () => {
        this.db = request.result;
        console.log('Database opened successfully');
        resolve(this.db);
      };
      
      request.onupgradeneeded = (event) => {
        this.db = event.target.result;
        console.log('Database upgrade needed, creating/updating stores...');
        
        // Create prompts store
        if (!this.db.objectStoreNames.contains('prompts')) {
          const promptStore = this.db.createObjectStore('prompts', { keyPath: 'id' });
          promptStore.createIndex('title', 'title', { unique: false });
          promptStore.createIndex('tags', 'tags', { unique: false, multiEntry: true });
          promptStore.createIndex('createdAt', 'createdAt', { unique: false });
          promptStore.createIndex('updatedAt', 'updatedAt', { unique: false });
          promptStore.createIndex('uses', 'uses', { unique: false });
          promptStore.createIndex('version', 'version', { unique: false });
          promptStore.createIndex('category', 'category', { unique: false });
        }
        
        // Create prompt history store
        if (!this.db.objectStoreNames.contains('promptHistory')) {
          const historyStore = this.db.createObjectStore('promptHistory', { keyPath: 'historyId' });
          historyStore.createIndex('promptId', 'promptId', { unique: false });
          historyStore.createIndex('version', 'version', { unique: false });
          historyStore.createIndex('createdAt', 'createdAt', { unique: false });
        }

        // Create categories store
        if (!this.db.objectStoreNames.contains('categories')) {
          const categoryStore = this.db.createObjectStore('categories', { keyPath: 'id' });
          categoryStore.createIndex('name', 'name', { unique: true });
          categoryStore.createIndex('createdAt', 'createdAt', { unique: false });
          categoryStore.createIndex('order', 'order', { unique: false });
        }

        // Create tags store
        if (!this.db.objectStoreNames.contains('tags')) {
          const tagStore = this.db.createObjectStore('tags', { keyPath: 'name' });
          tagStore.createIndex('usageCount', 'usageCount', { unique: false });
          tagStore.createIndex('createdAt', 'createdAt', { unique: false });
        }

        // Create analytics store
        if (!this.db.objectStoreNames.contains('analytics')) {
          const analyticsStore = this.db.createObjectStore('analytics', { keyPath: 'id', autoIncrement: true });
          analyticsStore.createIndex('promptId', 'promptId', { unique: false });
          analyticsStore.createIndex('action', 'action', { unique: false });
          analyticsStore.createIndex('timestamp', 'timestamp', { unique: false });
        }

        // Create settings store
        if (!this.db.objectStoreNames.contains('settings')) {
          const settingsStore = this.db.createObjectStore('settings', { keyPath: 'key' });
        }

        // Initialize default data
        event.target.transaction.oncomplete = () => {
          this.initializeDefaultData();
        };
      };
    });
  }

  async initializeDefaultData() {
    try {
      // Initialize default categories
      const defaultCategories = [
        {
          id: 'general',
          name: 'General',
          color: '#6b7280',
          description: 'General purpose prompts',
          order: 0,
          createdAt: new Date().toISOString()
        },
        {
          id: 'coding',
          name: 'Coding',
          color: '#3b82f6',
          description: 'Programming and development prompts',
          order: 1,
          createdAt: new Date().toISOString()
        },
        {
          id: 'writing',
          name: 'Writing',
          color: '#10b981',
          description: 'Content creation and writing prompts',
          order: 2,
          createdAt: new Date().toISOString()
        },
        {
          id: 'analysis',
          name: 'Analysis',
          color: '#f59e0b',
          description: 'Data analysis and research prompts',
          order: 3,
          createdAt: new Date().toISOString()
        },
        {
          id: 'creative',
          name: 'Creative',
          color: '#8b5cf6',
          description: 'Creative and artistic prompts',
          order: 4,
          createdAt: new Date().toISOString()
        }
      ];

      const transaction = this.db.transaction(['categories'], 'readwrite');
      const store = transaction.objectStore('categories');
      
      for (const category of defaultCategories) {
        await this.addToStore(store, category);
      }

      // Initialize settings
      await this.setSetting('version', '2.2', 'Extension version');
      await this.setSetting('initialized', true, 'Database initialization flag');
      await this.setSetting('lastMaintenance', new Date().toISOString(), 'Last maintenance run');

    } catch (error) {
      console.error('Failed to initialize default data:', error);
    }
  }

  // CRUD Operations for Prompts
  async createPrompt(promptData) {
    const prompt = {
      id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
      title: promptData.title || 'Untitled Prompt',
      text: promptData.text,
      tags: promptData.tags || [],
      category: promptData.category || 'general',
      date: new Date().toLocaleDateString(),
      uses: promptData.uses || 0,
      version: promptData.version || 1,
      source: promptData.source || null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      ...promptData
    };

    const transaction = this.db.transaction(['prompts'], 'readwrite');
    const store = transaction.objectStore('prompts');
    await this.addToStore(store, prompt);

    // Update tag counts
    await this.updateTagCounts(prompt.tags, 1);

    // Log analytics
    await this.logAnalytics(prompt.id, 'create', { category: prompt.category });

    return prompt;
  }

  async getPrompt(id) {
    const transaction = this.db.transaction(['prompts'], 'readonly');
    const store = transaction.objectStore('prompts');
    return await this.getFromStore(store, id);
  }

  async getAllPrompts(options = {}) {
    const transaction = this.db.transaction(['prompts'], 'readonly');
    const store = transaction.objectStore('prompts');
    
    let prompts = await this.getAllFromStore(store);
    
    if (options.sortBy) {
      prompts.sort((a, b) => {
        switch (options.sortBy) {
          case 'date':
            return new Date(b.updatedAt || b.createdAt) - new Date(a.updatedAt || a.createdAt);
          case 'uses':
            return b.uses - a.uses;
          case 'title':
            return a.title.localeCompare(b.title);
          default:
            return 0;
        }
      });
    }

    if (options.limit) {
      prompts = prompts.slice(0, options.limit);
    }

    return prompts;
  }

  async updatePrompt(id, updates) {
    const existing = await this.getPrompt(id);
    if (!existing) {
      throw new Error('Prompt not found');
    }

    const updated = {
      ...existing,
      ...updates,
      updatedAt: new Date().toISOString()
    };

    const transaction = this.db.transaction(['prompts'], 'readwrite');
    const store = transaction.objectStore('prompts');
    await this.addToStore(store, updated);

    // Update tag counts if tags changed
    if (updates.tags && JSON.stringify(existing.tags) !== JSON.stringify(updates.tags)) {
      await this.updateTagCounts(existing.tags, -1);
      await this.updateTagCounts(updates.tags, 1);
    }

    // Log analytics
    await this.logAnalytics(id, 'update', { fields: Object.keys(updates) });

    return updated;
  }

  async deletePrompt(id) {
    const existing = await this.getPrompt(id);
    if (!existing) {
      throw new Error('Prompt not found');
    }

    const transaction = this.db.transaction(['prompts'], 'readwrite');
    const store = transaction.objectStore('prompts');
    await this.deleteFromStore(store, id);

    // Update tag counts
    await this.updateTagCounts(existing.tags, -1);

    // Log analytics
    await this.logAnalytics(id, 'delete', { category: existing.category });

    return true;
  }

  // Search functionality
  async searchPrompts(query, options = {}) {
    const allPrompts = await this.getAllPrompts();
    const searchTerm = query.toLowerCase().trim();
    
    if (!searchTerm) {
      return allPrompts;
    }

    const results = allPrompts.filter(prompt => {
      const titleMatch = prompt.title.toLowerCase().includes(searchTerm);
      const textMatch = prompt.text.toLowerCase().includes(searchTerm);
      const tagMatch = prompt.tags.some(tag => tag.toLowerCase().includes(searchTerm));
      const categoryMatch = prompt.category && prompt.category.toLowerCase().includes(searchTerm);
      
      return titleMatch || textMatch || tagMatch || categoryMatch;
    });

    // Simple relevance scoring
    return results.map(prompt => {
      let score = 0;
      if (prompt.title.toLowerCase().includes(searchTerm)) score += 3;
      if (prompt.text.toLowerCase().includes(searchTerm)) score += 2;
      if (prompt.tags.some(tag => tag.toLowerCase().includes(searchTerm))) score += 1;
      return { ...prompt, relevanceScore: score };
    }).sort((a, b) => b.relevanceScore - a.relevanceScore);
  }

  // Tag management
  async updateTagCounts(tags, delta) {
    if (!Array.isArray(tags) || tags.length === 0) return;

    const transaction = this.db.transaction(['tags'], 'readwrite');
    const store = transaction.objectStore('tags');

    for (const tagName of tags) {
      if (!tagName.trim()) continue;

      try {
        const existing = await this.getFromStore(store, tagName);
        if (existing) {
          existing.usageCount = Math.max(0, existing.usageCount + delta);
          existing.updatedAt = new Date().toISOString();
          await this.addToStore(store, existing);
        } else if (delta > 0) {
          await this.addToStore(store, {
            name: tagName,
            usageCount: delta,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
          });
        }
      } catch (error) {
        console.error('Error updating tag count:', tagName, error);
      }
    }
  }

  async getAllTags() {
    const transaction = this.db.transaction(['tags'], 'readonly');
    const store = transaction.objectStore('tags');
    const tags = await this.getAllFromStore(store);
    return tags.sort((a, b) => b.usageCount - a.usageCount);
  }

  // Analytics
  async logAnalytics(promptId, action, metadata = {}) {
    try {
      const transaction = this.db.transaction(['analytics'], 'readwrite');
      const store = transaction.objectStore('analytics');
      
      await this.addToStore(store, {
        promptId,
        action,
        metadata,
        timestamp: new Date().toISOString(),
        userAgent: navigator.userAgent,
        url: metadata.url || null
      });
    } catch (error) {
      console.error('Failed to log analytics:', error);
    }
  }

  async getAnalytics(options = {}) {
    const transaction = this.db.transaction(['analytics'], 'readonly');
    const store = transaction.objectStore('analytics');
    
    let analytics = await this.getAllFromStore(store);
    
    if (options.since) {
      analytics = analytics.filter(entry => 
        new Date(entry.timestamp) >= new Date(options.since)
      );
    }

    if (options.action) {
      analytics = analytics.filter(entry => entry.action === options.action);
    }

    return analytics.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  }

  // Statistics
  async getStats() {
    const prompts = await this.getAllPrompts();
    const tags = await this.getAllTags();
    const analytics = await this.getAnalytics({ since: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) });

    return {
      totalPrompts: prompts.length,
      totalTags: tags.length,
      totalUses: prompts.reduce((sum, p) => sum + p.uses, 0),
      avgUsesPerPrompt: prompts.length > 0 ? prompts.reduce((sum, p) => sum + p.uses, 0) / prompts.length : 0,
      mostUsedPrompt: prompts.sort((a, b) => b.uses - a.uses)[0] || null,
      recentActivity: analytics.length,
      categoryBreakdown: this.getCategoryBreakdown(prompts),
      tagCloud: tags.slice(0, 20)
    };
  }

  getCategoryBreakdown(prompts) {
    const breakdown = {};
    prompts.forEach(prompt => {
      const category = prompt.category || 'general';
      breakdown[category] = (breakdown[category] || 0) + 1;
    });
    return breakdown;
  }

  // Settings management
  async setSetting(key, value, description = null) {
    const transaction = this.db.transaction(['settings'], 'readwrite');
    const store = transaction.objectStore('settings');
    
    await this.addToStore(store, {
      key,
      value,
      description,
      updatedAt: new Date().toISOString()
    });
  }

  async getSetting(key, defaultValue = null) {
    try {
      const transaction = this.db.transaction(['settings'], 'readonly');
      const store = transaction.objectStore('settings');
      const setting = await this.getFromStore(store, key);
      return setting ? setting.value : defaultValue;
    } catch (error) {
      return defaultValue;
    }
  }

  async getAllSettings() {
    const transaction = this.db.transaction(['settings'], 'readonly');
    const store = transaction.objectStore('settings');
    return await this.getAllFromStore(store);
  }

  // Data export/import
  async exportData(options = {}) {
    const data = {
      version: '2.2',
      exportDate: new Date().toISOString(),
      prompts: await this.getAllPrompts(),
      tags: await this.getAllTags()
    };

    if (options.includeHistory) {
      data.history = await this.getAllFromObjectStore('promptHistory');
    }

    if (options.includeAnalytics) {
      data.analytics = await this.getAnalytics();
    }

    if (options.includeSettings) {
      data.settings = await this.getAllSettings();
    }

    return data;
  }

  async importData(data, options = {}) {
    const results = {
      imported: 0,
      errors: 0,
      skipped: 0
    };

    if (data.prompts && Array.isArray(data.prompts)) {
      for (const prompt of data.prompts) {
        try {
          if (options.overwrite || !(await this.getPrompt(prompt.id))) {
            await this.createPrompt(prompt);
            results.imported++;
          } else {
            results.skipped++;
          }
        } catch (error) {
          console.error('Failed to import prompt:', prompt.id, error);
          results.errors++;
        }
      }
    }

    return results;
  }

  // Cleanup and maintenance
  async cleanup() {
    const cutoffDate = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000); // 90 days ago
    
    const transaction = this.db.transaction(['analytics'], 'readwrite');
    const store = transaction.objectStore('analytics');
    const index = store.index('timestamp');
    
    let deletedCount = 0;
    const request = index.openCursor(IDBKeyRange.upperBound(cutoffDate.toISOString()));
    
    return new Promise((resolve, reject) => {
      request.onsuccess = (event) => {
        const cursor = event.target.result;
        if (cursor) {
          cursor.delete();
          deletedCount++;
          cursor.continue();
        } else {
          resolve(deletedCount);
        }
      };
      request.onerror = () => reject(request.error);
    });
  }

  // Helper methods for IndexedDB operations
  async addToStore(store, data) {
    return new Promise((resolve, reject) => {
      const request = store.put(data);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async getFromStore(store, key) {
    return new Promise((resolve, reject) => {
      const request = store.get(key);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async getAllFromStore(store) {
    return new Promise((resolve, reject) => {
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async deleteFromStore(store, key) {
    return new Promise((resolve, reject) => {
      const request = store.delete(key);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async getAllFromObjectStore(storeName) {
    const transaction = this.db.transaction([storeName], 'readonly');
    const store = transaction.objectStore(storeName);
    return await this.getAllFromStore(store);
  }
}

// Export for use in background script
if (typeof module !== 'undefined' && module.exports) {
  module.exports = PromptHiveDatabase;
}