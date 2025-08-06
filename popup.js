// PromptHive Enhanced Popup Script - FIXED VERSION
// Fixes: Duplicate prompt creation, floating button save, version history
class PromptHive {
  constructor() {
    this.prompts = [];
    this.editingPromptId = null;
    this.filteredPrompts = [];
    this.db = null;
    this.currentPromptHistory = [];
    this.currentEnhancingPromptId = null;
    this.isInitialized = false;
    this.saveInProgress = new Set(); // Track saves in progress
    this.stats = {
      totalPrompts: 0,
      totalTags: 0,
      totalUses: 0,
      avgUses: 0,
      dailyActiveUsers: 1,
      totalInstalls: 1,
      recentActivity: 0,
      promptReuseRate: 0,
      mostUsedPrompt: null,
      categoryBreakdown: {},
      popularTags: []
    };
    this.init();
  }

  async init() {
    if (this.isInitialized) return;
    
    try {
      console.log('Initializing PromptHive...');
      
      // Initialize IndexedDB first
      await this.initDB();
      console.log('Database initialized');
      
      // Load prompts from IndexedDB
      await this.loadPrompts();
      console.log('Prompts loaded');
      
      // Migrate old Chrome storage data if exists
      await this.migrateFromChromeStorage();
      
      // Bind events
      this.bindEvents();
      this.setupKeyboardShortcuts();
      
      // Listen for messages from content script
      this.setupMessageListener();
      
      this.isInitialized = true;
      console.log('PromptHive initialized successfully');
    } catch (error) {
      console.error('Failed to initialize PromptHive:', error);
      // Still bind events even if DB fails
      this.bindEvents();
      this.render();
    }
  }

  setupMessageListener() {
    // Listen for messages from content script and background
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
      console.log('Popup received message:', request.action);
      
      if (request.action === 'promptSaved') {
        // Refresh prompts when content script saves a prompt
        this.loadPrompts().then(() => {
          console.log('Prompts refreshed after external save');
        });
      }
      
      return true;
    });
  }

  async initDB() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open('PromptHiveDB', 3);
      
      request.onerror = () => {
        console.error('Database failed to open:', request.error);
        reject(request.error);
      };
      
      request.onsuccess = () => {
        this.db = request.result;
        console.log('Database opened successfully');
        resolve();
      };
      
      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        console.log('Database upgrade needed, creating/updating stores...');
        
        // Create prompts store with enhanced schema
        if (!db.objectStoreNames.contains('prompts')) {
          const promptStore = db.createObjectStore('prompts', { keyPath: 'id' });
          promptStore.createIndex('title', 'title', { unique: false });
          promptStore.createIndex('tags', 'tags', { unique: false, multiEntry: true });
          promptStore.createIndex('createdAt', 'createdAt', { unique: false });
          promptStore.createIndex('updatedAt', 'updatedAt', { unique: false });
          promptStore.createIndex('uses', 'uses', { unique: false });
          promptStore.createIndex('version', 'version', { unique: false });
        }
        
        // Create prompt history store
        if (!db.objectStoreNames.contains('promptHistory')) {
          const historyStore = db.createObjectStore('promptHistory', { keyPath: 'historyId' });
          historyStore.createIndex('promptId', 'promptId', { unique: false });
          historyStore.createIndex('version', 'version', { unique: false });
          historyStore.createIndex('createdAt', 'createdAt', { unique: false });
        }

        // Create analytics store for activity tracking
        if (!db.objectStoreNames.contains('analytics')) {
          const analyticsStore = db.createObjectStore('analytics', { keyPath: 'id', autoIncrement: true });
          analyticsStore.createIndex('action', 'action', { unique: false });
          analyticsStore.createIndex('timestamp', 'timestamp', { unique: false });
          analyticsStore.createIndex('date', 'date', { unique: false });
        }

        // Create settings store
        if (!db.objectStoreNames.contains('settings')) {
          const settingsStore = db.createObjectStore('settings', { keyPath: 'key' });
        }

        // Initialize default settings
        event.target.transaction.oncomplete = () => {
          this.initializeDefaultSettings();
        };
      };
    });
  }

  async initializeDefaultSettings() {
    try {
      // Set install date if not exists
      const installDate = await this.getSetting('installDate');
      if (!installDate) {
        await this.setSetting('installDate', new Date().toISOString());
      }

      // Track daily active user
      await this.trackDailyActivity();
    } catch (error) {
      console.error('Failed to initialize default settings:', error);
    }
  }

  async trackDailyActivity() {
    try {
      const today = new Date().toISOString().split('T')[0];
      const lastActiveDate = await this.getSetting('lastActiveDate');
      
      if (lastActiveDate !== today) {
        await this.setSetting('lastActiveDate', today);
        
        // Log daily activity
        await this.logAnalytics('daily_active', { date: today });
      }
    } catch (error) {
      console.error('Failed to track daily activity:', error);
    }
  }

  async getSetting(key, defaultValue = null) {
    if (!this.db) return defaultValue;
    
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(['settings'], 'readonly');
      const store = transaction.objectStore('settings');
      const request = store.get(key);
      
      request.onsuccess = () => {
        const result = request.result;
        resolve(result ? result.value : defaultValue);
      };
      request.onerror = () => {
        console.error('Error getting setting:', key, request.error);
        resolve(defaultValue);
      };
    });
  }

  async setSetting(key, value) {
    if (!this.db) return;
    
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(['settings'], 'readwrite');
      const store = transaction.objectStore('settings');
      const request = store.put({
        key: key,
        value: value,
        updatedAt: new Date().toISOString()
      });
      
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async logAnalytics(action, metadata = {}) {
    if (!this.db) return;
    
    try {
      const transaction = this.db.transaction(['analytics'], 'readwrite');
      const store = transaction.objectStore('analytics');
      
      await new Promise((resolve, reject) => {
        const request = store.add({
          action: action,
          metadata: metadata,
          timestamp: new Date().toISOString(),
          date: new Date().toISOString().split('T')[0]
        });
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      });
    } catch (error) {
      console.error('Failed to log analytics:', error);
    }
  }

  async migrateFromChromeStorage() {
    try {
      const data = await chrome.storage.local.get("prompts");
      if (data.prompts && data.prompts.length > 0) {
        console.log('Migrating prompts from Chrome storage to IndexedDB...');
        
        for (const prompt of data.prompts) {
          // Check if prompt already exists to prevent duplicates
          const exists = await this.getPromptById(prompt.id);
          if (!exists) {
            // Enhance prompt with new fields if missing
            const enhancedPrompt = {
              ...prompt,
              id: prompt.id || Date.now().toString() + Math.random().toString(36).substr(2, 9),
              version: prompt.version || 1,
              createdAt: prompt.createdAt || new Date().toISOString(),
              updatedAt: prompt.updatedAt || new Date().toISOString(),
              uses: prompt.uses || 0,
              category: prompt.category || 'general'
            };
            await this.savePromptToDB(enhancedPrompt);
          }
        }
        
        // Clear Chrome storage after migration
        await chrome.storage.local.remove("prompts");
        
        // Reload prompts from DB
        await this.loadPrompts();
        
        this.showNotification(`Migrated ${data.prompts.length} prompts to local database`);
      }
    } catch (error) {
      console.warn('Migration failed:', error);
    }
  }

  async getPromptById(id) {
    if (!this.db) return null;
    
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(['prompts'], 'readonly');
      const store = transaction.objectStore('prompts');
      const request = store.get(id);
      
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(null);
    });
  }

  async loadPrompts() {
    try {
      if (!this.db) {
        console.warn('Database not initialized, using empty prompts array');
        this.prompts = [];
        this.filteredPrompts = [];
        this.render();
        return;
      }

      const transaction = this.db.transaction(['prompts'], 'readonly');
      const store = transaction.objectStore('prompts');
      
      return new Promise((resolve, reject) => {
        const request = store.getAll();
        
        request.onsuccess = () => {
          // Remove duplicates based on ID and keep the most recent version
          const promptsMap = new Map();
          request.result.forEach(prompt => {
            const existingPrompt = promptsMap.get(prompt.id);
            if (!existingPrompt || 
                new Date(prompt.updatedAt || prompt.createdAt) > new Date(existingPrompt.updatedAt || existingPrompt.createdAt)) {
              promptsMap.set(prompt.id, prompt);
            }
          });
          
          this.prompts = Array.from(promptsMap.values()).sort((a, b) => 
            new Date(b.updatedAt || b.createdAt) - new Date(a.updatedAt || a.createdAt)
          );
          this.filteredPrompts = [...this.prompts]; // Create a copy
          this.render();
          this.calculateStats();
          this.updateStats();
          console.log(`Loaded ${this.prompts.length} unique prompts from database`);
          resolve();
        };
        
        request.onerror = () => {
          console.error('Error loading prompts:', request.error);
          this.prompts = [];
          this.filteredPrompts = [];
          this.render();
          reject(request.error);
        };
      });
    } catch (error) {
      console.error('Error loading prompts:', error);
      this.prompts = [];
      this.filteredPrompts = [];
      this.render();
    }
  }

  async calculateStats() {
    const allTags = new Set();
    let totalUses = 0;
    const categoryBreakdown = {};
    const tagCount = {};

    this.prompts.forEach(prompt => {
      // Count total uses
      totalUses += prompt.uses || 0;

      // Collect unique tags
      prompt.tags.forEach(tag => {
        allTags.add(tag);
        tagCount[tag] = (tagCount[tag] || 0) + 1;
      });

      // Category breakdown
      const category = prompt.category || 'general';
      categoryBreakdown[category] = (categoryBreakdown[category] || 0) + 1;
    });

    // Find most used prompt
    const mostUsedPrompt = this.prompts.reduce((max, prompt) => 
      (prompt.uses || 0) > (max.uses || 0) ? prompt : max, 
      this.prompts[0] || null
    );

    // Get popular tags (top 10 by usage)
    const popularTags = Object.entries(tagCount)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 10)
      .map(([tag, count]) => ({ tag, count }));

    // Calculate reuse rate (prompts used more than once / total prompts)
    const reusedPrompts = this.prompts.filter(p => (p.uses || 0) > 1).length;
    const promptReuseRate = this.prompts.length > 0 ? Math.round((reusedPrompts / this.prompts.length) * 100) : 0;

    // Get analytics data
    const recentActivity = await this.getRecentActivity();
    const dailyActiveUsers = await this.getDailyActiveUsers();
    const totalInstalls = await this.getTotalInstalls();

    this.stats = {
      totalPrompts: this.prompts.length,
      totalTags: allTags.size,
      totalUses: totalUses,
      avgUses: this.prompts.length > 0 ? Math.round(totalUses / this.prompts.length * 10) / 10 : 0,
      dailyActiveUsers: dailyActiveUsers,
      totalInstalls: totalInstalls,
      recentActivity: recentActivity,
      promptReuseRate: promptReuseRate,
      mostUsedPrompt: mostUsedPrompt,
      categoryBreakdown: categoryBreakdown,
      popularTags: popularTags
    };
  }

  async getRecentActivity() {
    if (!this.db) return 0;
    
    try {
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      const cutoffDate = sevenDaysAgo.toISOString().split('T')[0];
      
      const transaction = this.db.transaction(['analytics'], 'readonly');
      const store = transaction.objectStore('analytics');
      const index = store.index('date');
      
      return new Promise((resolve, reject) => {
        const range = IDBKeyRange.lowerBound(cutoffDate);
        const request = index.count(range);
        
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => resolve(0);
      });
    } catch (error) {
      return 0;
    }
  }

  async getDailyActiveUsers() {
    return 1;
  }

  async getTotalInstalls() {
    return 1;
  }

  async savePromptToDB(prompt) {
    if (!this.db) {
      throw new Error('Database not initialized');
    }

    // Create unique save identifier to prevent concurrent saves
    const saveId = `${prompt.id}_${Date.now()}`;
    
    if (this.saveInProgress.has(prompt.id)) {
      console.log('Save already in progress for prompt:', prompt.id);
      return;
    }
    
    this.saveInProgress.add(prompt.id);
    
    try {
      return new Promise((resolve, reject) => {
        const transaction = this.db.transaction(['prompts'], 'readwrite');
        const store = transaction.objectStore('prompts');
        const request = store.put(prompt);
        
        request.onsuccess = () => {
          console.log('Prompt saved to DB:', prompt.id);
          resolve();
        };
        request.onerror = () => {
          console.error('Error saving prompt to DB:', request.error);
          reject(request.error);
        };
        
        transaction.oncomplete = () => {
          this.saveInProgress.delete(prompt.id);
        };
        
        transaction.onerror = () => {
          this.saveInProgress.delete(prompt.id);
        };
      });
    } catch (error) {
      this.saveInProgress.delete(prompt.id);
      throw error;
    }
  }

  async savePromptHistory(promptId, oldPrompt, version) {
    if (!this.db) {
      console.warn('Database not initialized, skipping history save');
      return;
    }

    const historyEntry = {
      historyId: `${promptId}_v${version}_${Date.now()}`,
      promptId: promptId,
      version: version,
      title: oldPrompt.title,
      text: oldPrompt.text,
      tags: [...oldPrompt.tags], // Create a copy of the array
      createdAt: new Date().toISOString(),
      originalDate: oldPrompt.date,
      originalUses: oldPrompt.uses
    };

    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(['promptHistory'], 'readwrite');
      const store = transaction.objectStore('promptHistory');
      const request = store.put(historyEntry);
      
      request.onsuccess = () => {
        console.log('History saved:', historyEntry.historyId);
        resolve();
      };
      request.onerror = () => {
        console.error('Error saving history:', request.error);
        reject(request.error);
      };
    });
  }

  async getPromptHistory(promptId) {
    if (!this.db) {
      return [];
    }

    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(['promptHistory'], 'readonly');
      const store = transaction.objectStore('promptHistory');
      const index = store.index('promptId');
      const request = index.getAll(promptId);
      
      request.onsuccess = () => {
        const history = request.result.sort((a, b) => b.version - a.version);
        resolve(history);
      };
      request.onerror = () => reject(request.error);
    });
  }

  async enhanceWithAI(text) {
    // Mock AI enhancement - replace with actual AI API call
    return new Promise((resolve) => {
      setTimeout(() => {
        const enhanced = this.mockAIEnhancement(text);
        resolve(enhanced);
      }, 1500);
    });
  }

  mockAIEnhancement(text) {
    // Enhanced mock AI enhancement
    const enhancements = [
      "Optimize for clarity and effectiveness:",
      "Add context and specific examples to:",
      "Improve structure and actionability of:",
      "Make this more professional and detailed:",
      "Enhance with step-by-step guidance:"
    ];
    
    const suggestions = [
      "• Include specific examples and use cases",
      "• Add measurable outcomes and success criteria",
      "• Provide step-by-step implementation guide",
      "• Consider different scenarios and edge cases",
      "• Include relevant context and background information",
      "• Add troubleshooting tips and common pitfalls"
    ];
    
    const randomEnhancement = enhancements[Math.floor(Math.random() * enhancements.length)];
    const selectedSuggestions = suggestions
      .sort(() => 0.5 - Math.random())
      .slice(0, 4);
    
    return `${randomEnhancement}\n\n${text}\n\nAI Recommendations:\n${selectedSuggestions.join('\n')}`;
  }

  bindEvents() {
    try {
      // Search functionality
      const searchInput = document.getElementById("searchInput");
      if (searchInput) {
        searchInput.addEventListener("input", (e) => {
          this.search(e.target.value);
        });
      }

      // Add prompt button
      const addPromptBtn = document.getElementById("addPromptBtn");
      if (addPromptBtn) {
        addPromptBtn.addEventListener("click", (e) => {
          e.preventDefault();
          e.stopPropagation();
          this.openModal();
        });
      }

      // Export button
      const exportBtn = document.getElementById("exportBtn");
      if (exportBtn) {
        exportBtn.addEventListener("click", (e) => {
          e.preventDefault();
          e.stopPropagation();
          this.exportToCSV();
        });
      }

      // Dashboard button
      const dashboardBtn = document.getElementById("dashboardBtn");
      if (dashboardBtn) {
        dashboardBtn.addEventListener("click", (e) => {
          e.preventDefault();
          e.stopPropagation();
          this.openDashboard();
        });
      }

      // Modal events
      const savePromptBtn = document.getElementById("savePromptBtn");
      if (savePromptBtn) {
        savePromptBtn.addEventListener("click", (e) => {
          e.preventDefault();
          e.stopPropagation();
          this.savePrompt();
        });
      }

      const cancelBtn = document.getElementById("cancelBtn");
      if (cancelBtn) {
        cancelBtn.addEventListener("click", (e) => {
          e.preventDefault();
          e.stopPropagation();
          this.closeModal();
        });
      }

      // Enhancement modal events
      const keepOriginalBtn = document.getElementById("keepOriginalBtn");
      if (keepOriginalBtn) {
        keepOriginalBtn.addEventListener("click", (e) => {
          e.preventDefault();
          e.stopPropagation();
          this.useOriginalPrompt();
        });
      }

      const keepEnhancedBtn = document.getElementById("keepEnhancedBtn");
      if (keepEnhancedBtn) {
        keepEnhancedBtn.addEventListener("click", (e) => {
          e.preventDefault();
          e.stopPropagation();
          this.useEnhancedPrompt();
        });
      }

      const cancelEnhancementBtn = document.getElementById("cancelEnhancementBtn");
      if (cancelEnhancementBtn) {
        cancelEnhancementBtn.addEventListener("click", (e) => {
          e.preventDefault();
          e.stopPropagation();
          this.closeEnhancementModal();
        });
      }

      // History modal events
      const closeHistoryBtn = document.getElementById("closeHistoryBtn");
      if (closeHistoryBtn) {
        closeHistoryBtn.addEventListener("click", (e) => {
          e.preventDefault();
          e.stopPropagation();
          this.closeHistoryModal();
        });
      }

      // Dashboard modal events
      const closeDashboardBtn = document.getElementById("closeDashboardBtn");
      if (closeDashboardBtn) {
        closeDashboardBtn.addEventListener("click", (e) => {
          e.preventDefault();
          e.stopPropagation();
          this.closeDashboard();
        });
      }

      // Modal overlay clicks to close
      const modalOverlay = document.getElementById("modalOverlay");
      if (modalOverlay) {
        modalOverlay.addEventListener("click", (e) => {
          if (e.target === e.currentTarget) {
            this.closeModal();
          }
        });
      }

      const enhancementModalOverlay = document.getElementById("enhancementModalOverlay");
      if (enhancementModalOverlay) {
        enhancementModalOverlay.addEventListener("click", (e) => {
          if (e.target === e.currentTarget) {
            this.closeEnhancementModal();
          }
        });
      }

      const historyModalOverlay = document.getElementById("historyModalOverlay");
      if (historyModalOverlay) {
        historyModalOverlay.addEventListener("click", (e) => {
          if (e.target === e.currentTarget) {
            this.closeHistoryModal();
          }
        });
      }

      const dashboardModalOverlay = document.getElementById("dashboardModalOverlay");
      if (dashboardModalOverlay) {
        dashboardModalOverlay.addEventListener("click", (e) => {
          if (e.target === e.currentTarget) {
            this.closeDashboard();
          }
        });
      }

      console.log('Events bound successfully');
    } catch (error) {
      console.error('Error binding events:', error);
    }
  }

  setupKeyboardShortcuts() {
    document.addEventListener("keydown", (e) => {
      // Escape to close modals
      if (e.key === "Escape") {
        this.closeModal();
        this.closeEnhancementModal();
        this.closeHistoryModal();
        this.closeDashboard();
      }
      
      // Ctrl/Cmd + K to focus search
      if ((e.ctrlKey || e.metaKey) && e.key === "k") {
        e.preventDefault();
        const searchInput = document.getElementById("searchInput");
        if (searchInput) searchInput.focus();
      }

      // Ctrl/Cmd + N to add new prompt
      if ((e.ctrlKey || e.metaKey) && e.key === "n") {
        e.preventDefault();
        this.openModal();
      }

      // Ctrl/Cmd + D to open dashboard
      if ((e.ctrlKey || e.metaKey) && e.key === "d") {
        e.preventDefault();
        this.openDashboard();
      }
    });
  }

  search(query) {
    const searchTerm = query.toLowerCase().trim();
    
    if (!searchTerm) {
      this.filteredPrompts = [...this.prompts]; // Create a copy
    } else {
      this.filteredPrompts = this.prompts.filter(prompt => 
        prompt.title.toLowerCase().includes(searchTerm) ||
        prompt.text.toLowerCase().includes(searchTerm) ||
        prompt.tags.some(tag => tag.toLowerCase().includes(searchTerm))
      );
    }
    
    this.render();
  }

  render() {
    const container = document.getElementById("promptList");
    if (!container) {
      console.error('promptList container not found');
      return;
    }
    
    if (this.filteredPrompts.length === 0) {
      container.innerHTML = this.renderEmptyState();
      return;
    }

    container.innerHTML = this.filteredPrompts.map((prompt) => 
      this.renderPromptCard(prompt)
    ).join("");

    // Bind card events
    this.bindCardEvents();
  }

  renderPromptCard(prompt) {
    const truncatedText = prompt.text.length > 150 ? 
      prompt.text.substring(0, 150) + "..." : prompt.text;

    return `
      <div class="prompt-card" data-id="${prompt.id}">
        <div class="prompt-header">
          <div class="prompt-title">${this.escapeHtml(prompt.title)}</div>
          <div class="prompt-id">#${prompt.id.slice(-6)}</div>
        </div>
        <div class="prompt-meta">
          <div class="meta-left">
            <div class="meta-item">
              <span>📅</span>
              <span>${prompt.date}</span>
            </div>
            <div class="meta-item">
              <span>📊</span>
              <span>${prompt.uses || 0} uses</span>
            </div>
            ${prompt.version ? `
              <div class="meta-item">
                <span>📝</span>
                <span>v${prompt.version}</span>
              </div>
            ` : ''}
          </div>
          <div class="meta-right">
            <button class="icon-btn history-btn" data-id="${prompt.id}" data-tooltip="View History">
              <span>🕒</span>
            </button>
            <button class="icon-btn edit-btn" data-id="${prompt.id}" data-tooltip="Edit Prompt">
              <span>✏️</span>
            </button>
            <button class="icon-btn delete-btn" data-id="${prompt.id}" data-tooltip="Delete Prompt">
              <span>🗑️</span>
            </button>
          </div>
        </div>
        <div class="prompt-content">${this.escapeHtml(truncatedText)}</div>
        ${prompt.tags && prompt.tags.length > 0 ? `
          <div class="tags">
            ${prompt.tags.map(tag => `<span class="tag">${this.escapeHtml(tag)}</span>`).join("")}
          </div>
        ` : ""}
        <div class="actions">
          <button class="action-btn primary copy-btn" data-id="${prompt.id}">
            <span>📋</span>
            Copy & Use
          </button>
          <button class="action-btn enhance-btn" data-id="${prompt.id}">
            <span>🤖</span>
            AI Enhance
          </button>
        </div>
      </div>
    `;
  }

  renderEmptyState() {
    const isSearching = document.getElementById("searchInput")?.value?.trim() !== "";
    
    if (isSearching) {
      return `
        <div class="empty-state">
          <div class="empty-state-icon">🔍</div>
          <h3>No prompts found</h3>
          <p>Try adjusting your search terms or add a new prompt.</p>
        </div>
      `;
    }

    return `
      <div class="empty-state">
        <div class="empty-state-icon">🏠</div>
        <h3>Welcome to PromptHive!</h3>
        <p>Start building your prompt collection by adding your first prompt or right-clicking on any text to save it.</p>
      </div>
    `;
  }

  bindCardEvents() {
    // Copy buttons
    document.querySelectorAll(".copy-btn").forEach(btn => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const id = btn.dataset.id;
        this.copyPrompt(id);
      });
    });

    // Enhance buttons
    document.querySelectorAll(".enhance-btn").forEach(btn => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const id = btn.dataset.id;
        this.enhancePrompt(id);
      });
    });

    // Edit buttons
    document.querySelectorAll(".edit-btn").forEach(btn => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const id = btn.dataset.id;
        this.editPrompt(id);
      });
    });

    // Delete buttons
    document.querySelectorAll(".delete-btn").forEach(btn => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const id = btn.dataset.id;
        this.deletePrompt(id);
      });
    });

    // History buttons
    document.querySelectorAll(".history-btn").forEach(btn => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const id = btn.dataset.id;
        this.showPromptHistory(id);
      });
    });
  }

  async copyPrompt(id) {
    const prompt = this.prompts.find(p => p.id === id);
    if (!prompt) return;
    
    try {
      await navigator.clipboard.writeText(prompt.text);
      
      // Increment usage counter
      const updatedPrompt = {
        ...prompt,
        uses: (prompt.uses || 0) + 1,
        updatedAt: new Date().toISOString()
      };
      
      // Update in memory
      const index = this.prompts.findIndex(p => p.id === id);
      if (index !== -1) {
        this.prompts[index] = updatedPrompt;
      }
      
      // Save to database
      if (this.db) {
        await this.savePromptToDB(updatedPrompt);
      }
      
      // Log analytics
      await this.logAnalytics('prompt_used', { promptId: id });
      
      // Update display and stats
      this.search(document.getElementById("searchInput").value);
      this.calculateStats();
      this.updateStats();
      
      this.showNotification("Prompt copied to clipboard!");
    } catch (err) {
      console.error("Failed to copy text: ", err);
      this.showNotification("Failed to copy prompt", "error");
    }
  }

  async enhancePrompt(id) {
    const prompt = this.prompts.find(p => p.id === id);
    if (!prompt) return;
    
    // Show enhancement modal with loading state
    this.showEnhancementModal(prompt.text, "", true);
    
    try {
      const enhanced = await this.enhanceWithAI(prompt.text);
      this.showEnhancementModal(prompt.text, enhanced, false);
      this.currentEnhancingPromptId = id;
    } catch (error) {
      console.error("AI enhancement failed:", error);
      this.showNotification("AI enhancement failed. Please try again.", "error");
      this.closeEnhancementModal();
    }
  }

  editPrompt(id) {
    this.editingPromptId = id;
    const prompt = this.prompts.find(p => p.id === id);
    if (!prompt) return;
    
    document.getElementById("modalTitle").textContent = "Edit Prompt";
    document.getElementById("promptTitle").value = prompt.title;
    document.getElementById("promptText").value = prompt.text;
    document.getElementById("promptTags").value = prompt.tags ? prompt.tags.join(", ") : "";
    
    this.openModal();
  }

  async deletePrompt(id) {
    const prompt = this.prompts.find(p => p.id === id);
    if (!prompt) return;
    
    if (confirm(`Delete "${prompt.title}"?\n\nThis action cannot be undone.`)) {
      try {
        // Delete from IndexedDB
        if (this.db) {
          const transaction = this.db.transaction(['prompts'], 'readwrite');
          const store = transaction.objectStore('prompts');
          await new Promise((resolve, reject) => {
            const request = store.delete(id);
            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
          });
        }
        
        // Remove from memory
        const index = this.prompts.findIndex(p => p.id === id);
        if (index !== -1) {
          this.prompts.splice(index, 1);
        }
        
        // Log analytics
        await this.logAnalytics('prompt_deleted', { promptId: id });
        
        this.search(document.getElementById("searchInput").value);
        this.calculateStats();
        this.updateStats();
        this.showNotification("Prompt deleted successfully");
      } catch (error) {
        console.error("Failed to delete prompt:", error);
        this.showNotification("Failed to delete prompt", "error");
      }
    }
  }

  async showPromptHistory(id) {
    const prompt = this.prompts.find(p => p.id === id);
    if (!prompt) return;
    
    try {
      const history = await this.getPromptHistory(id);
      this.renderHistoryModal(prompt, history);
    } catch (error) {
      console.error("Failed to load history:", error);
      this.showNotification("Failed to load prompt history", "error");
    }
  }

  renderHistoryModal(prompt, history) {
    document.getElementById("historyPromptTitle").textContent = prompt.title;
    
    const historyList = document.getElementById("historyList");
    
    if (history.length === 0) {
      historyList.innerHTML = `
        <div class="history-empty">
          <p>No history available for this prompt yet.</p>
        </div>
      `;
    } else {
      historyList.innerHTML = history.map(entry => `
        <div class="history-entry">
          <div class="history-header">
            <span class="history-version">Version ${entry.version}</span>
            <span class="history-date">${new Date(entry.createdAt).toLocaleString()}</span>
          </div>
          <div class="history-content">
            <strong>Title:</strong> ${this.escapeHtml(entry.title)}<br>
            <strong>Content:</strong> ${this.escapeHtml(entry.text.substring(0, 200))}${entry.text.length > 200 ? '...' : ''}
          </div>
          <div class="history-actions">
            <button class="action-btn restore-btn" onclick="promptHive.restoreFromHistory('${entry.historyId}', '${prompt.id}')">
              <span>↶</span> Restore
            </button>
          </div>
        </div>
      `).join("");
    }
    
    document.getElementById("historyModalOverlay").style.display = "flex";
  }

  async restoreFromHistory(historyId, promptId) {
    try {
      if (!this.db) {
        throw new Error('Database not available');
      }

      // Get history entry
      const transaction = this.db.transaction(['promptHistory'], 'readonly');
      const store = transaction.objectStore('promptHistory');
      const historyEntry = await new Promise((resolve, reject) => {
        const request = store.get(historyId);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      
      if (!historyEntry) {
        throw new Error('History entry not found');
      }
      
      // Find current prompt
      const promptIndex = this.prompts.findIndex(p => p.id === promptId);
      if (promptIndex === -1) {
        throw new Error('Prompt not found');
      }
      
      const currentPrompt = this.prompts[promptIndex];
      
      // Save current version to history before restoring
      const currentVersion = currentPrompt.version || 1;
      await this.savePromptHistory(promptId, currentPrompt, currentVersion);
      
      // Restore from history
      const restoredPrompt = {
        ...currentPrompt,
        title: historyEntry.title,
        text: historyEntry.text,
        tags: [...historyEntry.tags],
        version: (currentVersion + 1),
        updatedAt: new Date().toISOString()
      };
      
      // Update in memory
      this.prompts[promptIndex] = restoredPrompt;
      
      // Save to database
      if (this.db) {
        await this.savePromptToDB(restoredPrompt);
      }
      
      // Log analytics
      await this.logAnalytics('prompt_restored', { promptId: promptId, fromVersion: historyEntry.version });
      
      this.closeHistoryModal();
      this.search(document.getElementById("searchInput").value);
      this.calculateStats();
      this.updateStats();
      this.showNotification(`Restored to version ${historyEntry.version}`);
      
    } catch (error) {
      console.error("Failed to restore from history:", error);
      this.showNotification("Failed to restore from history", "error");
    }
  }

  showEnhancementModal(original, enhanced, loading = false) {
    document.getElementById("originalPrompt").textContent = original;
    
    const enhancedContainer = document.getElementById("enhancedPrompt");
    const keepEnhancedBtn = document.getElementById("keepEnhancedBtn");
    
    if (loading) {
      enhancedContainer.innerHTML = `
        <div class="loading-enhancement">
          <div class="spinner"></div>
          <p>AI is enhancing your prompt...</p>
        </div>
      `;
      if (keepEnhancedBtn) keepEnhancedBtn.disabled = true;
    } else {
      enhancedContainer.textContent = enhanced;
      if (keepEnhancedBtn) keepEnhancedBtn.disabled = false;
    }
    
    document.getElementById("enhancementModalOverlay").style.display = "flex";
  }

  useOriginalPrompt() {
    this.closeEnhancementModal();
    this.showNotification("Using original prompt");
  }

  async useEnhancedPrompt() {
    const enhancedText = document.getElementById("enhancedPrompt").textContent;
    const prompt = this.prompts.find(p => p.id === this.currentEnhancingPromptId);
    
    if (!prompt) {
      this.showNotification("Prompt not found", "error");
      return;
    }
    
    try {
      // Save current version to history
      const currentVersion = prompt.version || 1;
      await this.savePromptHistory(prompt.id, prompt, currentVersion);
      
      // Update with enhanced version
      const updatedPrompt = {
        ...prompt,
        text: enhancedText,
        version: currentVersion + 1,
        updatedAt: new Date().toISOString()
      };
      
      // Update in memory
      const index = this.prompts.findIndex(p => p.id === prompt.id);
      if (index !== -1) {
        this.prompts[index] = updatedPrompt;
      }
      
      if (this.db) {
        await this.savePromptToDB(updatedPrompt);
      }
      
      // Log analytics
      await this.logAnalytics('prompt_enhanced', { promptId: prompt.id });
      
      this.closeEnhancementModal();
      this.search(document.getElementById("searchInput").value);
      this.calculateStats();
      this.updateStats();
      this.showNotification("Prompt enhanced successfully!");
    } catch (error) {
      console.error("Failed to save enhanced prompt:", error);
      this.showNotification("Failed to save enhanced prompt", "error");
    }
  }

  closeEnhancementModal() {
    document.getElementById("enhancementModalOverlay").style.display = "none";
    this.currentEnhancingPromptId = null;
  }

  closeHistoryModal() {
    document.getElementById("historyModalOverlay").style.display = "none";
  }

  openDashboard() {
    this.calculateStats();
    this.renderDashboard();
    document.getElementById("dashboardModalOverlay").style.display = "flex";
  }

  closeDashboard() {
    document.getElementById("dashboardModalOverlay").style.display = "none";
  }

  renderDashboard() {
    // Update dashboard stats cards
    document.getElementById("dashTotalPrompts").textContent = this.stats.totalPrompts || 0;
    document.getElementById("dashTotalTags").textContent = this.stats.totalTags || 0;
    document.getElementById("dashTotalUses").textContent = this.stats.totalUses || 0;
    document.getElementById("dashAvgUses").textContent = this.stats.avgUses || 0;
    document.getElementById("dashDailyActive").textContent = this.stats.dailyActiveUsers || 0;
    document.getElementById("dashTotalInstalls").textContent = this.stats.totalInstalls || 0;
    document.getElementById("dashRecentActivity").textContent = this.stats.recentActivity || 0;
    document.getElementById("dashReuseRate").textContent = `${this.stats.promptReuseRate || 0}%`;

    // Render most used prompts
    const topPrompts = document.getElementById("topPrompts");
    const mostUsed = this.prompts
      .filter(p => p.uses > 0)
      .sort((a, b) => b.uses - a.uses)
      .slice(0, 5);

    if (mostUsed.length === 0) {
      topPrompts.innerHTML = `
        <div class="history-empty">
          <p>No prompts have been used yet.</p>
        </div>
      `;
    } else {
      topPrompts.innerHTML = mostUsed.map(prompt => `
        <div class="history-entry">
          <div class="history-header">
            <span class="history-version">${this.escapeHtml(prompt.title)}</span>
            <span class="history-date">${prompt.uses} uses</span>
          </div>
          <div class="history-content">
            ${this.escapeHtml(prompt.text.substring(0, 100))}${prompt.text.length > 100 ? '...' : ''}
          </div>
        </div>
      `).join("");
    }

    // Render category breakdown
    const categoryBreakdown = document.getElementById("categoryBreakdown");
    if (Object.keys(this.stats.categoryBreakdown).length === 0) {
      categoryBreakdown.innerHTML = `
        <div class="history-empty">
          <p>No categories available yet.</p>
        </div>
      `;
    } else {
      const categoryCards = Object.entries(this.stats.categoryBreakdown)
        .map(([category, count]) => `
          <div class="dashboard-card" style="margin-bottom: 0.5rem;">
            <div class="dashboard-card-icon">${this.getCategoryIcon(category)}</div>
            <div class="dashboard-card-value">${count}</div>
            <div class="dashboard-card-label">${this.capitalizeFirst(category)}</div>
          </div>
        `).join("");
      
      categoryBreakdown.innerHTML = `
        <div class="dashboard-grid" style="margin-bottom: 0;">
          ${categoryCards}
        </div>
      `;
    }

    // Render popular tags
    const popularTags = document.getElementById("popularTags");
    if (this.stats.popularTags.length === 0) {
      popularTags.innerHTML = `<span class="tag">No tags yet</span>`;
    } else {
      popularTags.innerHTML = this.stats.popularTags
        .map(({ tag, count }) => `
          <span class="tag" title="Used ${count} times">${this.escapeHtml(tag)} (${count})</span>
        `).join("");
    }
  }

  getCategoryIcon(category) {
    const icons = {
      'general': '📝',
      'coding': '💻',
      'writing': '✍️',
      'analysis': '📊',
      'creative': '🎨',
      'business': '💼',
      'education': '🎓',
      'personal': '👤'
    };
    return icons[category] || '📁';
  }

  capitalizeFirst(str) {
    return str.charAt(0).toUpperCase() + str.slice(1);
  }

  openModal() {
    if (this.editingPromptId === null) {
      document.getElementById("modalTitle").textContent = "Add New Prompt";
      document.getElementById("promptTitle").value = "";
      document.getElementById("promptText").value = "";
      document.getElementById("promptTags").value = "";
    }
    
    document.getElementById("modalOverlay").style.display = "flex";
    setTimeout(() => {
      document.getElementById("promptTitle").focus();
    }, 100);
  }

  closeModal() {
    document.getElementById("modalOverlay").style.display = "none";
    this.editingPromptId = null;
    
    // Clear form
    document.getElementById("promptTitle").value = "";
    document.getElementById("promptText").value = "";
    document.getElementById("promptTags").value = "";
  }

  async savePrompt() {
    const title = document.getElementById("promptTitle").value.trim();
    const text = document.getElementById("promptText").value.trim();
    const tagsInput = document.getElementById("promptTags").value.trim();
    
    if (!text) {
      this.showNotification("Prompt content is required", "error");
      document.getElementById("promptText").focus();
      return;
    }

    const tags = tagsInput ? 
      tagsInput.split(",").map(tag => tag.trim()).filter(tag => tag) : [];

    try {
      if (this.editingPromptId !== null) {
        // Editing existing prompt
        const promptIndex = this.prompts.findIndex(p => p.id === this.editingPromptId);
        if (promptIndex === -1) {
          throw new Error('Prompt not found');
        }
        
        const currentPrompt = this.prompts[promptIndex];
        const currentVersion = currentPrompt.version || 1;
        
        // Save current version to history first
        await this.savePromptHistory(currentPrompt.id, currentPrompt, currentVersion);
        
        // Update the existing prompt (same ID, incremented version)
        const updatedPrompt = {
          ...currentPrompt,
          title: title || "Untitled Prompt",
          text: text,
          tags: tags,
          version: currentVersion + 1,
          updatedAt: new Date().toISOString()
        };
        
        // Update in memory array
        this.prompts[promptIndex] = updatedPrompt;
        
        // Save to database
        if (this.db) {
          await this.savePromptToDB(updatedPrompt);
        }
        
        // Log analytics
        await this.logAnalytics('prompt_edited', { promptId: this.editingPromptId });
        
        this.showNotification("Prompt updated successfully");
      } else {
        // Creating new prompt
        const newPrompt = {
          id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
          title: title || "Untitled Prompt",
          text: text,
          tags: tags,
          date: new Date().toLocaleDateString(),
          uses: 0,
          version: 1,
          category: 'general',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        };
        
        // Save to database first
        if (this.db) {
          await this.savePromptToDB(newPrompt);
        }
        
        // Add to memory array
        this.prompts.unshift(newPrompt);
        
        // Log analytics
        await this.logAnalytics('prompt_created', { promptId: newPrompt.id });
        
        this.showNotification("Prompt added successfully");
      }

      // Refresh display
      this.search(document.getElementById("searchInput").value);
      this.calculateStats();
      this.updateStats();
      this.closeModal();
    } catch (error) {
      console.error("Failed to save prompt:", error);
      this.showNotification("Failed to save prompt", "error");
    }
  }

  exportToCSV() {
    if (this.prompts.length === 0) {
      this.showNotification("No prompts to export", "error");
      return;
    }

    const headers = ["ID", "Title", "Content", "Tags", "Date", "Uses", "Version", "Category", "Created", "Updated"];
    const csvContent = [
      headers.join(","),
      ...this.prompts.map(prompt => [
        `"${prompt.id}"`,
        `"${this.escapeCsv(prompt.title)}"`,
        `"${this.escapeCsv(prompt.text)}"`,
        `"${(prompt.tags || []).join("; ")}"`,
        `"${prompt.date}"`,
        prompt.uses || 0,
        prompt.version || 1,
        `"${prompt.category || 'general'}"`,
        `"${prompt.createdAt || ""}"`,
        `"${prompt.updatedAt || ""}"`
      ].join(","))
    ].join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    
    link.setAttribute("href", url);
    link.setAttribute("download", `prompts-${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = "hidden";
    
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    // Log analytics
    this.logAnalytics('data_exported', { count: this.prompts.length });

    this.showNotification(`Exported ${this.prompts.length} prompts to CSV`);
  }

  updateStats() {
    const totalPromptsEl = document.getElementById("totalPrompts");
    const totalTagsEl = document.getElementById("totalTags");
    const totalUsesEl = document.getElementById("totalUses");

    if (totalPromptsEl) totalPromptsEl.textContent = this.stats.totalPrompts || 0;
    if (totalTagsEl) totalTagsEl.textContent = this.stats.totalTags || 0;
    if (totalUsesEl) totalUsesEl.textContent = this.stats.totalUses || 0;
  }

  showNotification(message, type = "success") {
    const notification = document.getElementById("notification");
    if (!notification) return;

    notification.textContent = message;
    notification.style.display = "block";
    
    if (type === "error") {
      notification.style.background = "linear-gradient(135deg, #ef4444, #dc2626)";
    } else {
      notification.style.background = "linear-gradient(135deg, #10b981, #059669)";
    }

    setTimeout(() => {
      notification.style.display = "none";
    }, 3000);
  }

  escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
  }

  escapeCsv(text) {
    if (!text) return '';
    return text.replace(/"/g, '""');
  }
}

// Global reference for event handlers
let promptHive;

// Initialize the app when DOM is loaded
document.addEventListener("DOMContentLoaded", () => {
  console.log('DOM loaded, initializing PromptHive...');
  promptHive = new PromptHive();
});

// Also initialize if DOM is already loaded
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    console.log('DOM loaded, initializing PromptHive...');
    promptHive = new PromptHive();
  });
} else {
  console.log('DOM already loaded, initializing PromptHive immediately...');
  promptHive = new PromptHive();
}