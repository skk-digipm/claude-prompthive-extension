// Enhanced Background script for PromptHive with improved database integration
class PromptHiveBackground {
  constructor() {
    this.db = null;
    this.dbManager = null;
    this.init();
  }

  async init() {
    try {
      // Initialize database manager
      this.dbManager = new PromptHiveDatabase();
      await this.dbManager.init();
      this.db = this.dbManager.db;
      
      this.setupContextMenus();
      this.setupMessageHandlers();
      this.setupAlarms();
      this.performMaintenance();
      
      console.log('PromptHive background script initialized successfully');
    } catch (error) {
      console.error('Failed to initialize PromptHive background script:', error);
    }
  }

  setupContextMenus() {
    chrome.runtime.onInstalled.addListener(() => {
      // Create context menu for saving selected text
      chrome.contextMenus.create({
        id: "savePromptToPromptHive",
        title: "Save to PromptHive",
        contexts: ["selection"],
        documentUrlPatterns: ["<all_urls>"]
      });

      // Create context menu for quick access to PromptHive
      chrome.contextMenus.create({
        id: "openPromptHive",
        title: "Open PromptHive",
        contexts: ["page", "action"],
        documentUrlPatterns: ["<all_urls>"]
      });

      // Create context menu for AI enhancement
      chrome.contextMenus.create({
        id: "enhancePromptWithAI",
        title: "Enhance with AI",
        contexts: ["selection"],
        documentUrlPatterns: ["<all_urls>"]
      });
    });

    // Handle context menu clicks
    chrome.contextMenus.onClicked.addListener(async (info, tab) => {
      try {
        if (info.menuItemId === "savePromptToPromptHive") {
          await this.handleSaveFromContextMenu(info, tab);
        } else if (info.menuItemId === "openPromptHive") {
          await this.handleOpenPromptHive();
        } else if (info.menuItemId === "enhancePromptWithAI") {
          await this.handleEnhanceFromContextMenu(info, tab);
        }
      } catch (error) {
        console.error('Context menu action failed:', error);
        this.showNotification('Action failed. Please try again.', 'error');
      }
    });
  }

  async handleSaveFromContextMenu(info, tab) {
    const text = info.selectionText;
    const url = tab.url;
    const title = tab.title;
    
    if (!text || text.length < 5) {
      this.showNotification('Selected text too short to save', 'error');
      return;
    }
    
    const promptData = {
      title: `Saved from ${this.truncateTitle(title)}`,
      text: text.trim(),
      tags: ["saved", "context-menu", this.detectPageType(url)],
      category: this.detectCategory(text, url),
      source: url
    };
    
    try {
      const savedPrompt = await this.dbManager.createPrompt(promptData);
      this.showNotification('Prompt saved successfully!', 'success');
      
      // Log analytics
      await this.dbManager.logAnalytics(savedPrompt.id, 'context_save', {
        source: 'context_menu',
        url: url,
        textLength: text.length
      });
    } catch (error) {
      console.error('Failed to save prompt:', error);
      this.showNotification('Failed to save prompt. Please try again.', 'error');
    }
  }

  async handleOpenPromptHive() {
    try {
      // Open PromptHive popup
      await chrome.action.openPopup();
    } catch (error) {
      // If popup fails, try opening options page
      chrome.runtime.openOptionsPage();
    }
  }

  async handleEnhanceFromContextMenu(info, tab) {
    const text = info.selectionText;
    
    if (!text || text.length < 10) {
      this.showNotification('Selected text too short to enhance', 'error');
      return;
    }
    
    try {
      // Show processing notification
      this.showNotification('Enhancing with AI...', 'info');
      
      const enhanced = await this.enhanceWithAI(text);
      
      // Create both original and enhanced versions
      const originalPrompt = await this.dbManager.createPrompt({
        title: `Original - ${this.truncateTitle(tab.title)}`,
        text: text.trim(),
        tags: ["original", "ai-enhanced", this.detectPageType(tab.url)],
        category: this.detectCategory(text, tab.url),
        source: tab.url
      });
      
      const enhancedPrompt = await this.dbManager.createPrompt({
        title: `Enhanced - ${this.truncateTitle(tab.title)}`,
        text: enhanced,
        tags: ["enhanced", "ai-generated", this.detectPageType(tab.url)],
        category: this.detectCategory(text, tab.url),
        source: tab.url
      });
      
      this.showNotification('Text enhanced and saved!', 'success');
      
      // Log analytics
      await this.dbManager.logAnalytics(originalPrompt.id, 'ai_enhance', {
        source: 'context_menu',
        enhancedPromptId: enhancedPrompt.id,
        originalLength: text.length,
        enhancedLength: enhanced.length
      });
      
    } catch (error) {
      console.error('Failed to enhance text:', error);
      this.showNotification('AI enhancement failed. Please try again.', 'error');
    }
  }

  setupMessageHandlers() {
    // Handle messages from content script and popup
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
      this.handleMessage(request, sender, sendResponse);
      return true; // Keep message channel open for async responses
    });
  }

  async handleMessage(request, sender, sendResponse) {
    try {
      switch (request.action) {
        case "savePrompt":
          await this.handleSavePrompt(request.prompt, sendResponse);
          break;
          
        case "enhancePrompt":
          await this.handleEnhancePrompt(request.text, sendResponse);
          break;
          
        case "getPrompts":
          await this.handleGetPrompts(request.options, sendResponse);
          break;
          
        case "deletePrompt":
          await this.handleDeletePrompt(request.id, sendResponse);
          break;
          
        case "updatePrompt":
          await this.handleUpdatePrompt(request.id, request.updates, sendResponse);
          break;
          
        case "searchPrompts":
          await this.handleSearchPrompts(request.query, request.options, sendResponse);
          break;
          
        case "getAnalytics":
          await this.handleGetAnalytics(request.options, sendResponse);
          break;
          
        case "exportData":
          await this.handleExportData(request.options, sendResponse);
          break;
          
        case "importData":
          await this.handleImportData(request.data, request.options, sendResponse);
          break;
          
        case "getPromptHistory":
          await this.handleGetPromptHistory(request.promptId, sendResponse);
          break;
          
        case "savePromptHistory":
          await this.handleSavePromptHistory(request.promptId, request.oldPrompt, request.version, sendResponse);
          break;
          
        case "healthCheck":
          await this.handleHealthCheck(sendResponse);
          break;
          
        default:
          sendResponse({ success: false, error: 'Unknown action' });
      }
    } catch (error) {
      console.error('Message handler error:', error);
      sendResponse({ success: false, error: error.message });
    }
  }

  async handleSavePrompt(promptData, sendResponse) {
    try {
      const savedPrompt = await this.dbManager.createPrompt(promptData);
      sendResponse({ success: true, prompt: savedPrompt });
    } catch (error) {
      sendResponse({ success: false, error: error.message });
    }
  }

  async handleEnhancePrompt(text, sendResponse) {
    try {
      const enhanced = await this.enhanceWithAI(text);
      sendResponse({ success: true, enhanced });
    } catch (error) {
      sendResponse({ success: false, error: error.message });
    }
  }

  async handleGetPrompts(options, sendResponse) {
    try {
      const prompts = await this.dbManager.getAllPrompts(options);
      sendResponse({ success: true, prompts });
    } catch (error) {
      sendResponse({ success: false, error: error.message });
    }
  }

  async handleDeletePrompt(id, sendResponse) {
    try {
      await this.dbManager.deletePrompt(id);
      sendResponse({ success: true });
    } catch (error) {
      sendResponse({ success: false, error: error.message });
    }
  }

  async handleUpdatePrompt(id, updates, sendResponse) {
    try {
      const updatedPrompt = await this.dbManager.updatePrompt(id, updates);
      sendResponse({ success: true, prompt: updatedPrompt });
    } catch (error) {
      sendResponse({ success: false, error: error.message });
    }
  }

  async handleSearchPrompts(query, options, sendResponse) {
    try {
      const results = await this.dbManager.searchPrompts(query, options);
      sendResponse({ success: true, results });
    } catch (error) {
      sendResponse({ success: false, error: error.message });
    }
  }

  async handleGetAnalytics(options, sendResponse) {
    try {
      const analytics = await this.dbManager.getAnalytics(options);
      const stats = await this.dbManager.getStats();
      sendResponse({ success: true, analytics, stats });
    } catch (error) {
      sendResponse({ success: false, error: error.message });
    }
  }

  async handleExportData(options, sendResponse) {
    try {
      const data = await this.dbManager.exportData(options);
      sendResponse({ success: true, data });
    } catch (error) {
      sendResponse({ success: false, error: error.message });
    }
  }

  async handleImportData(data, options, sendResponse) {
    try {
      const results = await this.dbManager.importData(data, options);
      sendResponse({ success: true, results });
    } catch (error) {
      sendResponse({ success: false, error: error.message });
    }
  }

  async handleGetPromptHistory(promptId, sendResponse) {
    try {
      const history = await this.dbManager.getPromptHistory(promptId);
      sendResponse({ success: true, history });
    } catch (error) {
      sendResponse({ success: false, error: error.message });
    }
  }

  async handleSavePromptHistory(promptId, oldPrompt, version, sendResponse) {
    try {
      await this.dbManager.savePromptHistory(promptId, oldPrompt, version);
      sendResponse({ success: true });
    } catch (error) {
      sendResponse({ success: false, error: error.message });
    }
  }

  async handleHealthCheck(sendResponse) {
    try {
      const health = await this.healthCheck();
      sendResponse({ success: true, health });
    } catch (error) {
      sendResponse({ success: false, error: error.message });
    }
  }

  setupAlarms() {
    // Set up periodic maintenance
    chrome.alarms.create('maintenance', {
      delayInMinutes: 60, // First run after 1 hour
      periodInMinutes: 24 * 60 // Then every 24 hours
    });

    // Set up analytics cleanup
    chrome.alarms.create('analyticsCleanup', {
      delayInMinutes: 24 * 60, // First run after 24 hours
      periodInMinutes: 7 * 24 * 60 // Then every 7 days
    });

    chrome.alarms.onAlarm.addListener((alarm) => {
      switch (alarm.name) {
        case 'maintenance':
          this.performMaintenance();
          break;
        case 'analyticsCleanup':
          this.performAnalyticsCleanup();
          break;
      }
    });
  }

  async performMaintenance() {
    try {
      console.log('Performing database maintenance...');
      
      // Update database statistics
      const stats = await this.dbManager.getStats();
      await this.dbManager.setSetting('lastStats', stats, 'Last calculated statistics');
      
      // Clean up unused tags
      await this.cleanupUnusedTags();
      
      // Update settings
      await this.dbManager.setSetting('lastMaintenance', new Date().toISOString(), 'Last maintenance run');
      
      console.log('Database maintenance completed');
    } catch (error) {
      console.error('Maintenance failed:', error);
    }
  }

  async performAnalyticsCleanup() {
    try {
      console.log('Cleaning up old analytics data...');
      const deletedCount = await this.dbManager.cleanup();
      console.log(`Cleaned up ${deletedCount} old analytics entries`);
    } catch (error) {
      console.error('Analytics cleanup failed:', error);
    }
  }

  async cleanupUnusedTags() {
    try {
      const tags = await this.dbManager.getAllTags();
      const prompts = await this.dbManager.getAllPrompts();
      
      // Get all used tags
      const usedTags = new Set();
      prompts.forEach(prompt => {
        prompt.tags.forEach(tag => usedTags.add(tag));
      });
      
      // Remove unused tags
      for (const tag of tags) {
        if (!usedTags.has(tag.name) || tag.usageCount === 0) {
          const transaction = this.db.transaction(['tags'], 'readwrite');
          const store = transaction.objectStore('tags');
          await store.delete(tag.name);
        }
      }
    } catch (error) {
      console.error('Tag cleanup failed:', error);
    }
  }

  async enhanceWithAI(text) {
    // Enhanced mock AI - replace with actual AI service
    return new Promise((resolve) => {
      setTimeout(() => {
        const enhanced = this.mockAIEnhancement(text);
        resolve(enhanced);
      }, 1500);
    });
  }

  mockAIEnhancement(text) {
    // Improved mock AI enhancement
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
      "• Add troubleshooting tips and common pitfalls",
      "• Specify tools and resources needed",
      "• Include timeline and milestones"
    ];
    
    const randomEnhancement = enhancements[Math.floor(Math.random() * enhancements.length)];
    const selectedSuggestions = suggestions
      .sort(() => 0.5 - Math.random())
      .slice(0, 4 + Math.floor(Math.random() * 3));
    
    return `${randomEnhancement}\n\n${text}\n\nAI Recommendations:\n${selectedSuggestions.join('\n')}`;
  }

  detectPageType(url) {
    if (!url) return "web";
    
    const hostname = url.toLowerCase();
    
    const pageTypes = {
      "openai.com": "chatgpt",
      "chat.openai": "chatgpt", 
      "claude.ai": "claude",
      "bard.google": "bard",
      "gemini.google": "gemini",
      "perplexity.ai": "perplexity",
      "github.com": "github",
      "stackoverflow.com": "stackoverflow",
      "stackexchange.com": "stackexchange",
      "reddit.com": "reddit",
      "medium.com": "medium",
      "dev.to": "dev",
      "hackernews": "hackernews",
      "twitter.com": "twitter",
      "x.com": "twitter",
      "linkedin.com": "linkedin",
      "youtube.com": "youtube",
      "docs.google.com": "gdocs",
      "notion.so": "notion",
      "obsidian.md": "obsidian"
    };
    
    for (const [domain, type] of Object.entries(pageTypes)) {
      if (hostname.includes(domain)) {
        return type;
      }
    }
    
    return "web";
  }

  detectCategory(text, url) {
    const textLower = text.toLowerCase();
    const urlLower = url ? url.toLowerCase() : '';
    
    // Programming/coding keywords
    if (this.containsKeywords(textLower, ['code', 'function', 'javascript', 'python', 'react', 'api', 'debug', 'programming', 'algorithm', 'database']) ||
        urlLower.includes('github') || urlLower.includes('stackoverflow')) {
      return 'coding';
    }
    
    // Writing/content keywords
    if (this.containsKeywords(textLower, ['write', 'article', 'blog', 'content', 'essay', 'story', 'copywriting', 'marketing'])) {
      return 'writing';
    }
    
    // Analysis/research keywords
    if (this.containsKeywords(textLower, ['analyze', 'research', 'data', 'study', 'report', 'statistics', 'insights', 'trends'])) {
      return 'analysis';
    }
    
    // Creative keywords
    if (this.containsKeywords(textLower, ['creative', 'design', 'art', 'music', 'brainstorm', 'innovative', 'imagination'])) {
      return 'creative';
    }
    
    return 'general';
  }

  containsKeywords(text, keywords) {
    return keywords.some(keyword => text.includes(keyword));
  }

  truncateTitle(title, maxLength = 50) {
    if (!title) return 'Unknown Page';
    return title.length > maxLength ? title.substring(0, maxLength) + '...' : title;
  }

  showNotification(message, type = 'info') {
    const iconUrl = type === 'error' ? 'icons/error.png' : 'icons/icon48.png';
    
    chrome.notifications?.create({
      type: 'basic',
      iconUrl: iconUrl,
      title: 'PromptHive',
      message: message,
      priority: type === 'error' ? 2 : 1
    });
  }

  // Utility methods for external integrations
  async getPromptById(id) {
    try {
      return await this.dbManager.getPrompt(id);
    } catch (error) {
      console.error('Error getting prompt:', error);
      return null;
    }
  }

  async incrementPromptUsage(id) {
    try {
      const prompt = await this.dbManager.getPrompt(id);
      if (prompt) {
        await this.dbManager.updatePrompt(id, { uses: prompt.uses + 1 });
        await this.dbManager.logAnalytics(id, 'use');
      }
    } catch (error) {
      console.error('Error incrementing usage:', error);
    }
  }

  // API endpoint simulation for future web service integration
  async syncWithCloud(operation, data) {
    // Placeholder for cloud sync functionality
    console.log('Cloud sync not implemented yet:', operation, data);
    return { success: false, message: 'Cloud sync not available' };
  }

  // Health check method
  async healthCheck() {
    try {
      const stats = await this.dbManager.getStats();
      const settings = await this.dbManager.getAllSettings();
      
      return {
        status: 'healthy',
        database: 'connected',
        stats: stats,
        version: chrome.runtime.getManifest().version,
        lastMaintenance: settings.find(s => s.key === 'lastMaintenance')?.value
      };
    } catch (error) {
      return {
        status: 'error',
        error: error.message
      };
    }
  }
}

// Initialize background script when service worker starts
let promptHiveBackground = null;

// Import database script
async function initializeBackground() {
  try {
    // Import the database class
    if (typeof importScripts !== 'undefined') {
      importScripts('database.js');
    }
    
    // Create global instance
    promptHiveBackground = new PromptHiveBackground();
  } catch (error) {
    console.error('Failed to initialize background script:', error);
  }
}

// Initialize when service worker starts
if (typeof importScripts !== 'undefined') {
  initializeBackground();
} else {
  // For testing environment
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = PromptHiveBackground;
  }
}