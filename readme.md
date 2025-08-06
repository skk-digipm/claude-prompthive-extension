# 🏠 PromptHive Enhanced v2.2 - Complete Setup Guide

## ✨ Key Improvements in This Version

### 🎨 UI Enhancements
- **Repositioned Icons**: Edit and delete buttons now appear as clickable icons on the right side of the meta row
- **Improved Button Layout**: "AI Enhance" button now placed adjacent to "Copy & Use" for better workflow
- **Compact Enhancement Modal**: Reduced text window sizes with buttons fitting in same width as text boxes
- **Enhanced Tooltips**: Hover over icons to see descriptive text

### 💾 Advanced Database Features
- **Comprehensive Schema**: Enhanced IndexedDB with categories, tags, analytics, and settings stores
- **Better Performance**: Indexed searches and optimized queries
- **Advanced Analytics**: Track usage patterns and prompt performance
- **Automatic Maintenance**: Background cleanup and optimization

## 📁 File Structure

Create a folder called `prompthive-enhanced-v2.2` with these files:

```
prompthive-enhanced-v2.2/
├── manifest.json          # Extension configuration (v2.2)
├── background.js          # Enhanced background script with database
├── database.js            # Comprehensive database schema and operations
├── popup.html            # Updated UI with improved layout
├── popup.js              # Enhanced popup with better button positioning
├── injector.js           # Content script (use existing)
├── injector.css          # Content styles (use existing)
├── options.html          # Settings page (create if needed)
├── icons/                # Extension icons
│   ├── icon16.png
│   ├── icon32.png
│   ├── icon48.png
│   └── icon128.png
└── README.md             # Documentation
```

## 🚀 Installation Steps

### Step 1: Create Extension Files

1. **Create the main folder**: `prompthive-enhanced-v2.2`

2. **Add the core files** from the artifacts above:
   - `manifest.json`
   - `popup.html` 
   - `popup.js`
   - `background.js`
   - `database.js` (create new file with the database schema)

3. **Keep existing files** from your current version:
   - `injector.js`
   - `injector.css`

4. **Create icons folder** and add icon files (16x16, 32x32, 48x48, 128x128 PNG format)

### Step 2: Create Database File

Create a new file called `database.js` with the complete database schema from the artifacts above. This file contains:

- Comprehensive IndexedDB schema
- CRUD operations for prompts
- Version history management
- Analytics tracking
- Tag and category management
- Search functionality
- Export/import capabilities

### Step 3: Install in Chrome

1. **Open Chrome Extensions**:
   - Go to `chrome://extensions/`
   - Enable "Developer mode" (toggle in top right)

2. **Load the Extension**:
   - Click "Load unpacked"
   - Select your `prompthive-enhanced-v2.2` folder
   - Extension should load successfully

3. **Verify Installation**:
   - Extension icon should appear in toolbar
   - Click icon to open popup
   - Check that database initializes (look in console for "Database initialized successfully")

### Step 4: Migration from Previous Version

The extension will automatically:
- Migrate existing prompts from Chrome storage to IndexedDB
- Preserve all your existing data
- Add new database features like version history
- Show migration status in notifications

## 🎯 New Features Usage

### Enhanced UI Layout

**Prompt Card Layout:**
```
┌─────────────────────────────────────────────────────┐
│ Prompt Title                                   #ID  │
│ 📅 Date  📊 Uses  📝 Version    🕒 ✏️ 🗑️        │
│ Prompt content preview...                          │
│ [tag1] [tag2] [tag3]                              │
│ [Copy & Use] [AI Enhance]                         │
└─────────────────────────────────────────────────────┘
```

**Icon Functions:**
- 🕒 **History**: View all versions of the prompt
- ✏️ **Edit**: Modify the prompt (creates new version)
- 🗑️ **Delete**: Remove the prompt permanently

### AI Enhancement Modal

The enhancement comparison modal now features:
- **Compact Layout**: Smaller text boxes for better fit
- **Side-by-side Comparison**: Original vs Enhanced
- **Inline Actions**: Buttons aligned with text box width
- **Better UX**: Clear visual distinction between versions

### Database Features

**Automatic Organization:**
- Prompts categorized by content type (coding, writing, analysis, creative, general)
- Smart tagging based on source and content
- Usage analytics for optimization

**Advanced Search:**
- Full-text search across title, content, tags, and categories
- Relevance scoring
- Filter by category, tags, usage, and date

**Version History:**
- Every edit creates a new version
- Complete history preservation
- One-click restoration to any previous version

## 🔧 Customization Options

### Replacing Mock AI with Real AI

Edit `background.js` and `popup.js` to replace the `mockAIEnhancement` function:

```javascript
async enhanceWithAI(text) {
  // Replace with your AI service
  const response = await fetch('YOUR_AI_ENDPOINT', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer YOUR_API_KEY'
    },
    body: JSON.stringify({
      prompt: text,
      task: 'enhance'
    })
  });
  
  const result = await response.json();
  return result.enhanced_text;
}
```

### Adding Custom Categories

Modify the `defaultCategories` array in `database.js`:

```javascript
const defaultCategories = [
  {
    id: 'your-category',
    name: 'Your Category',
    color: '#your-color',
    description: 'Your description',
    order: 6,
    createdAt: new Date().toISOString()
  }
  // ... existing categories
];
```

### Styling Customization

Update CSS variables in `popup.html` for consistent theming:

```css
:root {
  --primary-gradient: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  --ai-gradient: linear-gradient(135deg, #8b5cf6, #7c3aed);
  --success-gradient: linear-gradient(135deg, #10b981, #059669);
  --danger-color: #ef4444;
  --border-radius: 12px;
}
```

## 🧪 Testing the Installation

### Basic Functionality Test

1. **Open PromptHive**: Click extension icon
2. **Add a prompt**: Click "Add Prompt" button
3. **Test search**: Enter text in search bar
4. **Test actions**: Try copy, edit, delete buttons
5. **Test AI enhance**: Click AI Enhance on any prompt
6. **Test history**: Edit a prompt, then click history icon

### Database Test

1. **Check console**: Look for "Database initialized successfully"
2. **Test persistence**: Add prompts, close/reopen extension
3. **Test migration**: If upgrading, verify old prompts transferred
4. **Test export**: Click Export button to download CSV

### Context Menu Test

1. **Select text** on any webpage
2. **Right-click**: Should see "Save to PromptHive" option
3. **Test save**: Click option, check for success notification
4. **Verify storage**: Open PromptHive, find saved prompt

## 🐛 Troubleshooting

### Common Issues

**Extension won't load:**
- Check all files are in correct locations
- Verify manifest.json syntax (use JSON validator)
- Check Chrome developer console for errors

**Database not initializing:**
- Ensure `database.js` file is present and complete
- Check browser console for IndexedDB errors
- Try reloading extension

**Icons not working:**
- Create `icons/` folder with PNG files
- Use proper dimensions (16x16, 32x32, 48x48, 128x128)
- Or remove icon references from manifest temporarily

**Migration not working:**
- Check browser console for migration messages
- Old data should appear after first successful load
- Manual backup: Export from old version before upgrading

### Debug Mode

Enable verbose logging by adding to `background.js`:

```javascript
// Add at top of file
const DEBUG = true;

// Replace console.log with
function debugLog(...args) {
  if (DEBUG) console.log('[PromptHive]', ...args);
}
```

## 📊 Performance Optimization

### Database Maintenance

The extension automatically:
- Cleans up old analytics data (90+ days)
- Removes unused tags
- Optimizes database indexes
- Runs maintenance every 24 hours

### Manual Optimization

To manually trigger maintenance:

```javascript
// In browser console (when extension is active)
chrome.runtime.sendMessage({
  action: 'maintenance'
});
```

## 🔄 Future Updates

### Planned Features v2.3

- **Cloud Sync**: Backup and sync across devices
- **Prompt Templates**: Pre-built prompt collections
- **Team Sharing**: Collaborate on prompt libraries
- **Advanced AI**: Multiple AI provider support
- **Mobile App**: Companion mobile application

### Extension API

For developers wanting to integrate:

```javascript
// Get extension health status
chrome.runtime.sendMessage({
  action: 'healthCheck'
}, (response) => {
  console.log('PromptHive status:', response);
});
```

## 📞 Support

### Getting Help

1. **Check Console**: Browser developer tools → Console tab
2. **Verify Files**: Ensure all files are present and correct
3. **Test Permissions**: Check extension has required permissions
4. **Clear Data**: Try clearing extension data and reimporting

### Reporting Issues

When reporting issues, include:
- Chrome version
- Extension version
- Console error messages
- Steps to reproduce
- Expected vs actual behavior

---

**PromptHive Enhanced v2.2** - Your intelligent hub for AI prompts with enhanced UI, comprehensive database, and advanced features.

Happy prompting! 🚀