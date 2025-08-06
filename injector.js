// Enhanced Content script for prompt detection and saving - FIXED VERSION
// Fixes: Floating button save not working, duplicate prevention, cross-script communication
class PromptInjector {
  constructor() {
    this.isEnabled = true;
    this.selectedText = "";
    this.db = null;
    this.saveQueue = new Set(); // Track saves in progress to prevent duplicates
    this.dbInitialized = false;
    this.init();
  }

  async init() {
    try {
      await this.initDB();
      this.addSelectionListener();
      this.addFloatingButton();
      this.detectAIChats();
      console.log('PromptInjector initialized successfully');
    } catch (error) {
      console.error('Failed to initialize PromptInjector:', error);
      // Still add listeners even if DB fails
      this.addSelectionListener();
      this.addFloatingButton();
      this.detectAIChats();
    }
  }

  async initDB() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open('PromptHiveDB', 3);
      
      request.onerror = () => {
        console.error('Failed to open database:', request.error);
        reject(request.error);
      };
      
      request.onsuccess = () => {
        this.db = request.result;
        this.dbInitialized = true;
        console.log('Content script database connection established');
        resolve();
      };
      
      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        
        // Create prompts store
        if (!db.objectStoreNames.contains('prompts')) {
          const promptStore = db.createObjectStore('prompts', { keyPath: 'id' });
          promptStore.createIndex('title', 'title', { unique: false });
          promptStore.createIndex('tags', 'tags', { unique: false, multiEntry: true });
          promptStore.createIndex('createdAt', 'createdAt', { unique: false });
        }
        
        // Create prompt history store
        if (!db.objectStoreNames.contains('promptHistory')) {
          const historyStore = db.createObjectStore('promptHistory', { keyPath: 'historyId' });
          historyStore.createIndex('promptId', 'promptId', { unique: false });
          historyStore.createIndex('version', 'version', { unique: false });
          historyStore.createIndex('createdAt', 'createdAt', { unique: false });
        }

        // Create analytics store
        if (!db.objectStoreNames.contains('analytics')) {
          const analyticsStore = db.createObjectStore('analytics', { keyPath: 'id', autoIncrement: true });
          analyticsStore.createIndex('action', 'action', { unique: false });
          analyticsStore.createIndex('timestamp', 'timestamp', { unique: false });
          analyticsStore.createIndex('date', 'date', { unique: false });
        }
      };
    });
  }

  addSelectionListener() {
    document.addEventListener("mouseup", (e) => {
      if (!this.isEnabled) return;

      const selection = window.getSelection();
      const selectedText = selection.toString().trim();

      if (selectedText.length > 10) {
        this.selectedText = selectedText;
        this.showFloatingButton(e.pageX, e.pageY);
      } else {
        this.hideFloatingButton();
      }
    });

    // Hide floating button when clicking elsewhere
    document.addEventListener("mousedown", (e) => {
      if (!e.target.closest("#prompthive-floating-btn")) {
        this.hideFloatingButton();
      }
    });
  }

  addFloatingButton() {
    // Remove existing button if it exists
    const existingButton = document.getElementById("prompthive-floating-btn");
    if (existingButton) {
      existingButton.remove();
    }

    const button = document.createElement("div");
    button.id = "prompthive-floating-btn";
    button.innerHTML = `
      <div class="prompthive-btn-content">
        <span class="prompthive-icon">🏠</span>
        <span class="prompthive-text">Save to PromptHive</span>
      </div>
    `;
    button.style.display = "none";
    document.body.appendChild(button);

    button.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.saveSelectedText();
    });
  }

  showFloatingButton(x, y) {
    const button = document.getElementById("prompthive-floating-btn");
    if (!button) return;

    button.style.display = "block";
    button.style.left = `${Math.min(x, window.innerWidth - 200)}px`;
    button.style.top = `${Math.max(y - 50, 10)}px`;
  }

  hideFloatingButton() {
    const button = document.getElementById("prompthive-floating-btn");
    if (button) {
      button.style.display = "none";
    }
  }

  async saveSelectedText() {
    if (!this.selectedText) {
      console.log('No selected text to save');
      return;
    }

    // Create a unique hash for this text to prevent duplicates
    const textHash = this.hashCode(this.selectedText + window.location.href);
    
    // Check if already saving this text
    if (this.saveQueue.has(textHash)) {
      this.showNotification("Save already in progress...", "info");
      return;
    }

    // Add to save queue
    this.saveQueue.add(textHash);
    console.log('Starting save process for selected text:', this.selectedText.substring(0, 50) + '...');

    try {
      // Check if similar prompt already exists
      const existingPrompt = await this.findSimilarPrompt(this.selectedText);
      if (existingPrompt) {
        this.showNotification("Similar prompt already exists!", "warning");
        this.saveQueue.delete(textHash);
        this.hideFloatingButton();
        return;
      }

      const prompt = {
        id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
        title: `Saved from ${this.truncateTitle(document.title)}`,
        text: this.selectedText,
        tags: ["auto-saved", this.detectPageType()],
        date: new Date().toLocaleDateString(),
        uses: 0,
        version: 1,
        category: this.detectCategory(this.selectedText),
        source: window.location.href,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      console.log('Saving prompt:', prompt);

      // Save to IndexedDB directly (primary save)
      let saveSuccess = false;
      if (this.dbInitialized && this.db) {
        try {
          await this.savePromptToDB(prompt);
          saveSuccess = true;
          console.log('Prompt saved to IndexedDB successfully');
        } catch (error) {
          console.error('Failed to save to IndexedDB:', error);
        }
      }

      // Also try to send to background script as backup
      try {
        const response = await new Promise((resolve, reject) => {
          chrome.runtime.sendMessage({
            action: "savePrompt",
            prompt: prompt
          }, (response) => {
            if (chrome.runtime.lastError) {
              console.warn('Background script communication failed:', chrome.runtime.lastError);
              resolve({ success: false });
            } else {
              resolve(response || { success: false });
            }
          });
          
          // Timeout after 2 seconds
          setTimeout(() => resolve({ success: false }), 2000);
        });
        
        if (response.success) {
          console.log('Prompt also saved via background script');
          saveSuccess = true;
        }
      } catch (error) {
        console.warn('Background script communication failed:', error);
      }

      if (saveSuccess) {
        // Log analytics
        await this.logAnalytics('prompt_saved_injector', {
          source: 'content_script',
          url: window.location.href,
          textLength: this.selectedText.length,
          pageType: this.detectPageType()
        });

        this.showSaveNotification();
        
        // Notify popup to refresh if it's open
        try {
          chrome.runtime.sendMessage({
            action: 'promptSaved',
            promptId: prompt.id
          });
        } catch (error) {
          console.warn('Failed to notify popup:', error);
        }
      } else {
        throw new Error('Failed to save prompt to any storage method');
      }

    } catch (error) {
      console.error('Failed to save prompt:', error);
      this.showErrorNotification();
    } finally {
      // Remove from save queue
      this.saveQueue.delete(textHash);
      this.hideFloatingButton();
      window.getSelection().removeAllRanges();
    }
  }

  // Create a simple hash for text comparison
  hashCode(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return hash.toString();
  }

  async findSimilarPrompt(text) {
    if (!this.dbInitialized || !this.db) return null;

    try {
      const transaction = this.db.transaction(['prompts'], 'readonly');
      const store = transaction.objectStore('prompts');
      
      return new Promise((resolve, reject) => {
        const request = store.getAll();
        
        request.onsuccess = () => {
          const prompts = request.result;
          
          // Check for exact match or very similar content
          const similar = prompts.find(prompt => {
            // Exact match
            if (prompt.text.trim() === text.trim()) return true;
            
            // Similar content (90% similarity)
            const similarity = this.calculateSimilarity(prompt.text, text);
            return similarity > 0.9;
          });
          
          resolve(similar || null);
        };
        
        request.onerror = () => resolve(null);
      });
    } catch (error) {
      console.error('Error checking for similar prompts:', error);
      return null;
    }
  }

  calculateSimilarity(str1, str2) {
    const longer = str1.length > str2.length ? str1 : str2;
    const shorter = str1.length > str2.length ? str2 : str1;
    
    if (longer.length === 0) return 1.0;
    
    const distance = this.levenshteinDistance(longer, shorter);
    return (longer.length - distance) / longer.length;
  }

  levenshteinDistance(str1, str2) {
    const matrix = [];
    
    for (let i = 0; i <= str2.length; i++) {
      matrix[i] = [i];
    }
    
    for (let j = 0; j <= str1.length; j++) {
      matrix[0][j] = j;
    }
    
    for (let i = 1; i <= str2.length; i++) {
      for (let j = 1; j <= str1.length; j++) {
        if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1,
            matrix[i][j - 1] + 1,
            matrix[i - 1][j] + 1
          );
        }
      }
    }
    
    return matrix[str2.length][str1.length];
  }

  async savePromptToDB(prompt) {
    if (!this.dbInitialized || !this.db) {
      throw new Error('Database not initialized');
    }

    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(['prompts'], 'readwrite');
      const store = transaction.objectStore('prompts');
      const request = store.put(prompt);
      
      request.onsuccess = () => {
        console.log('Prompt saved to IndexedDB with ID:', prompt.id);
        resolve();
      };
      request.onerror = () => {
        console.error('IndexedDB save error:', request.error);
        reject(request.error);
      };
    });
  }

  async logAnalytics(action, metadata = {}) {
    if (!this.dbInitialized || !this.db) return;
    
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

  detectPageType() {
    const hostname = window.location.hostname.toLowerCase();
    const url = window.location.href.toLowerCase();

    if (hostname.includes("openai.com") || hostname.includes("chat.openai")) {
      return "chatgpt";
    } else if (hostname.includes("claude.ai")) {
      return "claude";
    } else if (hostname.includes("bard.google")) {
      return "bard";
    } else if (hostname.includes("github.com")) {
      return "github";
    } else if (hostname.includes("stackoverflow.com")) {
      return "stackoverflow";
    } else if (url.includes("reddit.com")) {
      return "reddit";
    } else if (hostname.includes("medium.com")) {
      return "medium";
    } else if (hostname.includes("perplexity.ai")) {
      return "perplexity";
    } else if (hostname.includes("gemini.google")) {
      return "gemini";
    } else {
      return "web";
    }
  }

  detectCategory(text) {
    const textLower = text.toLowerCase();
    
    // Programming/coding keywords
    if (this.containsKeywords(textLower, ['code', 'function', 'javascript', 'python', 'react', 'api', 'debug', 'programming', 'algorithm', 'database'])) {
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

  detectAIChats() {
    // Enhanced detection for AI chat interfaces
    const hostname = window.location.hostname;
    
    if (hostname.includes("openai.com")) {
      this.enhanceChatGPT();
    } else if (hostname.includes("claude.ai")) {
      this.enhanceClaude();
    } else if (hostname.includes("bard.google") || hostname.includes("gemini.google")) {
      this.enhanceGemini();
    } else if (hostname.includes("perplexity.ai")) {
      this.enhancePerplexity();
    }
  }

  enhanceChatGPT() {
    // Add save buttons to ChatGPT messages
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        mutation.addedNodes.forEach((node) => {
          if (node.nodeType === Node.ELEMENT_NODE) {
            this.addSaveButtonsToChatGPT(node);
          }
        });
      });
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true
    });

    // Initial scan
    this.addSaveButtonsToChatGPT(document.body);
  }

  enhanceClaude() {
    // Add save buttons to Claude messages
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        mutation.addedNodes.forEach((node) => {
          if (node.nodeType === Node.ELEMENT_NODE) {
            this.addSaveButtonsToClaude(node);
          }
        });
      });
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true
    });

    // Initial scan
    this.addSaveButtonsToClaude(document.body);
  }

  enhanceGemini() {
    // Add save buttons to Gemini messages
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        mutation.addedNodes.forEach((node) => {
          if (node.nodeType === Node.ELEMENT_NODE) {
            this.addSaveButtonsToGemini(node);
          }
        });
      });
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true
    });
  }

  enhancePerplexity() {
    // Add save buttons to Perplexity messages
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        mutation.addedNodes.forEach((node) => {
          if (node.nodeType === Node.ELEMENT_NODE) {
            this.addSaveButtonsToPerplexity(node);
          }
        });
      });
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true
    });
  }

  addSaveButtonsToChatGPT(container) {
    // Look for message containers in ChatGPT
    const messages = container.querySelectorAll('[data-message-author-role="assistant"], .markdown, [class*="message"]');
    messages.forEach((message) => {
      if (message.querySelector(".prompthive-inline-btn")) return;

      const messageContent = message.querySelector(".prose, .markdown") || message;
      
      if (messageContent && messageContent.textContent.trim().length > 50) {
        const saveBtn = this.createInlineSaveButton();
        saveBtn.addEventListener("click", (e) => {
          e.stopPropagation();
          this.saveMessageContent(messageContent.textContent, "ChatGPT Response");
        });
        
        // Position the button
        message.style.position = 'relative';
        message.appendChild(saveBtn);
      }
    });
  }

  addSaveButtonsToClaude(container) {
    // Look for message containers in Claude
    const messages = container.querySelectorAll('[data-testid="message"], .font-claude-message, [class*="message"]');
    messages.forEach((message) => {
      if (message.querySelector(".prompthive-inline-btn")) return;

      const messageContent = message.querySelector(".prose, .markdown") || message;
      
      if (messageContent && messageContent.textContent.trim().length > 50) {
        const saveBtn = this.createInlineSaveButton();
        saveBtn.addEventListener("click", (e) => {
          e.stopPropagation();
          this.saveMessageContent(messageContent.textContent, "Claude Response");
        });
        
        // Position the button
        message.style.position = 'relative';
        message.appendChild(saveBtn);
      }
    });
  }

  addSaveButtonsToGemini(container) {
    // Look for message containers in Gemini
    const messages = container.querySelectorAll('[data-test-id="model-response"], .model-response-text, [class*="response"]');
    messages.forEach((message) => {
      if (message.querySelector(".prompthive-inline-btn")) return;

      if (message.textContent.trim().length > 50) {
        const saveBtn = this.createInlineSaveButton();
        saveBtn.addEventListener("click", (e) => {
          e.stopPropagation();
          this.saveMessageContent(message.textContent, "Gemini Response");
        });
        
        // Position the button
        message.style.position = 'relative';
        message.appendChild(saveBtn);
      }
    });
  }

  addSaveButtonsToPerplexity(container) {
    // Look for message containers in Perplexity
    const messages = container.querySelectorAll('.prose, [class*="answer"], [class*="response"]');
    messages.forEach((message) => {
      if (message.querySelector(".prompthive-inline-btn")) return;

      if (message.textContent.trim().length > 50) {
        const saveBtn = this.createInlineSaveButton();
        saveBtn.addEventListener("click", (e) => {
          e.stopPropagation();
          this.saveMessageContent(message.textContent, "Perplexity Response");
        });
        
        // Position the button
        message.style.position = 'relative';
        message.appendChild(saveBtn);
      }
    });
  }

  createInlineSaveButton() {
    const button = document.createElement("button");
    button.className = "prompthive-inline-btn";
    button.innerHTML = `
      <span class="prompthive-icon">🏠</span>
      <span>Save</span>
    `;
    return button;
  }

  async saveMessageContent(content, title) {
    // Create a unique hash for this content to prevent duplicates
    const contentHash = this.hashCode(content + window.location.href + title);
    
    // Check if already saving this content
    if (this.saveQueue.has(contentHash)) {
      this.showNotification("Save already in progress...", "info");
      return;
    }

    // Add to save queue
    this.saveQueue.add(contentHash);

    try {
      // Check if similar prompt already exists
      const existingPrompt = await this.findSimilarPrompt(content);
      if (existingPrompt) {
        this.showNotification("Similar content already saved!", "warning");
        this.saveQueue.delete(contentHash);
        return;
      }

      const prompt = {
        id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
        title: title,
        text: content,
        tags: ["ai-response", this.detectPageType()],
        date: new Date().toLocaleDateString(),
        uses: 0,
        version: 1,
        category: this.detectCategory(content),
        source: window.location.href,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      // Save to IndexedDB directly
      let saveSuccess = false;
      if (this.dbInitialized && this.db) {
        try {
          await this.savePromptToDB(prompt);
          saveSuccess = true;
        } catch (error) {
          console.error('Failed to save to IndexedDB:', error);
        }
      }

      // Also send to background script
      try {
        const response = await new Promise((resolve, reject) => {
          chrome.runtime.sendMessage({
            action: "savePrompt",
            prompt: prompt
          }, (response) => {
            if (chrome.runtime.lastError) {
              resolve({ success: false });
            } else {
              resolve(response || { success: false });
            }
          });
          
          // Timeout after 2 seconds
          setTimeout(() => resolve({ success: false }), 2000);
        });
        
        if (response.success) {
          saveSuccess = true;
        }
      } catch (error) {
        console.warn('Background script communication failed:', error);
      }

      if (saveSuccess) {
        // Log analytics
        await this.logAnalytics('ai_response_saved', {
          source: 'inline_button',
          pageType: this.detectPageType(),
          contentLength: content.length
        });

        this.showSaveNotification();
        
        // Notify popup to refresh
        try {
          chrome.runtime.sendMessage({
            action: 'promptSaved',
            promptId: prompt.id
          });
        } catch (error) {
          console.warn('Failed to notify popup:', error);
        }
      } else {
        throw new Error('Failed to save prompt');
      }

    } catch (error) {
      console.error('Failed to save message:', error);
      this.showErrorNotification();
    } finally {
      // Remove from save queue
      this.saveQueue.delete(contentHash);
    }
  }

  showSaveNotification() {
    // Create and show a temporary notification
    const notification = document.createElement("div");
    notification.className = "prompthive-notification";
    notification.innerHTML = `
      <div class="prompthive-notification-content">
        <span class="prompthive-icon">✅</span>
        <span>Saved to PromptHive!</span>
      </div>
    `;

    document.body.appendChild(notification);

    // Animate in
    setTimeout(() => {
      notification.classList.add("show");
    }, 100);

    // Remove after 3 seconds
    setTimeout(() => {
      notification.classList.remove("show");
      setTimeout(() => {
        if (notification.parentNode) {
          notification.parentNode.removeChild(notification);
        }
      }, 300);
    }, 3000);
  }

  showNotification(message, type = "info") {
    const notification = document.createElement("div");
    notification.className = "prompthive-notification";
    
    let icon = "ℹ️";
    let bgColor = "linear-gradient(135deg, #3b82f6, #2563eb)";
    
    if (type === "warning") {
      icon = "⚠️";
      bgColor = "linear-gradient(135deg, #f59e0b, #d97706)";
    } else if (type === "error") {
      icon = "❌";
      bgColor = "linear-gradient(135deg, #ef4444, #dc2626)";
    } else if (type === "success") {
      icon = "✅";
      bgColor = "linear-gradient(135deg, #10b981, #059669)";
    }
    
    notification.innerHTML = `
      <div class="prompthive-notification-content">
        <span class="prompthive-icon">${icon}</span>
        <span>${message}</span>
      </div>
    `;
    
    notification.style.background = bgColor;
    document.body.appendChild(notification);

    // Animate in
    setTimeout(() => {
      notification.classList.add("show");
    }, 100);

    // Remove after 3 seconds
    setTimeout(() => {
      notification.classList.remove("show");
      setTimeout(() => {
        if (notification.parentNode) {
          notification.parentNode.removeChild(notification);
        }
      }, 300);
    }, 3000);
  }

  showErrorNotification() {
    this.showNotification("Failed to save prompt!", "error");
  }
}

// Initialize when page loads
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => {
    new PromptInjector();
  });
} else {
  new PromptInjector();
}