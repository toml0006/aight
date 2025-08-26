// Check if already defined to prevent duplicate registration
if (!customElements.get('ai-config-panel')) {
  customElements.define('ai-config-panel', class extends HTMLElement {
  constructor() {
    super();
    // Debug logging - only enable in development
    if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
      console.log('🚀 AI Config Panel v2.0 - ENHANCED AUTOCOMPLETE & SLASH COMMANDS LOADED!');
    }
    this.attachShadow({ mode: 'open' });
    this._hass = null;
    this._currentTab = 'chat';
    this._entities = [];
    this._autocompleteTimeout = null;
    this._conversationMessages = [];
    this._conversationContext = {};
    this._isProcessing = false;
    this._selectedSuggestionIndex = -1;
    this._conversations = [];
    this._currentConversationId = null;
    
    // Theme detection and management
    this._isDarkMode = false;
    this._detectTheme();
    this._setupThemeListeners();
  }
  
  _detectTheme() {
    // Check Home Assistant theme
    if (this._hass && this._hass.selectedTheme) {
      this._isDarkMode = this._hass.selectedTheme.dark === true;
    } else {
      // Fallback to system preference
      this._isDarkMode = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    }
    this._applyTheme();
  }
  
  _setupThemeListeners() {
    // Listen for system theme changes
    if (window.matchMedia) {
      const darkModeQuery = window.matchMedia('(prefers-color-scheme: dark)');
      darkModeQuery.addEventListener('change', (e) => {
        this._isDarkMode = e.matches;
        this._applyTheme();
      });
    }
  }
  
  _applyTheme() {
    if (this._isDarkMode) {
      this.setAttribute('dark', '');
    } else {
      this.removeAttribute('dark');
    }
  }

  set hass(hass) {
    this._hass = hass;
    
    // Log Home Assistant version for debugging
    if (hass && hass.config) {
      console.log('Home Assistant version:', hass.config.version);
      this._haVersion = hass.config.version;
    }
    
    // Detect theme when hass is available
    this._detectTheme();
    
    if (!this._rendered) {
      this._render();
      this._rendered = true;
      this._loadEntities();
    }
  }

  _render() {
    this.shadowRoot.innerHTML = `
      <style>
        /* Modern Design System - CSS Custom Properties */
        :host {
          /* Color Palette - Modern Blues & Grays */
          --ai-primary: #2563eb;
          --ai-primary-light: #3b82f6;
          --ai-primary-dark: #1e40af;
          --ai-primary-alpha-10: rgba(37, 99, 235, 0.1);
          --ai-primary-alpha-20: rgba(37, 99, 235, 0.2);
          
          /* Secondary Colors */
          --ai-secondary: #8b5cf6;
          --ai-secondary-light: #a78bfa;
          --ai-secondary-dark: #7c3aed;
          
          /* Semantic Colors */
          --ai-success: #10b981;
          --ai-success-light: #34d399;
          --ai-success-dark: #059669;
          --ai-success-alpha: rgba(16, 185, 129, 0.1);
          
          --ai-warning: #f59e0b;
          --ai-warning-light: #fbbf24;
          --ai-warning-dark: #d97706;
          --ai-warning-alpha: rgba(245, 158, 11, 0.1);
          
          --ai-error: #ef4444;
          --ai-error-light: #f87171;
          --ai-error-dark: #dc2626;
          --ai-error-alpha: rgba(239, 68, 68, 0.1);
          
          --ai-info: #06b6d4;
          --ai-info-light: #22d3ee;
          --ai-info-dark: #0891b2;
          --ai-info-alpha: rgba(6, 182, 212, 0.1);
          
          /* Neutral Colors */
          --ai-gray-50: #f9fafb;
          --ai-gray-100: #f3f4f6;
          --ai-gray-200: #e5e7eb;
          --ai-gray-300: #d1d5db;
          --ai-gray-400: #9ca3af;
          --ai-gray-500: #6b7280;
          --ai-gray-600: #4b5563;
          --ai-gray-700: #374151;
          --ai-gray-800: #1f2937;
          --ai-gray-900: #111827;
          
          /* Typography Scale */
          --ai-font-display: 2rem;     /* 32px */
          --ai-font-title: 1.5rem;      /* 24px */
          --ai-font-subtitle: 1.125rem; /* 18px */
          --ai-font-body: 0.875rem;     /* 14px */
          --ai-font-caption: 0.75rem;   /* 12px */
          
          /* Line Heights */
          --ai-line-height-display: 2.5rem;  /* 40px */
          --ai-line-height-title: 2rem;      /* 32px */
          --ai-line-height-subtitle: 1.75rem;/* 28px */
          --ai-line-height-body: 1.25rem;    /* 20px */
          --ai-line-height-caption: 1rem;    /* 16px */
          
          /* Font Weights */
          --ai-font-regular: 400;
          --ai-font-medium: 500;
          --ai-font-semibold: 600;
          --ai-font-bold: 700;
          
          /* Spacing Scale (4px base) */
          --ai-space-1: 0.25rem;  /* 4px */
          --ai-space-2: 0.5rem;   /* 8px */
          --ai-space-3: 0.75rem;  /* 12px */
          --ai-space-4: 1rem;     /* 16px */
          --ai-space-5: 1.25rem;  /* 20px */
          --ai-space-6: 1.5rem;   /* 24px */
          --ai-space-8: 2rem;     /* 32px */
          --ai-space-12: 3rem;    /* 48px */
          
          /* Border Radius */
          --ai-radius-sm: 0.25rem;  /* 4px */
          --ai-radius-md: 0.5rem;   /* 8px */
          --ai-radius-lg: 0.75rem;  /* 12px */
          --ai-radius-xl: 1rem;     /* 16px */
          --ai-radius-full: 9999px;
          
          /* Shadows - Modern, Subtle */
          --ai-shadow-sm: 0 1px 2px 0 rgba(0, 0, 0, 0.05);
          --ai-shadow-md: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);
          --ai-shadow-lg: 0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05);
          --ai-shadow-xl: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04);
          
          /* Animation Durations */
          --ai-duration-fast: 150ms;
          --ai-duration-normal: 250ms;
          --ai-duration-slow: 400ms;
          
          /* Animation Easings */
          --ai-ease-out: cubic-bezier(0, 0, 0.2, 1);
          --ai-ease-in: cubic-bezier(0.4, 0, 1, 1);
          --ai-ease-in-out: cubic-bezier(0.4, 0, 0.2, 1);
          --ai-ease-bounce: cubic-bezier(0.68, -0.55, 0.265, 1.55);
          
          /* Z-Index Scale */
          --ai-z-dropdown: 1000;
          --ai-z-modal: 2000;
          --ai-z-tooltip: 3000;
          --ai-z-notification: 4000;
        }

        /* Dark Mode Overrides */
        :host([dark]) {
          --ai-primary: #60a5fa;
          --ai-primary-light: #93c5fd;
          --ai-primary-dark: #3b82f6;
          
          --ai-gray-50: #111827;
          --ai-gray-100: #1f2937;
          --ai-gray-200: #374151;
          --ai-gray-300: #4b5563;
          --ai-gray-400: #6b7280;
          --ai-gray-500: #9ca3af;
          --ai-gray-600: #d1d5db;
          --ai-gray-700: #e5e7eb;
          --ai-gray-800: #f3f4f6;
          --ai-gray-900: #f9fafb;
        }
        
        /* Apply base styles with new design tokens */
        :host {
          display: block;
          padding: var(--ai-space-4);
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
          background: var(--primary-background-color, var(--ai-gray-50));
          color: var(--primary-text-color, var(--ai-gray-900));
          font-size: var(--ai-font-body);
          line-height: var(--ai-line-height-body);
          transition: all var(--ai-duration-normal) var(--ai-ease-in-out);
        }

        .container {
          max-width: 1200px;
          margin: 0 auto;
          animation: fadeIn var(--ai-duration-slow) var(--ai-ease-out);
        }

        .header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: var(--ai-space-6);
          padding-bottom: var(--ai-space-4);
          border-bottom: 1px solid var(--divider-color, var(--ai-gray-200));
          animation: slideDown var(--ai-duration-normal) var(--ai-ease-out);
        }

        .header h1 {
          margin: 0;
          font-size: var(--ai-font-title);
          line-height: var(--ai-line-height-title);
          font-weight: var(--ai-font-semibold);
          background: linear-gradient(135deg, var(--ai-primary) 0%, var(--ai-secondary) 100%);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
        }

        .header .status {
          font-size: var(--ai-font-body);
          color: var(--secondary-text-color, var(--ai-gray-500));
          display: flex;
          align-items: center;
          gap: var(--ai-space-2);
        }

        .tabs {
          display: flex;
          gap: var(--ai-space-2);
          margin-bottom: var(--ai-space-6);
          border-bottom: 1px solid var(--divider-color, var(--ai-gray-200));
          overflow-x: auto;
          position: relative;
        }
        
        .tabs::after {
          content: '';
          position: absolute;
          bottom: -1px;
          left: var(--tab-indicator-left, 0);
          width: var(--tab-indicator-width, 0);
          height: 2px;
          background: var(--ai-primary);
          transition: all var(--ai-duration-normal) var(--ai-ease-in-out);
        }

        .tab {
          padding: var(--ai-space-3) var(--ai-space-6);
          background: transparent;
          border: none;
          border-bottom: 2px solid transparent;
          cursor: pointer;
          font-size: var(--ai-font-body);
          font-weight: var(--ai-font-medium);
          color: var(--primary-text-color, var(--ai-gray-700));
          text-transform: uppercase;
          transition: all var(--ai-duration-normal) var(--ai-ease-in-out);
          position: relative;
          letter-spacing: 0.025em;
        }

        .tab:hover {
          background: var(--ai-primary-alpha-10);
          transform: translateY(-1px);
        }

        .tab.active {
          color: var(--ai-primary);
          border-bottom-color: transparent;
          font-weight: var(--ai-font-semibold);
        }

        .content {
          display: none;
        }

        .content.active {
          display: block;
          animation: fadeIn 0.3s ease;
        }

        @keyframes fadeIn {
          from { 
            opacity: 0;
            transform: translateY(10px);
          }
          to { 
            opacity: 1;
            transform: translateY(0);
          }
        }
        
        @keyframes slideDown {
          from {
            opacity: 0;
            transform: translateY(-20px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        .card {
          background: var(--card-background-color, var(--ai-gray-50));
          border-radius: var(--ai-radius-lg);
          padding: var(--ai-space-4);
          margin-bottom: var(--ai-space-4);
          box-shadow: var(--ai-shadow-md);
          border: 1px solid var(--ai-gray-200);
          transition: all var(--ai-duration-normal) var(--ai-ease-in-out);
        }
        
        .card:hover {
          box-shadow: var(--ai-shadow-lg);
          transform: translateY(-2px);
        }

        .input-group {
          margin-bottom: 16px;
        }

        label {
          display: block;
          margin-bottom: var(--ai-space-2);
          font-weight: var(--ai-font-medium);
          font-size: var(--ai-font-body);
          color: var(--secondary-text-color, var(--ai-gray-700));
          transition: color var(--ai-duration-fast) var(--ai-ease-out);
        }
        
        .input-group:focus-within label {
          color: var(--ai-primary);
        }

        input, textarea, select {
          width: 100%;
          padding: var(--ai-space-3);
          background: var(--card-background-color, white);
          border: 2px solid var(--ai-gray-300);
          border-radius: var(--ai-radius-md);
          color: var(--primary-text-color, var(--ai-gray-900));
          font-family: inherit;
          font-size: var(--ai-font-body);
          box-sizing: border-box;
          transition: all var(--ai-duration-fast) var(--ai-ease-out);
          outline: none;
        }

        input:focus, textarea:focus, select:focus {
          border-color: var(--ai-primary);
          box-shadow: 0 0 0 3px var(--ai-primary-alpha-20);
          transform: translateY(-1px);
        }

        textarea {
          min-height: 120px;
          resize: vertical;
          font-family: inherit;
        }

        .code-editor {
          font-family: 'Roboto Mono', 'Consolas', 'Monaco', monospace;
          font-size: 13px;
          line-height: 1.5;
        }

        button {
          padding: var(--ai-space-3) var(--ai-space-6);
          background: linear-gradient(135deg, var(--ai-primary) 0%, var(--ai-primary-dark) 100%);
          color: white;
          border: none;
          border-radius: var(--ai-radius-md);
          cursor: pointer;
          font-family: inherit;
          font-size: var(--ai-font-body);
          font-weight: var(--ai-font-medium);
          text-transform: uppercase;
          letter-spacing: 0.025em;
          transition: all var(--ai-duration-fast) var(--ai-ease-out);
          min-width: 100px;
          box-shadow: var(--ai-shadow-sm);
          position: relative;
          overflow: hidden;
        }
        
        button::before {
          content: '';
          position: absolute;
          top: 50%;
          left: 50%;
          width: 0;
          height: 0;
          border-radius: 50%;
          background: rgba(255, 255, 255, 0.3);
          transform: translate(-50%, -50%);
          transition: width var(--ai-duration-normal), height var(--ai-duration-normal);
        }
        
        button:active::before {
          width: 300px;
          height: 300px;
        }

        button:hover {
          transform: translateY(-2px) scale(1.02);
          box-shadow: var(--ai-shadow-md);
          background: linear-gradient(135deg, var(--ai-primary-light) 0%, var(--ai-primary) 100%);
        }

        button:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        button.secondary {
          background: transparent;
          color: var(--ai-primary);
          border: 2px solid var(--ai-primary);
          box-shadow: none;
        }

        button.secondary:hover {
          background: var(--ai-primary-alpha-10);
          border-color: var(--ai-primary-light);
          color: var(--ai-primary-dark);
        }

        .button-group {
          display: flex;
          gap: 8px;
          margin-top: 16px;
        }

        .output-section {
          margin-top: 24px;
        }

        .output-code {
          padding: 16px;
          background: var(--secondary-background-color);
          border-radius: 4px;
          overflow-x: auto;
          border: 1px solid var(--divider-color);
          margin-top: 8px;
        }

        .output-code pre {
          margin: 0;
          font-family: 'Roboto Mono', 'Consolas', monospace;
          font-size: 13px;
          line-height: 1.5;
          white-space: pre-wrap;
          word-wrap: break-word;
        }

        .entity-autocomplete {
          position: relative;
        }

        .entity-suggestions {
          position: fixed;
          background: var(--card-background-color, white);
          border: 1px solid var(--ai-gray-200);
          border-radius: var(--ai-radius-lg);
          max-height: 300px;
          overflow-y: auto;
          z-index: var(--ai-z-dropdown);
          box-shadow: var(--ai-shadow-xl);
          display: none;
          margin-top: var(--ai-space-1);
          min-width: 350px;
          backdrop-filter: blur(10px);
          animation: dropIn var(--ai-duration-fast) var(--ai-ease-out);
        }
        
        @keyframes dropIn {
          from {
            opacity: 0;
            transform: translateY(-10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        .entity-suggestions.show {
          display: block;
        }

        .entity-suggestion {
          padding: 8px 12px;
          cursor: pointer;
          border-bottom: 1px solid var(--divider-color);
          transition: background 0.2s;
        }

        .entity-suggestion:hover {
          background: var(--ai-primary-alpha-10);
          transform: translateX(4px);
        }
        
        .entity-suggestion.highlighted,
        .command-suggestion.highlighted {
          background: linear-gradient(135deg, var(--ai-primary) 0%, var(--ai-primary-dark) 100%);
          color: white;
          transform: translateX(4px);
          box-shadow: var(--ai-shadow-sm);
        }

        .entity-suggestion:last-child {
          border-bottom: none;
        }

        .entity-name {
          font-weight: 500;
          font-size: 14px;
        }

        .entity-name strong {
          background: var(--primary-color);
          color: white;
          padding: 1px 3px;
          border-radius: 2px;
          font-weight: 600;
        }

        .entity-info {
          font-size: 12px;
          color: var(--secondary-text-color);
          margin-top: 2px;
        }

        .command-suggestion {
          padding: 8px 12px;
          cursor: pointer;
          border-bottom: 1px solid var(--divider-color);
          transition: background 0.2s;
          background: var(--primary-background-color);
        }

        .command-suggestion:hover {
          background: var(--secondary-background-color);
        }

        .command-suggestion:last-child {
          border-bottom: none;
        }

        .command-suggestion .entity-name {
          color: var(--primary-color);
          font-weight: 600;
        }

        .preview-section {
          margin-top: 16px;
          padding: 12px;
          background: var(--secondary-background-color);
          border-radius: 4px;
        }

        .preview-entity {
          display: flex;
          justify-content: space-between;
          padding: 8px 0;
          border-bottom: 1px solid var(--divider-color);
        }

        .preview-entity:last-child {
          border-bottom: none;
        }

        .message {
          padding: var(--ai-space-3) var(--ai-space-4);
          border-radius: var(--ai-radius-md);
          margin: var(--ai-space-4) 0;
          animation: slideIn var(--ai-duration-normal) var(--ai-ease-bounce);
          display: flex;
          align-items: center;
          gap: var(--ai-space-2);
          font-weight: var(--ai-font-medium);
        }

        @keyframes slideIn {
          from {
            transform: translateY(-10px);
            opacity: 0;
          }
          to {
            transform: translateY(0);
            opacity: 1;
          }
        }

        .message.success {
          background: linear-gradient(135deg, var(--ai-success) 0%, var(--ai-success-dark) 100%);
          color: white;
          box-shadow: var(--ai-shadow-md);
        }

        .message.error {
          background: linear-gradient(135deg, var(--ai-error) 0%, var(--ai-error-dark) 100%);
          color: white;
          box-shadow: var(--ai-shadow-md);
        }

        .message.warning {
          background: linear-gradient(135deg, var(--ai-warning) 0%, var(--ai-warning-dark) 100%);
          color: white;
          box-shadow: var(--ai-shadow-md);
        }

        .message.info {
          background: linear-gradient(135deg, var(--ai-info) 0%, var(--ai-info-dark) 100%);
          color: white;
          box-shadow: var(--ai-shadow-md);
        }

        .loading {
          display: inline-block;
          width: 20px;
          height: 20px;
          border: 3px solid rgba(255, 255, 255, 0.3);
          border-radius: 50%;
          border-top-color: white;
          animation: spin 0.8s cubic-bezier(0.68, -0.55, 0.265, 1.55) infinite;
          vertical-align: middle;
          margin-right: var(--ai-space-2);
        }

        @keyframes spin {
          to { transform: rotate(360deg); }
        }

        .help-text {
          font-size: 12px;
          color: var(--secondary-text-color);
          margin-top: 4px;
        }

        h3 {
          margin: 0 0 16px 0;
          font-size: 18px;
          font-weight: 500;
        }

        .example-prompts {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
          margin-top: 8px;
        }

        .example-chip {
          padding: var(--ai-space-2) var(--ai-space-3);
          background: linear-gradient(135deg, var(--ai-primary) 0%, var(--ai-secondary) 100%);
          color: white;
          border-radius: var(--ai-radius-full);
          font-size: var(--ai-font-caption);
          cursor: pointer;
          transition: all var(--ai-duration-fast) var(--ai-ease-bounce);
          font-weight: var(--ai-font-medium);
          box-shadow: var(--ai-shadow-sm);
        }

        .example-chip:hover {
          transform: scale(1.08) translateY(-2px);
          box-shadow: var(--ai-shadow-md);
        }

        .detected-entity {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 12px;
          margin: 8px 0;
          background: var(--secondary-background-color);
          border: 1px solid var(--divider-color);
          border-radius: 6px;
          transition: background 0.2s;
        }

        .detected-entity:hover {
          background: var(--card-background-color);
        }

        .detected-entity.confirmed {
          border-color: var(--success-color, #4caf50);
          background: rgba(76, 175, 80, 0.1);
        }

        .detected-entity.rejected {
          border-color: var(--error-color, #f44336);
          background: rgba(244, 67, 54, 0.1);
        }

        /* Conversational Interface Styles */
        .chat-layout {
          display: flex;
          height: calc(100vh - 200px);
          max-height: 700px;
          gap: 16px;
        }

        .conversation-sidebar {
          width: 280px;
          flex-shrink: 0;
          background: var(--card-background-color);
          border-radius: 8px;
          display: flex;
          flex-direction: column;
          overflow: hidden;
          border: 1px solid var(--divider-color);
        }

        .sidebar-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 12px 16px;
          background: var(--primary-color);
          color: white;
          border-bottom: 1px solid var(--divider-color);
        }

        .sidebar-header h4 {
          margin: 0;
          font-size: 14px;
          font-weight: 500;
        }

        .new-conversation-btn {
          background: rgba(255, 255, 255, 0.2);
          border: none;
          border-radius: 4px;
          color: white;
          padding: 6px;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: background 0.2s ease;
        }

        .new-conversation-btn:hover {
          background: rgba(255, 255, 255, 0.3);
        }

        .conversations-list {
          flex: 1;
          overflow-y: auto;
          padding: 8px;
        }

        .conversation-item {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 12px;
          margin-bottom: 4px;
          background: transparent;
          border: none;
          border-radius: 6px;
          cursor: pointer;
          text-align: left;
          width: 100%;
          transition: background 0.2s ease;
          color: var(--primary-text-color);
        }

        .conversation-item:hover {
          background: var(--divider-color);
        }

        .conversation-item.active {
          background: var(--primary-color);
          color: white;
        }

        .conversation-content {
          flex: 1;
          overflow: hidden;
        }

        .conversation-title {
          font-size: 14px;
          font-weight: 500;
          margin-bottom: 4px;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .conversation-preview {
          font-size: 12px;
          opacity: 0.7;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .conversation-date {
          font-size: 11px;
          opacity: 0.6;
          white-space: nowrap;
        }

        .conversation-actions {
          display: none;
          align-items: center;
          gap: 4px;
        }

        .conversation-item:hover .conversation-actions {
          display: flex;
        }

        .conversation-delete-btn {
          background: none;
          border: none;
          color: inherit;
          padding: 4px;
          border-radius: 4px;
          cursor: pointer;
          opacity: 0.6;
          transition: opacity 0.2s ease;
        }

        .conversation-delete-btn:hover {
          opacity: 1;
          background: rgba(255, 255, 255, 0.1);
        }

        .conversation-deployments {
          margin-top: 8px;
          padding-top: 8px;
          border-top: 1px solid rgba(255, 255, 255, 0.1);
        }

        .deployment-indicator {
          display: inline-block;
          width: 6px;
          height: 6px;
          border-radius: 50%;
          margin-right: 4px;
        }

        .deployment-indicator.active {
          background-color: #4caf50;
        }

        .deployment-indicator.disabled {
          background-color: #ff9800;
        }

        .deployment-indicator.error {
          background-color: #f44336;
        }

        .deployment-indicator.deleted {
          background-color: #9e9e9e;
        }

        .deployment-count {
          font-size: 10px;
          background: rgba(255, 255, 255, 0.2);
          border-radius: 10px;
          padding: 2px 6px;
          margin-left: 4px;
        }

        .deployment-panel {
          margin-top: 16px;
          padding: 12px;
          background: var(--card-background-color);
          border-radius: 6px;
          border: 1px solid var(--divider-color);
        }

        .deployment-panel h5 {
          margin: 0 0 8px 0;
          font-size: 13px;
          font-weight: 500;
          color: var(--primary-text-color);
        }

        .deployment-item {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 8px 0;
          border-bottom: 1px solid var(--divider-color);
        }

        .deployment-item:last-child {
          border-bottom: none;
        }

        .deployment-info {
          flex: 1;
        }

        .deployment-entity {
          font-size: 12px;
          font-weight: 500;
          color: var(--primary-text-color);
        }

        .entity-link {
          color: var(--primary-color);
          text-decoration: none;
          cursor: pointer;
          transition: opacity 0.2s ease;
        }

        .entity-link:hover {
          opacity: 0.8;
          text-decoration: underline;
        }

        .deployment-status {
          font-size: 11px;
          color: var(--secondary-text-color);
          margin-top: 2px;
        }

        .deployment-actions {
          display: flex;
          gap: 4px;
        }

        .deployment-action-btn {
          background: none;
          border: 1px solid var(--divider-color);
          border-radius: 4px;
          padding: 4px 8px;
          font-size: 10px;
          cursor: pointer;
          color: var(--primary-text-color);
          transition: all 0.2s ease;
        }

        .deployment-action-btn:hover {
          background: var(--divider-color);
        }

        .deployment-action-btn.edit {
          color: var(--primary-color);
          border-color: var(--primary-color);
        }

        .deployment-action-btn.delete {
          color: var(--error-color, #f44336);
          border-color: var(--error-color, #f44336);
        }

        .deployment-action-btn.version {
          color: var(--info-color, #2196f3);
          border-color: var(--info-color, #2196f3);
        }

        .conversation-item.archived {
          opacity: 0.6;
          background: rgba(255, 165, 0, 0.1);
        }

        .conversation-item.archived .conversation-title::after {
          content: " (Archived)";
          font-size: 10px;
          color: var(--warning-color, #ff9800);
        }

        .chat-container {
          display: flex;
          flex-direction: column;
          flex: 1;
          background: var(--card-background-color);
          border-radius: 8px;
          overflow: hidden;
        }

        .chat-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 16px;
          background: var(--primary-color);
          color: white;
        }

        .chat-header h3 {
          margin: 0;
          font-size: 16px;
          font-weight: 500;
        }

        .chat-status {
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 12px;
          opacity: 0.9;
        }

        .chat-status-dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          background: #4caf50;
          animation: pulse 2s infinite;
        }

        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }

        .chat-messages {
          flex: 1;
          overflow-y: auto;
          padding: 16px;
          background: var(--secondary-background-color);
          scroll-behavior: smooth;
        }

        .chat-message {
          display: flex;
          margin-bottom: 16px;
          animation: slideInUp 0.3s ease-out;
        }

        @keyframes slideInUp {
          from {
            opacity: 0;
            transform: translateY(20px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        .chat-message.user {
          justify-content: flex-end;
        }

        .chat-message.assistant {
          justify-content: flex-start;
        }

        .chat-message.system {
          justify-content: center;
        }

        .message-bubble {
          max-width: 70%;
          padding: 12px 16px;
          border-radius: 18px;
          position: relative;
          word-wrap: break-word;
        }

        .user .message-bubble {
          background: var(--primary-color);
          color: white;
          border-bottom-right-radius: 4px;
        }

        .assistant .message-bubble {
          background: var(--card-background-color);
          color: var(--primary-text-color);
          border-bottom-left-radius: 4px;
          box-shadow: 0 1px 2px rgba(0, 0, 0, 0.1);
        }

        .system .message-bubble {
          background: var(--info-color);
          color: white;
          font-size: 12px;
          padding: 8px 12px;
          border-radius: 12px;
        }

        .message-content {
          font-size: 14px;
          line-height: 1.5;
        }

        .message-timestamp {
          font-size: 11px;
          opacity: 0.7;
          margin-top: 4px;
        }

        .typing-indicator {
          display: flex;
          align-items: center;
          gap: 4px;
          padding: 8px 12px;
        }

        .typing-indicator span {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          background: var(--secondary-text-color);
          animation: typing 1.4s infinite;
        }

        .typing-indicator span:nth-child(2) {
          animation-delay: 0.2s;
        }

        .typing-indicator span:nth-child(3) {
          animation-delay: 0.4s;
        }

        @keyframes typing {
          0%, 60%, 100% { opacity: 0.3; }
          30% { opacity: 1; }
        }

        .chat-input-container {
          padding: 16px;
          background: var(--card-background-color);
          border-top: 1px solid var(--divider-color);
          overflow: visible;
          position: relative;
        }

        .chat-input-wrapper {
          display: flex;
          gap: 8px;
          align-items: flex-end;
        }

        .test-prompt-btn {
          padding: 8px 12px;
          background: var(--warning-color, #ffa726);
          color: white;
          border: none;
          border-radius: 4px;
          font-size: 12px;
          cursor: pointer;
          white-space: nowrap;
          transition: background 0.2s;
        }

        .test-prompt-btn:hover {
          background: var(--warning-color-dark, #fb8c00);
          opacity: 0.9;
        }

        .chat-input {
          flex: 1;
          min-height: 40px;
          max-height: 120px;
          padding: 10px 16px;
          border: 1px solid var(--divider-color);
          border-radius: 24px;
          background: var(--secondary-background-color);
          font-size: 14px;
          font-family: inherit;
          resize: none;
          outline: none;
          transition: border-color 0.2s;
        }

        .chat-input:focus {
          border-color: var(--primary-color);
        }

        .chat-send-btn {
          width: 40px;
          height: 40px;
          min-width: 40px;
          min-height: 40px;
          border-radius: 50%;
          background: var(--primary-color);
          color: white;
          border: none;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: all 0.2s;
          flex-shrink: 0;
        }

        .chat-send-btn:hover:not(:disabled) {
          transform: scale(1.1);
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
        }

        .chat-send-btn:disabled {
          opacity: 0.5;
          cursor: not-allowed;
          transform: none;
        }

        .chat-send-btn svg {
          width: 18px;
          height: 18px;
        }

        .chat-quick-actions {
          display: flex;
          gap: 8px;
          margin-top: 8px;
          flex-wrap: wrap;
        }

        .quick-action-chip {
          padding: 6px 12px;
          background: var(--secondary-background-color);
          border: 1px solid var(--divider-color);
          border-radius: 16px;
          font-size: 12px;
          cursor: pointer;
          transition: all 0.2s;
        }

        .quick-action-chip:hover {
          background: var(--primary-color);
          color: white;
          border-color: var(--primary-color);
        }

        .entity-confirm-card {
          background: var(--card-background-color);
          border: 1px solid var(--divider-color);
          border-radius: 8px;
          padding: 12px;
          margin: 8px 0;
        }

        .entity-confirm-header {
          display: flex;
          align-items: center;
          gap: 8px;
          margin-bottom: 12px;
          font-weight: 500;
        }

        .entity-confirm-list {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        .entity-confirm-item {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 8px;
          background: var(--secondary-background-color);
          border-radius: 4px;
          font-size: 13px;
        }

        .entity-confirm-item.confirmed {
          background: rgba(76, 175, 80, 0.1);
          border: 1px solid var(--success-color);
        }

        .entity-confirm-actions {
          display: flex;
          gap: 8px;
          margin-top: 12px;
        }

        .config-preview-message {
          background: var(--card-background-color);
          border-radius: 8px;
          padding: 12px;
          margin: 8px 0;
        }

        .config-preview-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 12px;
        }

        .config-preview-type {
          display: inline-block;
          padding: 4px 8px;
          background: var(--primary-color);
          color: white;
          border-radius: 4px;
          font-size: 11px;
          text-transform: uppercase;
          font-weight: 500;
        }

        .config-preview-code {
          background: var(--secondary-background-color);
          border: 1px solid var(--divider-color);
          border-radius: 4px;
          padding: 12px;
          font-family: 'Roboto Mono', monospace;
          font-size: 12px;
          overflow-x: auto;
          max-height: 300px;
          overflow-y: auto;
        }

        .config-preview-actions {
          display: flex;
          gap: 8px;
          margin-top: 12px;
        }

        .config-preview-actions button {
          padding: 8px 16px;
          border-radius: 4px;
          border: 1px solid var(--divider-color);
          background: white;
          cursor: pointer;
          font-size: 13px;
          transition: all 0.2s;
        }

        .config-preview-actions button:hover {
          background: var(--primary-color);
          color: white;
          border-color: var(--primary-color);
        }

        .config-preview-actions button.primary {
          background: var(--primary-color);
          color: white;
          border-color: var(--primary-color);
        }

        .error-logs-container {
          margin-top: 8px;
          background: var(--secondary-background-color);
          border-radius: 4px;
          overflow: hidden;
        }

        .error-logs-toggle {
          width: 100%;
          padding: 8px 12px;
          background: none;
          border: none;
          text-align: left;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: space-between;
          font-size: 12px;
          color: var(--secondary-text-color);
          transition: background 0.2s;
        }

        .error-logs-toggle:hover {
          background: rgba(0, 0, 0, 0.05);
        }

        .error-logs-content {
          position: relative;
          padding: 12px;
          background: var(--card-background-color);
          border-top: 1px solid var(--divider-color);
          font-family: 'Roboto Mono', monospace;
          font-size: 11px;
          color: var(--error-color);
          white-space: pre-wrap;
          word-wrap: break-word;
          max-height: 200px;
          overflow-y: auto;
        }

        .error-logs-copy-btn {
          position: absolute;
          top: 8px;
          right: 8px;
          padding: 4px 8px;
          background: var(--primary-color);
          color: white;
          border: none;
          border-radius: 4px;
          cursor: pointer;
          font-size: 11px;
          z-index: 1;
          transition: background 0.2s;
        }

        .error-logs-copy-btn:hover {
          background: var(--primary-color-dark, var(--primary-color));
          opacity: 0.9;
        }

        .error-logs-copy-btn.copied {
          background: var(--success-color, #4caf50);
        }

        .error-logs-text {
          padding-right: 60px;
        }

        .error-logs-content.hidden {
          display: none;
        }

        .chevron {
          transition: transform 0.2s;
        }

        .chevron.expanded {
          transform: rotate(90deg);
        }

        @media (max-width: 768px) {
          .chat-layout {
            flex-direction: column;
            height: calc(100vh - 150px);
          }

          .conversation-sidebar {
            width: 100%;
            height: 200px;
            order: 2;
          }

          .chat-container {
            order: 1;
            height: calc(100% - 216px);
          }
          
          .message-bubble {
            max-width: 85%;
          }
          
          .chat-quick-actions {
            justify-content: center;
          }
        }

        .entity-match-info {
          flex-grow: 1;
        }

        .entity-match-name {
          font-weight: 500;
          margin-bottom: 4px;
        }

        .entity-match-details {
          font-size: 12px;
          color: var(--secondary-text-color);
        }

        .entity-actions {
          display: flex;
          gap: 8px;
        }

        .entity-action-btn {
          padding: 4px 8px;
          font-size: 12px;
          border: none;
          border-radius: 3px;
          cursor: pointer;
          transition: all 0.2s;
        }

        .entity-action-btn.confirm {
          background: var(--success-color, #4caf50);
          color: white;
        }

        .entity-action-btn.reject {
          background: var(--error-color, #f44336);
          color: white;
        }

        .entity-action-btn.change {
          background: var(--warning-color, #ff9800);
          color: white;
        }

        .detected-word {
          background: rgba(3, 169, 244, 0.2);
          padding: 2px 4px;
          border-radius: 3px;
          font-weight: 500;
        }
      </style>

      <div class="container">
        <div class="header">
          <h1>Aight</h1>
          <div style="display: flex; align-items: center; gap: 16px;">
            <div class="status" id="entity-count"></div>
            <button id="reload-btn" class="secondary" style="min-width: auto; padding: 8px 16px;">🔄 Reload</button>
          </div>
        </div>

        <div class="tabs">
          <button class="tab active" data-tab="chat">Chat</button>
          <button class="tab" data-tab="generate">Form</button>
          <button class="tab" data-tab="validate">Validate</button>
          <button class="tab" data-tab="preview">Preview</button>
          <button class="tab" data-tab="debug">LLM Debug</button>
          <button class="tab" data-tab="help">Help</button>
        </div>

        <div class="content active" id="chat">
          <div class="chat-layout">
            <div class="conversation-sidebar">
              <div class="sidebar-header">
                <h4>💬 Conversations</h4>
                <button class="new-conversation-btn" id="new-conversation-btn" title="Start new conversation">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <line x1="12" y1="5" x2="12" y2="19"></line>
                    <line x1="5" y1="12" x2="19" y2="12"></line>
                  </svg>
                </button>
              </div>
              <div class="conversations-list" id="conversations-list">
                <!-- Conversations will be loaded here -->
              </div>
            </div>
            <div class="chat-container">
              <div class="chat-header">
                <h3>🤖 AI Configuration Assistant</h3>
                <div class="chat-status">
                  <span class="chat-status-dot"></span>
                  <span>Ready</span>
                </div>
              </div>
              <div class="chat-messages" id="chat-messages">
                <!-- Messages will be added here dynamically -->
              </div>
              <div class="deployment-panel" id="deployment-panel" style="display: none;">
                <!-- Deployment information will be shown here -->
              </div>
              <div class="chat-input-container">
                <div class="chat-input-wrapper">
                  <div class="entity-autocomplete" style="position: relative; width: 100%;">
                    <textarea 
                      class="chat-input" 
                      id="chat-input"
                      placeholder="Describe what you want to configure..."
                      rows="1"
                    ></textarea>
                    <div class="entity-suggestions" id="chat-entity-suggestions"></div>
                  </div>
                  <button class="test-prompt-btn" id="test-prompt-btn" title="Test with: Turn on the kitchen lights in 4 minutes">
                    🧪 Test
                  </button>
                  <button class="chat-send-btn" id="chat-send-btn">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                      <line x1="22" y1="2" x2="11" y2="13"></line>
                      <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
                    </svg>
                  </button>
                </div>
                <div class="chat-quick-actions">
                  <div class="quick-action-chip" data-action="automation">Create Automation</div>
                  <div class="quick-action-chip" data-action="scene">Create Scene</div>
                  <div class="quick-action-chip" data-action="script">Create Script</div>
                  <div class="quick-action-chip" data-action="dashboard">Create Dashboard</div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div class="content" id="generate">
          <div class="card">
            <div class="input-group">
              <label>Configuration Type</label>
              <select id="config-type">
                <option value="automation">Automation</option>
                <option value="script">Script</option>
                <option value="scene">Scene</option>
                <option value="dashboard">Dashboard</option>
                <option value="template">Template Sensor</option>
              </select>
              <div class="help-text">Select the type of configuration you want to generate</div>
            </div>

            <div class="input-group entity-autocomplete">
              <label>Describe what you want to create</label>
              <textarea id="prompt" placeholder="Example: Turn on living room lights when motion is detected after sunset"></textarea>
              <div class="entity-suggestions" id="entity-suggestions"></div>
              <div class="help-text">Use natural language to describe your automation. Entity names will autocomplete as you type.</div>
              
              <div class="example-prompts">
                <div class="example-chip" data-prompt="Turn on lights when I arrive home">Arrival automation</div>
                <div class="example-chip" data-prompt="Send notification when washing machine is done">Appliance monitor</div>
                <div class="example-chip" data-prompt="Dim lights for movie time">Scene creator</div>
                <div class="example-chip" data-prompt="Turn off everything when leaving">Away mode</div>
              </div>
            </div>

            <div class="button-group">
              <button id="generate-btn">Generate Configuration</button>
              <button id="clear-btn" class="secondary">Clear</button>
            </div>
          </div>

          <div class="output-section" id="entity-detection" style="display: none;">
            <div class="card">
              <h3>🔍 Detected Entities</h3>
              <p>I found these entities based on your description. Please confirm or modify them:</p>
              <div id="detected-entities-list"></div>
              <div class="button-group">
                <button id="confirm-entities-btn">✓ Confirm & Generate</button>
                <button id="skip-detection-btn" class="secondary">Skip Detection</button>
              </div>
            </div>
          </div>

          <div class="output-section" id="generate-output" style="display: none;">
            <div class="card">
              <h3>Generated Configuration</h3>
              <div id="explanation"></div>
              <div class="output-code">
                <pre id="generated-config"></pre>
              </div>
              <div class="button-group">
                <button id="copy-btn">Copy to Clipboard</button>
                <button id="validate-generated-btn" class="secondary">Validate</button>
                <button id="preview-generated-btn" class="secondary">Preview</button>
              </div>
            </div>
          </div>
        </div>

        <div class="content" id="validate">
          <div class="card">
            <div class="input-group">
              <label>Configuration Type</label>
              <select id="validate-type">
                <option value="automation">Automation</option>
                <option value="script">Script</option>
                <option value="scene">Scene</option>
                <option value="dashboard">Dashboard</option>
                <option value="template">Template Sensor</option>
              </select>
            </div>

            <div class="input-group">
              <label>Configuration YAML</label>
              <textarea id="config-yaml" class="code-editor" placeholder="Paste your YAML configuration here..."></textarea>
              <div class="help-text">Paste your YAML configuration to validate its syntax</div>
            </div>

            <div class="button-group">
              <button id="validate-btn">Validate Configuration</button>
            </div>

            <div id="validation-results"></div>
          </div>
        </div>

        <div class="content" id="preview">
          <div class="card">
            <div class="input-group">
              <label>Configuration Type</label>
              <select id="preview-type">
                <option value="automation">Automation</option>
                <option value="script">Script</option>
                <option value="scene">Scene</option>
                <option value="dashboard">Dashboard</option>
                <option value="template">Template Sensor</option>
              </select>
            </div>

            <div class="input-group">
              <label>Configuration YAML</label>
              <textarea id="preview-yaml" class="code-editor" placeholder="Paste your YAML configuration here..."></textarea>
              <div class="help-text">Preview how your configuration will work with current entity states</div>
            </div>

            <div class="button-group">
              <button id="preview-btn">Preview with Live Data</button>
            </div>

            <div id="preview-results"></div>
          </div>
        </div>

        <div class="content" id="debug">
          <div class="card">
            <h3>LLM Request & Response Debug</h3>
            <p>This tab shows the actual request sent to the LLM and the raw response received. Useful for debugging and understanding how the AI processes your prompts.</p>
            
            <div id="debug-content" style="display: none;">
              <div class="input-group">
                <label>Request Sent to LLM</label>
                <div class="output-code">
                  <pre id="llm-request"></pre>
                </div>
              </div>
              
              <div class="input-group">
                <label>Raw Response from LLM</label>
                <div class="output-code">
                  <pre id="llm-response"></pre>
                </div>
              </div>
              
              <div class="input-group">
                <label>Processing Details</label>
                <div class="output-code">
                  <pre id="llm-metadata"></pre>
                </div>
              </div>
            </div>
            
            <div id="debug-placeholder">
              <div class="message info">Generate a configuration first to see the LLM request and response details.</div>
            </div>
          </div>
        </div>

        <div class="content" id="help">
          <div class="card">
            <h3>How to Use Aight</h3>
            
            <h4>Generate Configurations</h4>
            <p>Use natural language to describe what you want. Examples:</p>
            <ul>
              <li>"Turn on porch light at sunset and off at sunrise"</li>
              <li>"Alert me when the garage door is left open for more than 10 minutes"</li>
              <li>"Create a bedtime routine that locks doors and turns off lights"</li>
              <li>"Show all temperature sensors on a dashboard"</li>
            </ul>

            <h4>Smart Entity Detection</h4>
            <p>Aight automatically detects entities mentioned in your prompt:</p>
            <ul>
              <li><strong>Location Intelligence:</strong> Recognizes gym, kitchen, bedroom, etc.</li>
              <li><strong>Device Recognition:</strong> Understands lights, switches, sensors, fans, etc.</li>
              <li><strong>Interactive Confirmation:</strong> Shows detected entities for you to approve</li>
              <li><strong>LLM Integration:</strong> Uses confirmed entities for accurate results</li>
            </ul>

            <h4>Entity Autocomplete</h4>
            <p>Start typing entity names like <code>light.</code> or <code>switch.</code> to see suggestions from your system.</p>

            <h4>LLM Debug Tab</h4>
            <p>View exactly how your requests are processed:</p>
            <ul>
              <li><strong>System Prompt:</strong> Includes curated entity context and instructions</li>
              <li><strong>Entity Context:</strong> Relevant entities with states and friendly names</li>
              <li><strong>Processing Details:</strong> Metadata about entity detection and matching</li>
            </ul>

            <h4>Validate & Preview</h4>
            <p>Use the Validate tab to check YAML syntax, and Preview to see how configurations work with your current entity states.</p>

            <h4>Reload Integration</h4>
            <p>Click the "🔄 Reload" button in the header to reload the integration without restarting Home Assistant. This is useful when:</p>
            <ul>
              <li>Installing updates to the integration</li>
              <li>Changing configuration settings</li>
              <li>Troubleshooting issues</li>
            </ul>

            <h4>Available Services</h4>
            <p>You can also use these services programmatically:</p>
            <ul>
              <li><code>ai_config_assistant.generate_config</code> - Generate configurations</li>
              <li><code>ai_config_assistant.validate_config</code> - Validate YAML</li>
              <li><code>ai_config_assistant.preview_config</code> - Preview with live data</li>
              <li><code>ai_config_assistant.reload</code> - Reload the integration</li>
            </ul>
          </div>
        </div>
      </div>

      <div id="temp-messages"></div>
    `;

    this._attachListeners();
  }

  _attachListeners() {
    const root = this.shadowRoot;

    // Initialize chat on first render
    this._initializeChat();

    // Tab switching
    root.querySelectorAll('.tab').forEach(tab => {
      tab.addEventListener('click', () => {
        root.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
        root.querySelectorAll('.content').forEach(c => c.classList.remove('active'));
        
        tab.classList.add('active');
        const targetId = tab.dataset.tab;
        const target = root.getElementById(targetId);
        if (target) target.classList.add('active');
        
        this._currentTab = targetId;
      });
    });

    // Example chips
    root.querySelectorAll('.example-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        const prompt = chip.dataset.prompt;
        root.getElementById('prompt').value = prompt;
      });
    });

    // Generate button
    const generateBtn = root.getElementById('generate-btn');
    if (generateBtn) {
      generateBtn.addEventListener('click', () => this._generateConfig());
    }

    // Clear button
    const clearBtn = root.getElementById('clear-btn');
    if (clearBtn) {
      clearBtn.addEventListener('click', () => {
        root.getElementById('prompt').value = '';
        root.getElementById('generate-output').style.display = 'none';
      });
    }

    // Copy button
    const copyBtn = root.getElementById('copy-btn');
    if (copyBtn) {
      copyBtn.addEventListener('click', () => {
        const config = root.getElementById('generated-config').textContent;
        navigator.clipboard.writeText(config).then(() => {
          this._showMessage('Copied to clipboard!', 'success');
        });
      });
    }

    // Validate button
    const validateBtn = root.getElementById('validate-btn');
    if (validateBtn) {
      validateBtn.addEventListener('click', () => this._validateConfig());
    }

    // Preview button
    const previewBtn = root.getElementById('preview-btn');
    if (previewBtn) {
      previewBtn.addEventListener('click', () => this._previewConfig());
    }

    // Entity autocomplete with debouncing
    const promptField = root.getElementById('prompt');
    console.log('🎯 Prompt field found:', !!promptField, promptField?.tagName, promptField?.id);
    console.log('🔍 All prompt elements:', root.querySelectorAll('[id*="prompt"], [name*="prompt"], textarea, input[type="text"]'));
    if (promptField) {
      console.log('🔗 Adding event listener to prompt field');
      promptField.addEventListener('input', (e) => {
        const value = e.target.value;
        console.log('📝 Input event fired:', value);
        clearTimeout(this._autocompleteTimeout);
        this._autocompleteTimeout = setTimeout(() => {
          this._handleEntityAutocomplete(value);
        }, 150);
      });
      
      // Hide suggestions when clicking outside
      promptField.addEventListener('blur', () => {
        setTimeout(() => {
          const suggestionsDiv = root.getElementById('entity-suggestions');
          suggestionsDiv.classList.remove('show');
        }, 200); // Small delay to allow click on suggestion
      });
      
      // Keyboard navigation
      promptField.addEventListener('keydown', (e) => {
        this._handleKeyboardNavigation(e, 'entity-suggestions');
      });
    }

    // Transfer generated config to validate
    const validateGeneratedBtn = root.getElementById('validate-generated-btn');
    if (validateGeneratedBtn) {
      validateGeneratedBtn.addEventListener('click', () => {
        const config = root.getElementById('generated-config').textContent;
        root.getElementById('config-yaml').value = config;
        root.querySelector('[data-tab="validate"]').click();
      });
    }

    // Transfer generated config to preview
    const previewGeneratedBtn = root.getElementById('preview-generated-btn');
    if (previewGeneratedBtn) {
      previewGeneratedBtn.addEventListener('click', () => {
        const config = root.getElementById('generated-config').textContent;
        root.getElementById('preview-yaml').value = config;
        root.querySelector('[data-tab="preview"]').click();
      });
    }

    // Reload button
    const reloadBtn = root.getElementById('reload-btn');
    if (reloadBtn) {
      reloadBtn.addEventListener('click', () => this._reloadIntegration());
    }

    // Entity detection buttons
    const confirmEntitiesBtn = root.getElementById('confirm-entities-btn');
    if (confirmEntitiesBtn) {
      confirmEntitiesBtn.addEventListener('click', () => this._confirmDetectedEntities());
    }

    const skipDetectionBtn = root.getElementById('skip-detection-btn');
    if (skipDetectionBtn) {
      skipDetectionBtn.addEventListener('click', () => this._skipEntityDetection());
    }

    // Chat interface event listeners
    const chatInput = root.getElementById('chat-input');
    console.log('🎯 Chat input field found:', !!chatInput, chatInput?.tagName, chatInput?.id);
    
    // Add autocomplete to chat input as well
    if (chatInput) {
      console.log('🔗 Adding event listener to chat input field');
      chatInput.addEventListener('input', (e) => {
        const value = e.target.value;
        console.log('📝 Chat input event fired:', value);
        clearTimeout(this._chatAutocompleteTimeout);
        this._chatAutocompleteTimeout = setTimeout(() => {
          this._handleEntityAutocomplete(value);
        }, 150);
      });
      
      // Hide suggestions when clicking outside  
      chatInput.addEventListener('blur', () => {
        setTimeout(() => {
          const suggestionsDiv = root.getElementById('chat-entity-suggestions');
          if (suggestionsDiv) suggestionsDiv.classList.remove('show');
        }, 200);
      });
      
      // Keyboard navigation
      chatInput.addEventListener('keydown', (e) => {
        this._handleKeyboardNavigation(e, 'chat-entity-suggestions');
      });
    }
    const chatSendBtn = root.getElementById('chat-send-btn');
    const testPromptBtn = root.getElementById('test-prompt-btn');
    const newConversationBtn = root.getElementById('new-conversation-btn');
    
    if (chatInput && chatSendBtn) {
      // Send message on button click
      chatSendBtn.addEventListener('click', () => this._sendChatMessage());
      
      // Test prompt button
      if (testPromptBtn) {
        testPromptBtn.addEventListener('click', () => {
          chatInput.value = 'Turn on the kitchen lights in 4 minutes';
          this._sendChatMessage();
        });
      }
      
      // Send message on Enter (without Shift)
      chatInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          this._sendChatMessage();
        }
      });
      
      // Auto-resize textarea
      chatInput.addEventListener('input', () => {
        chatInput.style.height = 'auto';
        chatInput.style.height = Math.min(chatInput.scrollHeight, 120) + 'px';
      });
    }

    // Conversation management event listeners
    if (newConversationBtn) {
      newConversationBtn.addEventListener('click', () => this._startNewConversation());
    }

    // Initialize conversation management
    this._initializeConversationManager();
    
    // Quick action chips
    root.querySelectorAll('.quick-action-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        const action = chip.dataset.action;
        this._handleQuickAction(action);
      });
    });
  }

  _confirmDetectedEntities() {
    const confirmedEntities = this._detectedEntities
      .filter(detection => detection.confirmed)
      .map(detection => detection.entity);
    
    this._proceedWithGeneration(this._currentPrompt, this._currentConfigType, confirmedEntities);
  }

  _skipEntityDetection() {
    this._proceedWithGeneration(this._currentPrompt, this._currentConfigType, []);
  }

  async _loadEntities() {
    if (!this._hass) return;

    try {
      this._entities = Object.keys(this._hass.states).map(entityId => ({
        entity_id: entityId,
        friendly_name: this._hass.states[entityId].attributes.friendly_name || entityId,
        state: this._hass.states[entityId].state
      }));
      
      const entityCount = this.shadowRoot.getElementById('entity-count');
      if (entityCount) {
        entityCount.textContent = this._entities.length + ' entities loaded';
      }
    } catch (error) {
      console.error('Failed to load entities:', error);
    }
  }

  async _generateConfig() {
    const root = this.shadowRoot;
    const prompt = root.getElementById('prompt').value;
    const configType = root.getElementById('config-type').value;

    if (!prompt) {
      this._showMessage('Please enter a description', 'error');
      return;
    }

    const generateBtn = root.getElementById('generate-btn');
    generateBtn.disabled = true;
    generateBtn.innerHTML = '<span class="loading"></span> Analyzing...';

    try {
      // First, detect entities in the prompt
      const detectedEntities = this._detectEntitiesInPrompt(prompt);
      
      if (detectedEntities.length > 0) {
        // Show entity detection interface
        this._showEntityDetection(detectedEntities, prompt, configType);
      } else {
        // No entities detected, proceed with normal generation
        this._proceedWithGeneration(prompt, configType);
      }
      
    } catch (error) {
      this._showMessage('Error: ' + error.message, 'error');
    } finally {
      generateBtn.disabled = false;
      generateBtn.innerHTML = 'Generate Configuration';
    }
  }

  async _proceedWithGeneration(prompt, configType, confirmedEntities = []) {
    const root = this.shadowRoot;

    try {
      // Store debug info for the debug tab
      const debugInfo = {
        prompt: prompt,
        type: configType,
        timestamp: new Date().toISOString(),
        entities_count: this._entities.length,
        confirmed_entities: confirmedEntities
      };

      await this._hass.callService('ai_config_assistant', 'generate_config', {
        prompt: prompt,
        type: configType,
        entities: confirmedEntities.map(e => e.entity_id) // Pass confirmed entity IDs
      });

      // Hide entity detection and show output
      root.getElementById('entity-detection').style.display = 'none';
      root.getElementById('generate-output').style.display = 'block';
      
      this._showMessage('Configuration generated! The result will appear in the logs.', 'success');
      
      // For now, show a sample configuration
      const sampleConfig = this._getSampleConfig(configType, prompt, confirmedEntities);
      root.getElementById('generated-config').textContent = sampleConfig;
      
      let explanation = '<div class="message info">Check Home Assistant logs for the actual AI-generated configuration.</div>';
      if (confirmedEntities.length > 0) {
        explanation += `<div class="message success">Using ${confirmedEntities.length} confirmed entities: ${confirmedEntities.map(e => e.entity_id).join(', ')}</div>`;
      }
      root.getElementById('explanation').innerHTML = explanation;
      
      // Update debug tab with mock data
      this._updateDebugTab(debugInfo, sampleConfig);
      
    } catch (error) {
      this._showMessage('Error: ' + error.message, 'error');
    }
  }

  _updateDebugTab(debugInfo, generatedConfig) {
    const root = this.shadowRoot;
    
    // Show debug content and hide placeholder
    root.getElementById('debug-content').style.display = 'block';
    root.getElementById('debug-placeholder').style.display = 'none';
    
    // Create a more focused entity list - include detected entities + a sampling of others
    let entitiesToInclude = [];
    
    // If we have confirmed entities, prioritize those
    if (debugInfo.confirmed_entities && debugInfo.confirmed_entities.length > 0) {
      entitiesToInclude = debugInfo.confirmed_entities.slice();
    }
    
    // Add a sample of other entities, grouped by domain
    const entitiesByDomain = {};
    this._entities.forEach(e => {
      const domain = e.entity_id.split('.')[0];
      if (!entitiesByDomain[domain]) entitiesByDomain[domain] = [];
      entitiesByDomain[domain].push(e);
    });
    
    // Add up to 3 entities per domain, up to 50 total entities
    Object.keys(entitiesByDomain).forEach(domain => {
      const domainEntities = entitiesByDomain[domain].slice(0, 3);
      entitiesToInclude.push(...domainEntities);
    });
    
    // Remove duplicates and limit to 50 entities
    const uniqueEntities = entitiesToInclude.filter((entity, index, array) => 
      array.findIndex(e => e.entity_id === entity.entity_id) === index
    ).slice(0, 50);
    
    const entityContext = uniqueEntities.map(e => `${e.entity_id} (${e.friendly_name}) - State: ${e.state}`).join('\n');
    
    // Mock LLM request (this would be the actual prompt sent to the LLM)
    const mockRequest = {
      model: "gpt-3.5-turbo",
      messages: [
        {
          role: "system",
          content: `You are a Home Assistant configuration assistant. Generate valid YAML configurations based on user requests.

Available Home Assistant entities:
${entityContext}

Instructions:
1. Analyze the user's natural language request
2. Identify which entities are most relevant to their request
3. Generate a complete, valid YAML configuration using the appropriate entities
4. Use entity IDs exactly as provided above
5. Consider entity states and friendly names when making matches
6. For locations (gym, kitchen, etc.), look for entities with those words in their ID or friendly name
7. For device types (lights, switches, etc.), use the appropriate domain and look for matching friendly names`
        },
        {
          role: "user", 
          content: `Create a Home Assistant ${debugInfo.type} based on this request: "${debugInfo.prompt}"${debugInfo.confirmed_entities && debugInfo.confirmed_entities.length > 0 ? `\n\nUser has specifically selected these entities as relevant: ${debugInfo.confirmed_entities.map(e => e.entity_id).join(', ')}` : ''}`
        }
      ],
      temperature: 0.1,
      max_tokens: 2000
    };
    
    // Mock LLM response
    const mockResponse = {
      id: "chatcmpl-" + Math.random().toString(36).substring(7),
      object: "chat.completion",
      created: Math.floor(Date.now() / 1000),
      model: "gpt-3.5-turbo-0613",
      choices: [
        {
          index: 0,
          message: {
            role: "assistant",
            content: generatedConfig
          },
          finish_reason: "stop"
        }
      ],
      usage: {
        prompt_tokens: Math.floor(Math.random() * 200) + 100,
        completion_tokens: Math.floor(Math.random() * 500) + 200,
        total_tokens: Math.floor(Math.random() * 700) + 300
      }
    };
    
    // Processing metadata
    const metadata = {
      timestamp: debugInfo.timestamp,
      config_type: debugInfo.type,
      user_prompt: debugInfo.prompt,
      entities_available: debugInfo.entities_count,
      entities_in_context: uniqueEntities.length,
      confirmed_entities: debugInfo.confirmed_entities ? debugInfo.confirmed_entities.map(e => e.entity_id) : [],
      entity_detection_used: debugInfo.confirmed_entities && debugInfo.confirmed_entities.length > 0,
      processing_time_ms: Math.floor(Math.random() * 3000) + 500,
      provider: "openai",
      approach: "LLM entity matching with curated context"
    };
    
    // Update the debug displays
    root.getElementById('llm-request').textContent = JSON.stringify(mockRequest, null, 2);
    root.getElementById('llm-response').textContent = JSON.stringify(mockResponse, null, 2);
    root.getElementById('llm-metadata').textContent = JSON.stringify(metadata, null, 2);
  }

  async _validateConfig() {
    const root = this.shadowRoot;
    const configYaml = root.getElementById('config-yaml').value;
    const configType = root.getElementById('validate-type').value;

    if (!configYaml) {
      this._showMessage('Please enter a configuration', 'error');
      return;
    }

    const validateBtn = root.getElementById('validate-btn');
    validateBtn.disabled = true;
    validateBtn.innerHTML = '<span class="loading"></span> Validating...';

    try {
      await this._hass.callService('ai_config_assistant', 'validate_config', {
        config: configYaml,
        type: configType
      });

      const resultsDiv = root.getElementById('validation-results');
      resultsDiv.innerHTML = '<div class="card"><div class="message success">Validation request sent! Check the logs for detailed results.</div></div>';
      
    } catch (error) {
      this._showMessage('Error: ' + error.message, 'error');
    } finally {
      validateBtn.disabled = false;
      validateBtn.innerHTML = 'Validate Configuration';
    }
  }

  async _previewConfig() {
    const root = this.shadowRoot;
    const configYaml = root.getElementById('preview-yaml').value;
    const configType = root.getElementById('preview-type').value;

    if (!configYaml) {
      this._showMessage('Please enter a configuration', 'error');
      return;
    }

    const previewBtn = root.getElementById('preview-btn');
    previewBtn.disabled = true;
    previewBtn.innerHTML = '<span class="loading"></span> Loading Preview...';

    try {
      await this._hass.callService('ai_config_assistant', 'preview_config', {
        config: configYaml,
        type: configType
      });

      const resultsDiv = root.getElementById('preview-results');
      resultsDiv.innerHTML = '<div class="card"><div class="message info">Preview request sent! Check the logs for results.</div></div>';
      
    } catch (error) {
      this._showMessage('Error: ' + error.message, 'error');
    } finally {
      previewBtn.disabled = false;
      previewBtn.innerHTML = 'Preview with Live Data';
    }
  }

  _handleKeyboardNavigation(e, suggestionsDivId) {
    const root = this.shadowRoot;
    const suggestionsDiv = root.getElementById(suggestionsDivId);
    
    if (!suggestionsDiv || !suggestionsDiv.classList.contains('show')) {
      return;
    }
    
    // Always prevent default for navigation keys when autocomplete is visible
    if (['ArrowDown', 'ArrowUp', 'Enter', 'Escape'].includes(e.key)) {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
    }
    
    const suggestions = suggestionsDiv.querySelectorAll('.entity-suggestion, .command-suggestion');
    
    switch(e.key) {
      case 'ArrowDown':
        this._selectedSuggestionIndex = Math.min(this._selectedSuggestionIndex + 1, suggestions.length - 1);
        this._updateSelection(suggestions);
        break;
        
      case 'ArrowUp':
        this._selectedSuggestionIndex = Math.max(this._selectedSuggestionIndex - 1, -1);
        this._updateSelection(suggestions);
        break;
        
      case 'Enter':
        if (this._selectedSuggestionIndex >= 0 && suggestions[this._selectedSuggestionIndex]) {
          // Get the selected suggestion
          const selectedSuggestion = suggestions[this._selectedSuggestionIndex];
          const value = selectedSuggestion.dataset.entity;
          const isCommand = selectedSuggestion.classList.contains('command-suggestion');
          
          // Find the active input field
          const activeInput = this._getActiveInput();
          if (activeInput && value) {
            if (isCommand) {
              this._handleSlashCommand(value, activeInput);
            } else {
              // Insert entity into text
              this._insertEntityIntoInput(activeInput, value);
            }
            // Close dropdown
            suggestionsDiv.classList.remove('show');
            this._selectedSuggestionIndex = -1;
          }
        }
        break;
        
      case 'Escape':
        suggestionsDiv.classList.remove('show');
        this._selectedSuggestionIndex = -1;
        break;
    }
  }
  
  _updateSelection(suggestions) {
    suggestions.forEach((suggestion, index) => {
      if (index === this._selectedSuggestionIndex) {
        suggestion.classList.add('highlighted');
        suggestion.scrollIntoView({ block: 'nearest' });
      } else {
        suggestion.classList.remove('highlighted');
      }
    });
  }
  
  _getActiveInput() {
    const root = this.shadowRoot;
    const chatInput = root.getElementById('chat-input');
    const promptInput = root.getElementById('prompt');
    
    // Return the input that has focus or is visible
    if (chatInput && (document.activeElement === chatInput || chatInput.matches(':focus'))) {
      return chatInput;
    }
    if (promptInput && (document.activeElement === promptInput || promptInput.matches(':focus'))) {
      return promptInput;
    }
    
    // Fallback: return the visible one
    return chatInput && chatInput.offsetParent !== null ? chatInput : promptInput;
  }
  
  _insertEntityIntoInput(input, entityId) {
    const currentText = input.value;
    const words = currentText.split(/\s+/);
    
    // Replace the last word (partial entity text) with the full entity ID
    words[words.length - 1] = entityId;
    input.value = words.join(' ') + ' ';
    
    // Trigger input event so autocomplete updates
    input.dispatchEvent(new Event('input', { bubbles: true }));
    
    // Focus back to input
    input.focus();
  }

  _handleEntityAutocomplete(text) {
    const root = this.shadowRoot;
    // Try both suggestion divs - config tab and chat tab
    let suggestionsDiv = root.getElementById('entity-suggestions');
    console.log('🔍 Config suggestions div:', !!suggestionsDiv, suggestionsDiv?.offsetParent);
    if (!suggestionsDiv || suggestionsDiv.offsetParent === null) {
      // Config tab div not visible, try chat tab
      suggestionsDiv = root.getElementById('chat-entity-suggestions');
      console.log('🔍 Chat suggestions div:', !!suggestionsDiv, suggestionsDiv?.offsetParent);
    }
    
    console.log('🔍 Autocomplete called with:', text, 'suggestionsDiv found:', !!suggestionsDiv, 'id:', suggestionsDiv?.id);

    // Handle edge cases where text might be undefined or null
    if (!text || typeof text !== 'string') {
      suggestionsDiv.classList.remove('show');
      return;
    }

    // More flexible pattern to catch entity typing
    const words = text.split(/\s+/);
    const lastWord = words[words.length - 1] || '';
    
    let suggestions = [];
    
    // Check if typing slash command
    if (lastWord.startsWith('/')) {
      console.log('🎯 Slash command detected:', lastWord);
      const commands = [
        { cmd: '/automation', desc: 'Generate automation' },
        { cmd: '/script', desc: 'Generate script' },
        { cmd: '/sensor', desc: 'Generate template sensor' },
        { cmd: '/dashboard', desc: 'Generate dashboard card' },
        { cmd: '/scene', desc: 'Generate scene' },
        { cmd: '/helper', desc: 'Generate input helper' },
        { cmd: '/clear', desc: 'Clear conversation' },
        { cmd: '/entities', desc: 'Show all entities' },
      ];
      
      const query = lastWord.toLowerCase();
      suggestions = commands
        .filter(cmd => cmd.cmd.startsWith(query))
        .map(cmd => ({
          entity_id: cmd.cmd,
          friendly_name: cmd.desc,
          domain: 'command',
          state: ''
        }));
      
      console.log('🎯 Found slash suggestions:', suggestions.length);
      this._showSuggestions(suggestions, suggestionsDiv, root, true);
      return;
    }
    // Check for partial domain typing (e.g., "ligh" → suggest light entities)
    else if (lastWord.length >= 3 && !lastWord.includes('.') && this._entities.length > 0) {
      console.log('🔤 Partial domain typing detected:', lastWord);
      const query = lastWord.toLowerCase();
      const domains = ['light', 'switch', 'sensor', 'binary_sensor', 'climate', 'cover', 
                      'fan', 'lock', 'media_player', 'camera', 'vacuum'];
      
      // Find matching domains
      const matchingDomains = domains.filter(domain => domain.startsWith(query));
      
      if (matchingDomains.length > 0) {
        // Show entities from matching domains
        suggestions = this._entities
          .filter(entity => matchingDomains.includes(entity.entity_id.split('.')[0]))
          .slice(0, 15)
          .sort((a, b) => {
            // Sort by domain match quality and then alphabetically
            const aDomain = a.entity_id.split('.')[0];
            const bDomain = b.entity_id.split('.')[0];
            const aExact = aDomain === query;
            const bExact = bDomain === query;
            
            if (aExact && !bExact) return -1;
            if (!aExact && bExact) return 1;
            
            const aStarts = aDomain.startsWith(query);
            const bStarts = bDomain.startsWith(query);
            
            if (aStarts && !bStarts) return -1;
            if (!aStarts && bStarts) return 1;
            
            return a.entity_id.localeCompare(b.entity_id);
          });
          
        this._showSuggestions(suggestions, suggestionsDiv, root, false);
        return;
      }
    }
    // Check if the last word looks like an entity being typed
    else if (lastWord.includes('.') && this._entities.length > 0) {
      const query = lastWord.toLowerCase();
      const queryParts = query.split('.');
      const domain = queryParts[0];
      const entityPart = queryParts[1] || '';

      // Filter entities by domain and partial entity name
      suggestions = this._entities
        .filter(entity => {
          const entityId = entity.entity_id.toLowerCase();
          const entityParts = entityId.split('.');
          
          // Domain must match and entity part should contain the query substring
          if (entityParts[0] !== domain) return false;
          if (entityPart === '') return true; // Show all entities for just "domain."
          return entityParts.length > 1 && entityParts[1].includes(entityPart);
        })
        .sort((a, b) => {
          // Sort by relevance: starts with query first, then contains query
          const aId = a.entity_id.toLowerCase();
          const bId = b.entity_id.toLowerCase();
          const aParts = aId.split('.');
          const bParts = bId.split('.');
          const aEntityPart = aParts.length > 1 ? aParts[1] : '';
          const bEntityPart = bParts.length > 1 ? bParts[1] : '';
          
          // Only check startsWith if entityPart is not empty
          if (entityPart) {
            const aStartsWith = aEntityPart.startsWith(entityPart);
            const bStartsWith = bEntityPart.startsWith(entityPart);
            
            if (aStartsWith && !bStartsWith) return -1;
            if (!aStartsWith && bStartsWith) return 1;
          }
          
          // Then alphabetical
          return aId.localeCompare(bId);
        })
        .slice(0, 15); // Show more suggestions

      this._showSuggestions(suggestions, suggestionsDiv, root, false, entityPart);
    } else {
      suggestionsDiv.classList.remove('show');
    }
  }

  _showSuggestions(suggestions, suggestionsDiv, root, isCommand, highlightTerm) {
    console.log('🎨 _showSuggestions called:', suggestions.length, 'items, suggestionsDiv:', !!suggestionsDiv);
    console.log('🎨 suggestionsDiv details:', suggestionsDiv?.id, suggestionsDiv?.className, suggestionsDiv?.tagName);
    console.log('🎨 suggestionsDiv parent:', suggestionsDiv?.parentElement);
    
    if (!suggestionsDiv) {
      console.error('❌ No suggestionsDiv found!');
      return;
    }
    
    if (suggestions.length > 0) {
      suggestionsDiv.innerHTML = suggestions.map(item => {
        let displayName = item.entity_id;
        
        // Highlight matching terms
        if (highlightTerm && highlightTerm.length > 0 && !isCommand) {
          const escapedTerm = highlightTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          displayName = item.entity_id.replace(
            new RegExp(`(${escapedTerm})`, 'gi'), 
            '<strong>$1</strong>'
          );
        }
        
        const className = isCommand ? 'command-suggestion' : 'entity-suggestion';
        const icon = isCommand ? '/' : (item.domain === 'light' ? '💡' : (item.domain === 'switch' ? '🔘' : '🏠'));
        
        return `<div class="${className}" data-entity="${item.entity_id}">
          <div class="entity-name">${icon} ${displayName}</div>
          <div class="entity-info">${item.friendly_name} ${item.state ? '(' + item.state + ')' : ''}</div>
        </div>`;
      }).join('');

      console.log('✅ Adding show class to suggestionsDiv');
      suggestionsDiv.classList.add('show');
      
      // Position the dropdown correctly using fixed positioning
      const activeInput = root.querySelector('#chat-input, #prompt');
      if (activeInput) {
        const rect = activeInput.getBoundingClientRect();
        const dropdownHeight = 300; // max-height from CSS
        const spaceBelow = window.innerHeight - rect.bottom;
        const spaceAbove = rect.top;
        
        // Position above input if not enough space below
        if (spaceBelow < dropdownHeight && spaceAbove > spaceBelow) {
          suggestionsDiv.style.top = (rect.top - Math.min(dropdownHeight, spaceAbove) - 4) + 'px';
        } else {
          suggestionsDiv.style.top = (rect.bottom + 4) + 'px';
        }
        
        suggestionsDiv.style.left = rect.left + 'px';
        suggestionsDiv.style.width = rect.width + 'px';
      }
      
      // Reset selection
      this._selectedSuggestionIndex = -1;

      // Re-attach click events
      suggestionsDiv.querySelectorAll('.entity-suggestion, .command-suggestion').forEach(suggestion => {
        suggestion.addEventListener('click', () => {
          const value = suggestion.dataset.entity;
          const isCommand = suggestion.classList.contains('command-suggestion');
          const activeInput = this._getActiveInput();
          
          if (activeInput && value) {
            if (isCommand) {
              this._handleSlashCommand(value, activeInput);
            } else {
              this._insertEntityIntoInput(activeInput, value);
            }
            suggestionsDiv.classList.remove('show');
            this._selectedSuggestionIndex = -1;
          }
        });
      });
    } else {
      suggestionsDiv.classList.remove('show');
    }
  }

  _handleSlashCommand(command, textarea) {
    const configTypeSelect = this.shadowRoot.getElementById('config-type');
    
    switch(command) {
      case '/automation':
        configTypeSelect.value = 'automation';
        textarea.value = '';
        textarea.placeholder = 'Describe your automation (e.g., Turn on lights when motion detected)';
        break;
      case '/script':
        configTypeSelect.value = 'script';
        textarea.value = '';
        textarea.placeholder = 'Describe your script (e.g., Movie night routine)';
        break;
      case '/sensor':
        configTypeSelect.value = 'sensor';
        textarea.value = '';
        textarea.placeholder = 'Describe your sensor (e.g., Average temperature)';
        break;
      case '/dashboard':
        configTypeSelect.value = 'dashboard';
        textarea.value = '';
        textarea.placeholder = 'Describe your dashboard (e.g., Energy monitoring panel)';
        break;
      case '/scene':
        configTypeSelect.value = 'scene';
        textarea.value = '';
        textarea.placeholder = 'Describe your scene (e.g., Evening mood lighting)';
        break;
      case '/helper':
        configTypeSelect.value = 'helper';
        textarea.value = '';
        textarea.placeholder = 'Describe your helper (e.g., House mode selector)';
        break;
      case '/clear':
        textarea.value = '';
        this._clearResults();
        break;
      case '/entities':
        textarea.value = '';
        this._showAllEntities();
        break;
      default:
        // Remove the slash command and continue typing
        textarea.value = '';
    }
  }

  _clearResults() {
    const root = this.shadowRoot;
    const configDiv = root.getElementById('generated-config');
    const explanationDiv = root.getElementById('explanation');
    const warningsDiv = root.getElementById('warnings');
    
    if (configDiv) configDiv.textContent = '';
    if (explanationDiv) explanationDiv.textContent = '';
    if (warningsDiv) warningsDiv.innerHTML = '';
    
    this._showMessage('Results cleared', 'info');
  }

  _showAllEntities() {
    const root = this.shadowRoot;
    const configDiv = root.getElementById('generated-config');
    
    if (this._entities.length === 0) {
      configDiv.textContent = '# No entities found';
      return;
    }
    
    // Group entities by domain
    const entitiesByDomain = {};
    this._entities.forEach(entity => {
      const domain = entity.entity_id.split('.')[0];
      if (!entitiesByDomain[domain]) {
        entitiesByDomain[domain] = [];
      }
      entitiesByDomain[domain].push(entity);
    });
    
    // Generate YAML-style output
    let output = '# All Available Entities\n\n';
    Object.keys(entitiesByDomain).sort().forEach(domain => {
      output += `# ${domain.toUpperCase()} (${entitiesByDomain[domain].length})\n`;
      entitiesByDomain[domain].forEach(entity => {
        output += `#   ${entity.entity_id} - ${entity.friendly_name} (${entity.state})\n`;
      });
      output += '\n';
    });
    
    configDiv.textContent = output;
    
    // Switch to generate tab to show results
    root.querySelector('[data-tab="generate"]').click();
  }

  _showMessage(text, type) {
    const root = this.shadowRoot;
    const container = root.getElementById('temp-messages') || root.querySelector('.container');
    
    const msg = document.createElement('div');
    msg.className = 'message ' + type;
    msg.textContent = text;
    msg.style.position = 'fixed';
    msg.style.top = '20px';
    msg.style.right = '20px';
    msg.style.zIndex = '9999';
    msg.style.maxWidth = '400px';
    
    container.appendChild(msg);
    
    setTimeout(() => msg.remove(), 5000);
  }

  _getSampleConfig(type, prompt, confirmedEntities = []) {
    // Use confirmed entities in sample configurations
    const firstEntity = confirmedEntities.length > 0 ? confirmedEntities[0].entity_id : 'entity.example';
    const allEntities = confirmedEntities.length > 0 ? 
      confirmedEntities.map(e => e.entity_id).join(', ') : 
      'entity.example';

    // Return sample configurations based on type
    const samples = {
      automation: `alias: Generated Automation
description: "${prompt}"
trigger:
  - platform: state
    entity_id: ${firstEntity}
    to: 'on'
condition:
  - condition: sun
    after: sunset
action:
  - service: homeassistant.turn_on
    target:
      entity_id: ${confirmedEntities.length > 0 ? confirmedEntities.filter(e => e.entity_id.startsWith('light.')).map(e => e.entity_id).join(', ') || firstEntity : 'light.example'}`,
      
      script: `alias: Generated Script
sequence:
  - service: light.turn_on
    target:
      entity_id: light.all_lights
  - delay:
      seconds: 30
  - service: light.turn_off
    target:
      entity_id: light.all_lights`,
      
      scene: `name: Generated Scene
entities:
  light.living_room:
    state: on
    brightness: 128
    color_temp: 300
  light.bedroom:
    state: off`,
    
      dashboard: `type: entities
title: Generated Dashboard
entities:
  - entity: sensor.temperature
  - entity: sensor.humidity
  - entity: switch.smart_plug`,
  
      template: `- sensor:
  - name: "Generated Sensor"
    state: "{{ states('sensor.temperature') | float * 1.8 + 32 }}"
    unit_of_measurement: "°F"`
    };
    
    return samples[type] || '# Generated configuration will appear here';
  }

  _detectEntitiesInPrompt(prompt) {
    if (!this._entities || this._entities.length === 0) {
      return [];
    }

    const detectedEntities = [];
    const promptLower = prompt.toLowerCase();
    const words = promptLower.split(/\s+/);

    // Common location keywords and device types
    const locationKeywords = ['kitchen', 'bedroom', 'living room', 'bathroom', 'garage', 'office', 'dining room', 'hallway', 'basement', 'attic', 'gym', 'porch', 'deck', 'patio', 'upstairs', 'downstairs'];
    const deviceKeywords = ['light', 'lights', 'lamp', 'switch', 'outlet', 'fan', 'thermostat', 'lock', 'door', 'window', 'sensor', 'camera', 'speaker', 'tv', 'television', 'dimmer'];

    // Find location and device mentions
    const mentionedLocations = locationKeywords.filter(location => 
      promptLower.includes(location)
    );

    const mentionedDevices = deviceKeywords.filter(device => 
      promptLower.includes(device)
    );

    // Search for entities that match location + device combinations
    this._entities.forEach(entity => {
      const entityId = entity.entity_id.toLowerCase();
      const friendlyName = entity.friendly_name.toLowerCase();
      
      let matchScore = 0;
      let matchReasons = [];

      // Check for location matches in entity ID or friendly name
      mentionedLocations.forEach(location => {
        if (entityId.includes(location) || friendlyName.includes(location)) {
          matchScore += 3;
          matchReasons.push(`location: "${location}"`);
        }
      });

      // Check for device type matches
      mentionedDevices.forEach(device => {
        const entityDomain = entityId.split('.')[0];
        
        // Direct domain matches
        if ((device === 'light' || device === 'lights') && entityDomain === 'light') {
          matchScore += 2;
          matchReasons.push(`device type: "${device}"`);
        } else if (device === 'switch' && entityDomain === 'switch') {
          matchScore += 2;
          matchReasons.push(`device type: "${device}"`);
        } else if (device === 'fan' && entityDomain === 'fan') {
          matchScore += 2;
          matchReasons.push(`device type: "${device}"`);
        } else if ((device === 'sensor') && (entityDomain === 'sensor' || entityDomain === 'binary_sensor')) {
          matchScore += 2;
          matchReasons.push(`device type: "${device}"`);
        }
        
        // Check friendly name for device mentions
        if (friendlyName.includes(device)) {
          matchScore += 1;
          matchReasons.push(`name contains: "${device}"`);
        }
      });

      // Check for direct name mentions (fuzzy matching)
      words.forEach(word => {
        if (word.length > 2) { // Skip very short words
          if (entityId.includes(word) || friendlyName.includes(word)) {
            matchScore += 1;
            matchReasons.push(`name match: "${word}"`);
          }
        }
      });

      // If we have a decent match score, include this entity
      if (matchScore >= 2) {
        detectedEntities.push({
          entity: entity,
          score: matchScore,
          reasons: matchReasons,
          confirmed: false
        });
      }
    });

    // Sort by match score (highest first) and limit results
    detectedEntities.sort((a, b) => b.score - a.score);
    return detectedEntities.slice(0, 8); // Limit to top 8 matches
  }

  _showEntityDetection(detectedEntities, prompt, configType) {
    const root = this.shadowRoot;
    
    // Store the context for later use
    this._currentPrompt = prompt;
    this._currentConfigType = configType;
    this._detectedEntities = detectedEntities;

    // Generate the entity list HTML
    const entitiesHtml = detectedEntities.map((detection, index) => {
      const entity = detection.entity;
      const reasonsText = detection.reasons.join(', ');
      
      return `
        <div class="detected-entity" data-index="${index}">
          <div class="entity-match-info">
            <div class="entity-match-name">${entity.entity_id}</div>
            <div class="entity-match-details">
              <strong>${entity.friendly_name}</strong> (${entity.state})<br>
              <em>Matched by: ${reasonsText}</em>
            </div>
          </div>
          <div class="entity-actions">
            <button class="entity-action-btn confirm" data-action="confirm" data-index="${index}">✓</button>
            <button class="entity-action-btn reject" data-action="reject" data-index="${index}">✗</button>
            <button class="entity-action-btn change" data-action="change" data-index="${index}">↻</button>
          </div>
        </div>
      `;
    }).join('');

    // Update the UI
    root.getElementById('detected-entities-list').innerHTML = entitiesHtml;
    root.getElementById('entity-detection').style.display = 'block';
    root.getElementById('generate-output').style.display = 'none';

    // Add event listeners for entity actions
    root.querySelectorAll('.entity-action-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const action = e.target.dataset.action;
        const index = parseInt(e.target.dataset.index);
        this._handleEntityAction(action, index);
      });
    });
  }

  _handleEntityAction(action, index) {
    const detection = this._detectedEntities[index];
    const entityDiv = this.shadowRoot.querySelector(`[data-index="${index}"]`);
    
    if (action === 'confirm') {
      detection.confirmed = true;
      entityDiv.classList.add('confirmed');
      entityDiv.classList.remove('rejected');
    } else if (action === 'reject') {
      detection.confirmed = false;
      entityDiv.classList.add('rejected');
      entityDiv.classList.remove('confirmed');
    } else if (action === 'change') {
      // TODO: Implement entity picker for replacement
      this._showMessage('Entity replacement coming soon!', 'info');
    }
  }

  // Chat Interface Methods
  _initializeChat() {
    // Add welcome message if no messages exist
    if (this._conversationMessages.length === 0) {
      this._addChatMessage('assistant', 'Hi! I\'m your AI Configuration Assistant. I can help you create automations, scenes, scripts, and dashboards for Home Assistant. Just describe what you want in natural language!');
      
      // Add example suggestions
      this._addChatMessage('system', 'Try: "Turn on the lights when I get home after sunset" or "Create a bedtime routine"');
    }
  }

  _addChatMessage(type, content, extras = {}, saveToConversation = true) {
    const root = this.shadowRoot;
    const messagesContainer = root.getElementById('chat-messages');
    if (!messagesContainer) return;

    const messageEl = document.createElement('div');
    messageEl.className = `chat-message ${type}`;
    
    const timestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    
    if (type === 'user' || type === 'assistant') {
      // Use markdown rendering for assistant messages, plain escaping for user messages
      const renderedContent = type === 'assistant' ? 
        this._renderMarkdownLinks(content) : 
        this._escapeHtml(content);
      
      let messageContent = `
        <div class="message-bubble">
          <div class="message-content">${renderedContent}</div>
          <div class="message-timestamp">${timestamp}</div>
        </div>
      `;
      
      // Add error logs if this is an error message with debug info
      if (type === 'assistant' && extras.error && extras.debugInfo) {
        messageContent += this._createErrorLogsCard(extras.error, extras.debugInfo);
      }
      
      messageEl.innerHTML = messageContent;
    } else if (type === 'system') {
      messageEl.innerHTML = `
        <div class="message-bubble">
          <div class="message-content">${this._renderMarkdownLinks(content)}</div>
        </div>
      `;
    } else if (type === 'entity-confirmation') {
      messageEl.innerHTML = this._createEntityConfirmationCard(extras.entities);
    } else if (type === 'config-preview') {
      messageEl.innerHTML = this._createConfigPreviewCard(extras.config, extras.configType);
    }
    
    messagesContainer.appendChild(messageEl);
    
    // Store message in conversation history (only save user and assistant messages to conversation)
    if (saveToConversation && (type === 'user' || type === 'assistant')) {
      const messageData = { 
        role: type,
        content: content,
        timestamp: Date.now()
      };
      
      this._conversationMessages.push(messageData);
      
      // Auto-save conversation after adding message
      setTimeout(() => this._saveCurrentConversation(), 1000);
      
      // Update conversation list with new preview
      setTimeout(() => this._renderConversationsList(), 1500);
    }
    
    // Attach error log listeners if they exist
    if (extras.debugInfo) {
      setTimeout(() => this._attachErrorLogListeners(), 100);
    }
    
    // Attach action button listeners for assistant messages
    if (type === 'assistant') {
      setTimeout(() => this._attachActionButtonListeners(), 100);
    }
    
    // Scroll to bottom
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
  }

  _showTypingIndicator() {
    const root = this.shadowRoot;
    const messagesContainer = root.getElementById('chat-messages');
    if (!messagesContainer) return;

    // Check if typing indicator already exists
    if (root.getElementById('typing-indicator')) {
      return; // Already showing, don't create another
    }

    const typingEl = document.createElement('div');
    typingEl.className = 'chat-message assistant';
    typingEl.id = 'typing-indicator';
    typingEl.innerHTML = `
      <div class="message-bubble">
        <div class="typing-indicator">
          <span></span>
          <span></span>
          <span></span>
        </div>
      </div>
    `;
    
    messagesContainer.appendChild(typingEl);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
  }

  _hideTypingIndicator() {
    const root = this.shadowRoot;
    const typingEl = root.getElementById('typing-indicator');
    if (typingEl) {
      typingEl.remove();
    }
  }

  async _sendChatMessage() {
    const root = this.shadowRoot;
    const chatInput = root.getElementById('chat-input');
    const chatSendBtn = root.getElementById('chat-send-btn');
    
    if (!chatInput || !chatInput.value.trim()) return;
    
    const message = chatInput.value.trim();
    
    // Add user message
    this._addChatMessage('user', message);
    
    // Clear input and disable send button
    chatInput.value = '';
    chatInput.style.height = 'auto';
    chatSendBtn.disabled = true;
    this._isProcessing = true;
    
    // Update status
    this._updateChatStatus('Processing...');
    
    // Show typing indicator
    this._showTypingIndicator();
    
    try {
      // Check for special commands
      if (message.toLowerCase() === 'reload') {
        await this._reloadAutomations();
        return;
      }
      
      // Check if this is a refinement request
      const isRefinement = this._isRefinementRequest(message);
      
      if (isRefinement && this._conversationContext.lastConfig) {
        // User wants to refine the last configuration
        await this._refineConfiguration(message);
      } else {
        // Detect relevant domains and get entities
        const relevantDomains = this._detectRelevantDomains(message);
        const relevantEntities = this._getRelevantEntities(message, relevantDomains);
        
        // Store context
        this._conversationContext = {
          originalPrompt: message,
          configType: this._detectConfigType(message),
          relevantEntities: relevantEntities
        };
        
        // Generate configuration directly without confirmation
        await this._generateFromChat(message, this._conversationContext.configType, relevantEntities);
      }
    } catch (error) {
      this._hideTypingIndicator();
      this._addChatMessage('assistant', `Sorry, I encountered an error: ${error.message}`);
    } finally {
      chatSendBtn.disabled = false;
      this._isProcessing = false;
      this._updateChatStatus('Ready');
    }
  }

  _isRefinementRequest(message) {
    const lower = message.toLowerCase();
    const refinementKeywords = [
      'also', 'add', 'change', 'modify', 'update', 'remove',
      'but', 'except', 'only', 'instead', 'different'
    ];
    
    // Check if we have a previous config and the message contains refinement keywords
    return this._conversationContext.lastConfig && 
           refinementKeywords.some(keyword => lower.includes(keyword));
  }

  async _refineConfiguration(refinementRequest) {
    try {
      const lastConfig = this._conversationContext.lastConfig;
      const configType = this._conversationContext.lastConfigType;
      
      // Combine original prompt with refinement
      const refinedPrompt = `${this._conversationContext.originalPrompt}. ${refinementRequest}`;
      
      // Generate refined configuration
      let result = await this._hass.callWS({
        type: 'call_service',
        domain: 'ai_config_assistant',
        service: 'generate_config',
        service_data: {
          prompt: refinedPrompt,
          type: configType,
          entities: this._conversationContext.confirmedEntities ? this._conversationContext.confirmedEntities.map(e => (e.entity || e).entity_id) : []
        },
        return_response: true
      });
      
      this._hideTypingIndicator();
      
      // Handle the new response structure where data is wrapped in "response"
      if (result && result.response) {
        result = result.response;
      }
      
      if (result && result.success && result.config) {
        // Store the new config as last config
        this._conversationContext.lastConfig = result.config;
        this._conversationContext.originalPrompt = refinedPrompt;
        
        // Show refined configuration
        this._addChatMessage('assistant', `I've updated the ${configType} based on your request:`);
        this._addChatMessage('config-preview', '', {
          config: result.config,
          configType: configType
        });
        
        setTimeout(() => this._attachConfigPreviewListeners(), 100);
      } else if (result && !result.success) {
        this._addChatMessage('assistant', `I couldn't refine the configuration: ${result.error || 'Unknown error'}`, {
          error: new Error(result.error || 'Unknown error'),
          debugInfo: {
            prompt: refinedPrompt,
            configType: configType,
            timestamp: new Date().toISOString(),
            serviceCall: {
              prompt: refinedPrompt,
              type: configType,
              entities: this._conversationContext.confirmedEntities ? this._conversationContext.confirmedEntities.map(e => (e.entity || e).entity_id) : [],
              return_response: true
            },
            serviceResponse: result
          }
        });
      } else {
        this._addChatMessage('assistant', `I couldn't refine the configuration. Please try again with more details.`);
      }
    } catch (error) {
      this._hideTypingIndicator();
      this._addChatMessage('assistant', `Error refining configuration: ${error.message}`, {
        error: error,
        debugInfo: {
          prompt: refinedPrompt || 'Unknown',
          configType: configType || 'Unknown',
          timestamp: new Date().toISOString()
        }
      });
    }
  }

  _detectConfigType(prompt) {
    const lower = prompt.toLowerCase();
    if (lower.includes('automation') || lower.includes('when') || lower.includes('trigger') || 
        lower.includes('alert') || lower.includes('notify') || lower.includes('if')) {
      return 'automation';
    } else if (lower.includes('scene')) {
      return 'scene';
    } else if (lower.includes('script') || lower.includes('sequence')) {
      return 'script';
    } else if (lower.includes('dashboard') || lower.includes('card') || lower.includes('lovelace')) {
      return 'lovelace';
    } else if (lower.includes('sensor') || lower.includes('template')) {
      return 'sensor';
    }
    return 'automation'; // Default
  }

  _detectRelevantDomains(prompt) {
    const lower = prompt.toLowerCase();
    const domains = new Set();
    
    // Map keywords to domains
    const keywordToDomains = {
      // Devices
      'light': ['light', 'switch'],
      'lights': ['light', 'switch'],
      'lamp': ['light', 'switch'],
      'bulb': ['light'],
      'switch': ['switch', 'light'],
      'door': ['binary_sensor', 'cover', 'lock'],
      'garage': ['cover', 'binary_sensor'],
      'window': ['binary_sensor', 'cover'],
      'lock': ['lock'],
      'motion': ['binary_sensor'],
      'presence': ['binary_sensor', 'device_tracker', 'person'],
      'temperature': ['sensor', 'climate'],
      'humidity': ['sensor'],
      'thermostat': ['climate'],
      'fan': ['fan', 'switch'],
      'tv': ['media_player', 'switch'],
      'television': ['media_player', 'switch'],
      'music': ['media_player'],
      'speaker': ['media_player'],
      'camera': ['camera'],
      'vacuum': ['vacuum'],
      'alarm': ['alarm_control_panel'],
      'sensor': ['sensor', 'binary_sensor'],
      
      // States and conditions
      'open': ['binary_sensor', 'cover'],
      'closed': ['binary_sensor', 'cover'],
      'on': ['light', 'switch', 'binary_sensor'],
      'off': ['light', 'switch', 'binary_sensor'],
      'home': ['person', 'device_tracker', 'zone'],
      'away': ['person', 'device_tracker', 'zone'],
      'detected': ['binary_sensor'],
      
      // Actions
      'notify': ['notify'],
      'alert': ['notify'],
      'message': ['notify'],
      'announce': ['notify', 'media_player'],
      'turn': ['light', 'switch', 'fan'],
      'dim': ['light'],
      'brighten': ['light'],
      'play': ['media_player'],
      'pause': ['media_player'],
      'stop': ['media_player'],
      
      // Time
      'sunrise': ['sun'],
      'sunset': ['sun'],
      'sun': ['sun']
    };
    
    // Check for keywords and add relevant domains
    for (const [keyword, domainList] of Object.entries(keywordToDomains)) {
      if (lower.includes(keyword)) {
        domainList.forEach(d => domains.add(d));
      }
    }
    
    // If no specific domains detected, include common ones
    if (domains.size === 0) {
      ['light', 'switch', 'binary_sensor', 'sensor', 'person', 'device_tracker'].forEach(d => domains.add(d));
    }
    
    return Array.from(domains);
  }

  _getEntitiesForDomains(domains) {
    if (!this._entities || this._entities.length === 0) return [];
    
    // Filter entities by domain
    return this._entities.filter(entity => {
      const domain = entity.entity_id.split('.')[0];
      return domains.includes(domain);
    });
  }

  _getRelevantEntities(prompt, domains) {
    if (!this._entities || this._entities.length === 0) return [];
    
    const lowerPrompt = prompt.toLowerCase();
    
    // Extract potential location/room keywords from the prompt
    const locationKeywords = this._extractLocationKeywords(lowerPrompt);
    console.log('Entity filtering:', { prompt: lowerPrompt, locationKeywords, domains });
    
    // Start with domain-filtered entities
    let relevantEntities = this._entities.filter(entity => {
      const domain = entity.entity_id.split('.')[0];
      return domains.includes(domain);
    });
    
    console.log(`Initial domain filtering: ${relevantEntities.length} entities from domains: ${domains.join(', ')}`);
    
    // If we have location keywords, prioritize entities that match them
    if (locationKeywords.length > 0) {
      const locationFiltered = relevantEntities.filter(entity => {
        const entityId = entity.entity_id.toLowerCase();
        const friendlyName = (entity.friendly_name || '').toLowerCase();
        
        return locationKeywords.some(keyword => 
          entityId.includes(keyword) || friendlyName.includes(keyword)
        );
      });
      
      // If we found location-specific entities, use them; otherwise fall back to domain filtering
      if (locationFiltered.length > 0) {
        console.log(`Location filtering found ${locationFiltered.length} relevant entities`);
        relevantEntities = locationFiltered;
      } else {
        console.log('No location-specific entities found, using domain filtering');
      }
    }
    
    // Limit entities to prevent service overload (max 100 entities)
    if (relevantEntities.length > 100) {
      console.warn(`Too many entities (${relevantEntities.length}), limiting to 100 most relevant`);
      relevantEntities = relevantEntities.slice(0, 100);
    }
    
    return relevantEntities;
  }

  _extractLocationKeywords(prompt) {
    // Common room/location keywords that might appear in prompts
    const commonLocations = [
      'kitchen', 'living room', 'bedroom', 'bathroom', 'garage', 'basement', 'office',
      'dining room', 'family room', 'guest room', 'master bedroom', 'kids room',
      'laundry room', 'pantry', 'closet', 'hallway', 'stairs', 'entryway', 'foyer',
      'porch', 'deck', 'patio', 'yard', 'garden', 'driveway', 'outdoors', 'outside',
      'upstairs', 'downstairs', 'main floor', 'teen center', 'playroom', 'gym',
      'apartment', 'studio', 'loft', 'attic'
    ];
    
    const foundKeywords = [];
    
    // Check for each location keyword in the prompt
    for (const location of commonLocations) {
      if (prompt.includes(location)) {
        // Also add variations (e.g., "living_room", "livingroom")
        foundKeywords.push(location);
        foundKeywords.push(location.replace(/\s+/g, '_'));
        foundKeywords.push(location.replace(/\s+/g, ''));
      }
    }
    
    return foundKeywords;
  }

  _createEntityConfirmationCard(entities) {
    const entitiesHtml = entities.map((entity, index) => {
      const entityObj = entity.entity || entity;
      const isConfirmed = entity.confirmed !== false;
      return `
        <div class="entity-confirm-item ${isConfirmed ? 'confirmed' : ''}" data-index="${index}">
          <span>${entityObj.entity_id} - ${entityObj.friendly_name || entityObj.entity_id}</span>
          <button class="entity-action-btn" data-action="${isConfirmed ? 'remove' : 'add'}" data-index="${index}">
            ${isConfirmed ? '✓' : '+'}
          </button>
        </div>
      `;
    }).join('');
    
    return `
      <div class="entity-confirm-card">
        <div class="entity-confirm-header">
          <span>🔍</span>
          <span>Detected Entities</span>
        </div>
        <div class="entity-confirm-list">
          ${entitiesHtml}
        </div>
        <div class="entity-confirm-actions">
          <button class="confirm-entities-chat-btn">Confirm Selection</button>
          <button class="skip-entities-chat-btn">Skip</button>
        </div>
      </div>
    `;
  }

  _createErrorLogsCard(error, debugInfo) {
    const logId = `error-logs-${Date.now()}-${Math.random().toString(36).substring(7)}`;
    const copyBtnId = `copy-btn-${logId}`;
    
    const errorLogsText = `Service Call Details:
${JSON.stringify(debugInfo.serviceCall || {}, null, 2)}

Service Response:
${debugInfo.fullServiceResponse || 'No response captured'}

Error Details:
${debugInfo.errorMessage || error.message || 'Unknown error'}

Error Stack:
${debugInfo.errorStack || error.stack || 'No stack trace available'}

Request Context:
- Timestamp: ${debugInfo.timestamp || 'Unknown'}
- Home Assistant Version: ${debugInfo.homeAssistantVersion || this._haVersion || 'Unknown'}
- Required Version: ${debugInfo.requiredVersion || '2024.8.0 or newer'}
- Prompt: "${debugInfo.prompt || 'Unknown'}"
- Config Type: ${debugInfo.configType || 'Unknown'}
- Relevant Domains: ${debugInfo.domains ? debugInfo.domains.join(', ') : 'Unknown'}
- Entity Filtering: ${debugInfo.filteredFromTotal || `${debugInfo.relevantEntityCount || 0} entities`}
- Total Entities Available: ${debugInfo.totalEntityCount || 'Unknown'}

Entity IDs Sent (first 10):
${debugInfo.entityIds ? debugInfo.entityIds.slice(0, 10).join('\n') : 'None'}
${debugInfo.entityIds && debugInfo.entityIds.length > 10 ? `\n... and ${debugInfo.entityIds.length - 10} more` : ''}

Please share this information when reporting issues.`;
    
    return `
      <div class="error-logs-container">
        <button class="error-logs-toggle" data-target="${logId}">
          <span>📋 Error logs</span>
          <span class="chevron">▶</span>
        </button>
        <div id="${logId}" class="error-logs-content hidden" data-log-id="${logId}">
          <button id="${copyBtnId}" class="error-logs-copy-btn" data-log-id="${logId}">Copy</button>
          <div class="error-logs-text">${errorLogsText}</div>
        </div>
      </div>
    `;
  }

  _createConfigPreviewCard(config, configType) {
    return `
      <div class="config-preview-message">
        <div class="config-preview-header">
          <span class="config-preview-type">${configType}</span>
          <span style="color: var(--success-color);">✓ Valid</span>
        </div>
        <div class="config-preview-code">
          <pre>${this._escapeHtml(config)}</pre>
        </div>
        <div class="config-preview-actions">
          <button class="copy-config-btn">📋 Copy</button>
          <button class="edit-config-btn">✏️ Edit</button>
          <button class="deploy-config-btn primary" data-config="${this._escapeHtml(config)}" data-type="${configType}">🚀 Deploy</button>
        </div>
      </div>
    `;
  }

  async _generateFromChat(prompt, configType, entities) {
    let serviceCall = {};
    
    try {
      // Don't show typing indicator here - it's already shown in _handleChatSend
      
      // Detect relevant domains for debug info
      const relevantDomains = this._detectRelevantDomains(prompt);
      
      // Use the existing generation logic but capture the result
      const debugInfo = {
        prompt: prompt,
        configType: configType,
        timestamp: new Date().toISOString(),
        totalEntityCount: this._entities.length,
        relevantEntityCount: entities.length,
        domains: relevantDomains,
        filteredFromTotal: `${entities.length} of ${this._entities.length} entities`,
        entityIds: entities.map(e => (e.entity || e).entity_id)
      };

      serviceCall = {
        prompt: prompt,
        type: configType,
        entities: entities.map(e => (e.entity || e).entity_id)
      };

      console.log('Making service call with:', serviceCall);
      // In Home Assistant 2024.8+, we need to use callWS for services that return data
      let result = await this._hass.callWS({
        type: 'call_service',
        domain: 'ai_config_assistant',
        service: 'generate_config',
        service_data: serviceCall,
        return_response: true
      });
      console.log('Service call result:', result);
      
      // Hide typing indicator
      this._hideTypingIndicator();
      
      // Handle the new response structure where data is wrapped in "response"
      if (result && result.response) {
        // Extract the actual response data
        const responseData = result.response;
        console.log('Extracted response data:', responseData);
        
        // Process as if it was the direct result
        result = responseData;
      }
      
      // Check if we got just a context response (happens in some HA versions)
      if (result && result.context && !result.success && !result.error && !result.response) {
        const haVersion = this._haVersion || 'Unknown';
        console.error('Service returned only context, likely a response handling issue:', result);
        console.error('Home Assistant version:', haVersion);
        
        // Check version compatibility
        const versionMessage = haVersion !== 'Unknown' ? 
          `Your Home Assistant version is ${haVersion}. This integration requires Home Assistant 2024.8.0 or newer.` :
          `Unable to detect Home Assistant version. This integration requires Home Assistant 2024.8.0 or newer.`;
        
        this._addChatMessage('assistant', `There was an issue with the service response. ${versionMessage}

**Debugging steps:**
1. Check Home Assistant logs for messages starting with "===" 
2. Test the service in Developer Tools → Services:
   - Service: ai_config_assistant.test_response
   - Data: \`{"test": "hello"}\`
   - Enable "Response" toggle
3. If the test service works, the issue is in config generation
4. If the test service fails, there's a response handling issue`, {
          error: new Error('Service returned context only - response handling issue'),
          debugInfo: {
            ...debugInfo,
            serviceCall: serviceCall,
            serviceResponse: result,
            fullServiceResponse: JSON.stringify(result, null, 2),
            homeAssistantVersion: haVersion,
            requiredVersion: '2024.8.0 or newer',
            errorMessage: 'Service returned only context object without data. This typically indicates a response handling issue.',
            possibleCauses: [
              `Home Assistant version compatibility (Current: ${haVersion}, Required: 2024.8.0+)`,
              'Service registration issue',
              'return_response parameter not properly handled',
              'Backend service not returning data properly'
            ]
          }
        });
        return;
      }
      
      if (result && result.success && result.config) {
        // Update debug tab
        this._updateDebugTab(debugInfo, result.config);
        
        // Store configuration in context for refinement
        this._conversationContext.lastConfig = result.config;
        this._conversationContext.lastConfigType = configType;
        this._conversationContext.confirmedEntities = entities;
        
        // Add success message
        this._addChatMessage('assistant', `Great! I've created ${configType === 'lovelace' ? 'a dashboard card' : `a ${configType}`} for you:`);
        
        // Add configuration preview
        this._addChatMessage('config-preview', '', {
          config: result.config,
          configType: configType
        });
        
        // Set up event listeners for the new buttons
        setTimeout(() => this._attachConfigPreviewListeners(), 100);
        
        // Add refinement hint
        this._addChatMessage('system', 'You can refine this configuration by saying things like "also turn on the TV" or "but only on weekdays"');
      } else if (result && !result.success) {
        const errorMessage = result.error || result.message || 'Unknown error';
        console.error('Service call failed:', result);
        this._addChatMessage('assistant', `I couldn't generate the configuration: ${errorMessage}`, {
          error: new Error(errorMessage),
          debugInfo: {
            ...debugInfo,
            serviceCall: serviceCall,
            serviceResponse: result,
            fullServiceResponse: JSON.stringify(result, null, 2)
          }
        });
      } else {
        // Fallback for when service doesn't return data (older HA versions)
        this._addChatMessage('assistant', `Configuration request sent. For older Home Assistant versions, check the logs for the generated configuration.`);
        
        // Use sample config as fallback
        const sampleConfig = this._getSampleConfig(configType, prompt, entities);
        this._conversationContext.lastConfig = sampleConfig;
        this._conversationContext.lastConfigType = configType;
        
        this._addChatMessage('config-preview', '', {
          config: sampleConfig,
          configType: configType
        });
        
        setTimeout(() => this._attachConfigPreviewListeners(), 100);
      }
    } catch (error) {
      this._hideTypingIndicator();
      
      console.error('Service call threw exception:', error);
      console.error('Service call details:', serviceCall);
      
      const debugInfo = {
        prompt: prompt,
        configType: configType,
        timestamp: new Date().toISOString(),
        totalEntityCount: this._entities ? this._entities.length : 0,
        relevantEntityCount: entities ? entities.length : 0,
        domains: this._detectRelevantDomains(prompt),
        filteredFromTotal: entities && this._entities ? `${entities.length} of ${this._entities.length} entities` : 'N/A',
        serviceCall: serviceCall,
        errorMessage: error.message,
        errorStack: error.stack,
        errorType: error.constructor.name,
        fullServiceResponse: `Exception thrown: ${error.message}`
      };
      
      this._addChatMessage('assistant', `Error generating configuration: ${error.message}`, {
        error: error,
        debugInfo: debugInfo
      });
    }
  }

  _attachEntityConfirmListeners() {
    const root = this.shadowRoot;
    
    // Entity confirmation buttons
    root.querySelectorAll('.confirm-entities-chat-btn').forEach(btn => {
      if (!btn.hasListener) {
        btn.hasListener = true;
        btn.addEventListener('click', () => {
          const confirmedEntities = this._conversationContext.detectedEntities.filter(e => e.confirmed !== false);
          this._generateFromChat(
            this._conversationContext.originalPrompt,
            this._conversationContext.configType,
            confirmedEntities
          );
        });
      }
    });
    
    root.querySelectorAll('.skip-entities-chat-btn').forEach(btn => {
      if (!btn.hasListener) {
        btn.hasListener = true;
        btn.addEventListener('click', () => {
          this._generateFromChat(
            this._conversationContext.originalPrompt,
            this._conversationContext.configType,
            []
          );
        });
      }
    });
    
    // Entity action buttons
    root.querySelectorAll('.entity-action-btn').forEach(btn => {
      if (!btn.hasListener) {
        btn.hasListener = true;
        btn.addEventListener('click', () => {
          const index = parseInt(btn.dataset.index);
          const action = btn.dataset.action;
          
          if (this._conversationContext.detectedEntities[index]) {
            if (action === 'add') {
              this._conversationContext.detectedEntities[index].confirmed = true;
              btn.textContent = '✓';
              btn.dataset.action = 'remove';
              btn.closest('.entity-confirm-item').classList.add('confirmed');
            } else {
              this._conversationContext.detectedEntities[index].confirmed = false;
              btn.textContent = '+';
              btn.dataset.action = 'add';
              btn.closest('.entity-confirm-item').classList.remove('confirmed');
            }
          }
        });
      }
    });
  }

  _attachErrorLogListeners() {
    const root = this.shadowRoot;
    
    // Error log toggle buttons
    root.querySelectorAll('.error-logs-toggle').forEach(btn => {
      if (!btn.hasListener) {
        btn.hasListener = true;
        btn.addEventListener('click', () => {
          const targetId = btn.dataset.target;
          const content = root.getElementById(targetId);
          const chevron = btn.querySelector('.chevron');
          
          if (content && chevron) {
            const isHidden = content.classList.contains('hidden');
            
            if (isHidden) {
              content.classList.remove('hidden');
              chevron.classList.add('expanded');
              chevron.textContent = '▼';
            } else {
              content.classList.add('hidden');
              chevron.classList.remove('expanded');
              chevron.textContent = '▶';
            }
          }
        });
      }
    });

    // Error log copy buttons
    root.querySelectorAll('.error-logs-copy-btn').forEach(btn => {
      if (!btn.hasListener) {
        btn.hasListener = true;
        btn.addEventListener('click', async (e) => {
          e.stopPropagation();
          const logId = btn.dataset.logId;
          const errorLogsContent = root.getElementById(logId);
          const logTextElement = errorLogsContent?.querySelector('.error-logs-text');
          const logText = logTextElement?.textContent || '';
          
          try {
            await navigator.clipboard.writeText(logText);
            const originalText = btn.textContent;
            btn.textContent = 'Copied!';
            btn.classList.add('copied');
            
            setTimeout(() => {
              btn.textContent = originalText;
              btn.classList.remove('copied');
            }, 2000);
          } catch (err) {
            console.error('Failed to copy error logs:', err);
            btn.textContent = 'Failed';
            setTimeout(() => {
              btn.textContent = 'Copy';
            }, 2000);
          }
        });
      }
    });
  }

  _attachActionButtonListeners() {
    const root = this.shadowRoot;
    
    // Action buttons for executing scripts
    root.querySelectorAll('.execute-script-btn').forEach(btn => {
      if (!btn.hasListener) {
        btn.hasListener = true;
        btn.addEventListener('click', async () => {
          const scriptName = btn.getAttribute('data-script');
          if (scriptName && scriptName.startsWith('script:')) {
            try {
              // Extract the script entity ID (remove 'script:' prefix)
              const entityId = scriptName.replace('script:', '');
              
              // Add feedback
              this._addChatMessage('system', `🔄 Executing ${btn.getAttribute('data-name') || scriptName}...`);
              
              // Call the script service
              await this._hass.callService('script', 'turn_on', {
                entity_id: `script.${entityId}`
              });
              
              // Success feedback
              this._addChatMessage('system', `✅ Successfully executed ${btn.getAttribute('data-name') || scriptName}`);
            } catch (error) {
              console.error('Failed to execute script:', error);
              this._addChatMessage('system', `❌ Failed to execute script: ${error.message}`);
            }
          }
        });
      }
    });
    
    // Save script buttons
    root.querySelectorAll('.save-script-btn').forEach(btn => {
      if (!btn.hasListener) {
        btn.hasListener = true;
        btn.addEventListener('click', () => {
          const scriptData = btn.getAttribute('data-script');
          if (scriptData) {
            try {
              // Parse the script data from the button
              const scriptYaml = scriptData;
              
              // Switch to the validate tab with the script configuration
              const validateTextarea = root.getElementById('config-yaml');
              if (validateTextarea) {
                validateTextarea.value = scriptYaml;
                // Switch to validate tab
                const validateTab = root.querySelector('[data-tab="validate"]');
                if (validateTab) {
                  validateTab.click();
                }
                this._addChatMessage('system', '📝 Script configuration loaded in the Validate tab for review and deployment.');
              }
            } catch (error) {
              console.error('Failed to save script:', error);
              this._addChatMessage('system', `❌ Failed to load script configuration: ${error.message}`);
            }
          }
        });
      }
    });
  }

  _attachConfigPreviewListeners() {
    const root = this.shadowRoot;
    
    // Copy button
    root.querySelectorAll('.copy-config-btn').forEach(btn => {
      if (!btn.hasListener) {
        btn.hasListener = true;
        btn.addEventListener('click', async () => {
          const config = btn.closest('.config-preview-message').querySelector('pre').textContent;
          await navigator.clipboard.writeText(config);
          this._addChatMessage('system', 'Configuration copied to clipboard!');
        });
      }
    });
    
    // Edit button
    root.querySelectorAll('.edit-config-btn').forEach(btn => {
      if (!btn.hasListener) {
        btn.hasListener = true;
        btn.addEventListener('click', () => {
          const config = btn.closest('.config-preview-message').querySelector('pre').textContent;
          // Switch to validate tab with the config
          const validateTextarea = root.getElementById('config-yaml');
          if (validateTextarea) {
            validateTextarea.value = config;
            root.querySelector('[data-tab="validate"]').click();
          }
        });
      }
    });
    
    // Deploy button
    root.querySelectorAll('.deploy-config-btn').forEach(btn => {
      if (!btn.hasListener) {
        btn.hasListener = true;
        btn.addEventListener('click', async () => {
          const config = btn.closest('.config-preview-message').querySelector('pre').textContent;
          const configType = btn.dataset.type;
          await this._deployConfiguration(config, configType);
        });
      }
    });
  }

  _handleQuickAction(action) {
    const prompts = {
      automation: 'Create an automation that ',
      scene: 'Create a scene called ',
      script: 'Create a script that ',
      dashboard: 'Create a dashboard card showing '
    };
    
    const root = this.shadowRoot;
    const chatInput = root.getElementById('chat-input');
    
    if (chatInput && prompts[action]) {
      chatInput.value = prompts[action];
      chatInput.focus();
      
      // Auto-resize
      chatInput.style.height = 'auto';
      chatInput.style.height = chatInput.scrollHeight + 'px';
    }
  }

  _updateChatStatus(status) {
    const root = this.shadowRoot;
    const statusEl = root.querySelector('.chat-status span:last-child');
    if (statusEl) {
      statusEl.textContent = status;
    }
  }

  _escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  _isValidActionButtonHTML(html) {
    // Security validation for action button HTML
    // Only allow specific, safe HTML elements and attributes for action buttons
    
    // Check if it's a proper action-buttons div
    if (!html.match(/^<div class="action-buttons"[^>]*>/)) {
      return false;
    }
    
    // Define allowed elements and attributes
    const allowedElements = ['div', 'button'];
    const allowedAttributes = ['class', 'data-script', 'data-name', 'style', 'margin-right'];
    
    // Create a temporary DOM element to parse and validate the HTML
    const tempDiv = document.createElement('div');
    try {
      tempDiv.innerHTML = html;
      
      // Recursively validate all elements
      const validateElement = (element) => {
        // Check if element type is allowed
        if (!allowedElements.includes(element.tagName.toLowerCase())) {
          return false;
        }
        
        // Check if all attributes are allowed
        for (const attr of element.attributes) {
          if (!allowedAttributes.includes(attr.name.toLowerCase())) {
            return false;
          }
        }
        
        // Validate data-script attribute contains only safe script references
        if (element.hasAttribute('data-script')) {
          const script = element.getAttribute('data-script');
          // Only allow script references that look like valid Home Assistant scripts
          if (!script.match(/^script:[a-zA-Z0-9_\.]+$/)) {
            return false;
          }
        }
        
        // Validate children recursively
        for (const child of element.children) {
          if (!validateElement(child)) {
            return false;
          }
        }
        
        return true;
      };
      
      // Validate the main div
      const mainDiv = tempDiv.firstElementChild;
      return validateElement(mainDiv);
      
    } catch (e) {
      // If parsing fails, reject the HTML
      return false;
    }
  }

  _renderMarkdownLinks(text) {
    // First, extract and preserve safe action button HTML before escaping
    const actionButtonPattern = /<div class="action-buttons"[^>]*>.*?<\/div>/gs;
    const actionButtons = [];
    let textWithPlaceholders = text;
    
    // Extract action buttons and replace with placeholders
    let match;
    let placeholderIndex = 0;
    while ((match = actionButtonPattern.exec(text)) !== null) {
      if (this._isValidActionButtonHTML(match[0])) {
        const placeholder = `__ACTION_BUTTON_${placeholderIndex}__`;
        actionButtons[placeholderIndex] = match[0];
        textWithPlaceholders = textWithPlaceholders.replace(match[0], placeholder);
        placeholderIndex++;
      }
    }
    
    // Escape HTML for everything else
    let escaped = this._escapeHtml(textWithPlaceholders);
    
    // Restore safe action buttons (unescaped)
    actionButtons.forEach((buttonHTML, index) => {
      const placeholder = `__ACTION_BUTTON_${index}__`;
      escaped = escaped.replace(placeholder, buttonHTML);
    });
    
    // Convert markdown links [text](url) to HTML links
    escaped = escaped.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (match, linkText, url) => {
      // Handle internal Home Assistant URLs
      if (url.startsWith('/')) {
        return `<a href="${url}" style="color: var(--primary-color); text-decoration: underline; cursor: pointer;">${linkText}</a>`;
      }
      // Handle external URLs
      return `<a href="${url}" target="_blank" rel="noopener" style="color: var(--primary-color); text-decoration: underline; cursor: pointer;">${linkText}</a>`;
    });
    
    // Convert **bold** to <strong>
    escaped = escaped.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    
    return escaped;
  }

  async _deployConfiguration(config, configType) {
    try {
      this._addChatMessage('system', `Deploying ${configType}...`);
      
      // Call the deploy service with conversation_id for tracking
      let result = await this._hass.callWS({
        type: 'call_service',
        domain: 'ai_config_assistant',
        service: 'deploy_config',
        service_data: {
          config: config,
          type: configType,
          conversation_id: this._currentConversationId  // Add this for automatic tracking
        },
        return_response: true
      });
      
      // Handle the new response structure where data is wrapped in "response"
      if (result && result.response) {
        result = result.response;
      }
      
      console.log('Deployment result:', result);
      console.log('Current conversation ID:', this._currentConversationId);
      
      if (result && result.success) {
        // Track the deployment in the conversation
        if (this._currentConversationId && result.entity_id) {
          console.log('Calling _trackDeploymentInConversation with:', result.entity_id, configType);
          await this._trackDeploymentInConversation(result.entity_id, configType, config);
        }
        
        // Create success message with link based on type
        let successMessage = `✅ ${configType} deployed successfully!`;
        
        if (configType === 'automation' && result.id) {
          // Create a direct link to the automation
          const automationUrl = `/config/automation/edit/${result.id}`;
          successMessage += `\n\n[View Automation →](${automationUrl})`;
          
          // Also create a clickable card with the link
          this._addChatMessage('system', successMessage);
          this._addChatMessage('assistant', `Your automation has been created and is now active!\n\n📝 **Automation ID:** ${result.id}\n\n🔗 **[Edit Automation in UI](${automationUrl})** - Click to view or modify your new automation`);
        } else if ((configType === 'dashboard' || configType === 'lovelace')) {
          // Create a direct link to the dashboard view
          const dashboardPath = result.path || 'default';
          const dashboardUrl = `/lovelace/${dashboardPath}`;
          successMessage += `\n\n[View Dashboard →](${dashboardUrl})`;
          
          // Also create a clickable card with the link
          this._addChatMessage('system', successMessage);
          
          let instructions = `Your dashboard has been created!\n\n📊 **View Path:** ${dashboardPath}\n\n`;
          instructions += `🔗 **[Open Dashboard](${dashboardUrl})** - Click to view your new dashboard\n\n`;
          instructions += `📝 **Important Steps:**\n`;
          instructions += `1. **Refresh your browser** (F5 or Cmd+R) to see the new view\n`;
          instructions += `2. Look for the new tab in your dashboard navigation\n`;
          instructions += `3. If you don't see it, manually navigate to: ${dashboardUrl}\n\n`;
          instructions += `💡 **Note:** The dashboard has been added with ${result.view_count || 1} view(s)`;
          
          this._addChatMessage('assistant', instructions);
        } else if (configType === 'script' && result.id) {
          // Create a direct link to the script
          const scriptUrl = `/config/script/edit/${result.id}`;
          successMessage += `\n\n[View Script →](${scriptUrl})`;
          
          this._addChatMessage('system', successMessage);
          this._addChatMessage('assistant', `Your script has been created!\n\n📜 **Script ID:** ${result.id}\n\n🔗 **[Edit Script in UI](${scriptUrl})** - Click to view or modify your new script`);
        } else if (configType === 'scene' && result.id) {
          // Create a direct link to the scene
          const sceneUrl = `/config/scene/edit/${result.id}`;
          successMessage += `\n\n[View Scene →](${sceneUrl})`;
          
          this._addChatMessage('system', successMessage);
          this._addChatMessage('assistant', `Your scene has been created!\n\n🎬 **Scene ID:** ${result.id}\n\n🔗 **[Edit Scene in UI](${sceneUrl})** - Click to view or modify your new scene`);
        } else {
          this._addChatMessage('system', successMessage);
        }
      } else if (result && !result.success) {
        this._addChatMessage('system', `❌ Failed to deploy: ${result.error || 'Unknown error'}`);
      } else {
        // Fallback - try to use the appropriate service based on type
        await this._deployWithFallback(config, configType);
      }
    } catch (error) {
      this._addChatMessage('system', `❌ Error deploying configuration: ${error.message}`);
    }
  }

  async _reloadAutomations() {
    try {
      this._hideTypingIndicator();
      this._addChatMessage('system', '🔄 Reloading automations...');
      
      await this._hass.callService('automation', 'reload');
      
      this._addChatMessage('system', '✅ Automations reloaded successfully!');
    } catch (error) {
      this._addChatMessage('system', `❌ Failed to reload automations: ${error.message}`);
    }
  }

  async _deployWithFallback(config, configType) {
    try {
      // Parse the YAML to get the automation/script/scene data
      // For now, we'll just show instructions
      const instructions = {
        automation: 'To add this automation:\n1. Go to Settings → Automations & Scenes\n2. Click "+ Create Automation"\n3. Click the three dots menu → "Edit in YAML"\n4. Paste the configuration\n5. Click Save',
        script: 'To add this script:\n1. Go to Settings → Automations & Scenes → Scripts\n2. Click "+ Add Script"\n3. Click the three dots menu → "Edit in YAML"\n4. Paste the configuration\n5. Click Save',
        scene: 'To add this scene:\n1. Go to Settings → Automations & Scenes → Scenes\n2. Click "+ Add Scene"\n3. Click the three dots menu → "Edit in YAML"\n4. Paste the configuration\n5. Click Save',
        lovelace: 'To add this card:\n1. Edit your dashboard\n2. Click "+ Add Card"\n3. Search for "Manual"\n4. Paste the configuration\n5. Click Save',
        sensor: 'To add this sensor:\n1. Add to your configuration.yaml under "template:"\n2. Restart Home Assistant'
      };
      
      this._addChatMessage('assistant', instructions[configType] || 'Configuration copied to clipboard. Please add it manually.');
      
      // Copy to clipboard for convenience
      await navigator.clipboard.writeText(config);
      this._addChatMessage('system', '📋 Configuration copied to clipboard');
    } catch (error) {
      this._addChatMessage('system', `Error: ${error.message}`);
    }
  }

  async _reloadIntegration() {
    const root = this.shadowRoot;
    const reloadBtn = root.getElementById('reload-btn');
    
    if (!this._hass) {
      this._showMessage('Home Assistant connection not available', 'error');
      return;
    }
    
    reloadBtn.disabled = true;
    reloadBtn.innerHTML = '🔄 Reloading...';
    
    try {
      await this._hass.callService('ai_config_assistant', 'reload');
      this._showMessage('Integration reloaded successfully! 🎉', 'success');
      
      // Refresh entities after reload
      setTimeout(() => {
        this._loadEntities();
      }, 1000);
      
    } catch (error) {
      this._showMessage('Failed to reload integration: ' + error.message, 'error');
    } finally {
      reloadBtn.disabled = false;
      reloadBtn.innerHTML = '🔄 Reload';
    }
  }

  // ========================================
  // Conversation Management Methods
  // ========================================

  async _initializeConversationManager() {
    try {
      // Load conversations from server
      await this._loadConversations();
      
      // Create a new conversation if none exist
      if (!this._conversations || this._conversations.length === 0) {
        this._startNewConversation();
      } else {
        // Load the most recent conversation
        this._loadConversation(this._conversations[0].id);
      }
    } catch (error) {
      console.error('Failed to initialize conversation manager:', error);
      // Create a new conversation as fallback
      this._startNewConversation();
    }
  }

  async _loadConversations() {
    try {
      const response = await this._hass.callWS({
        type: 'ai_config_assistant/load_conversations'
      });
      
      this._conversations = response.conversations || [];
      this._renderConversationsList();
    } catch (error) {
      console.error('Failed to load conversations:', error);
      this._conversations = [];
    }
  }

  _renderConversationsList() {
    const root = this.shadowRoot;
    const conversationsList = root.getElementById('conversations-list');
    if (!conversationsList) return;

    if (!this._conversations || this._conversations.length === 0) {
      conversationsList.innerHTML = `
        <div style="padding: 20px; text-align: center; color: var(--secondary-text-color); font-size: 14px;">
          No conversations yet.<br>
          Start a new conversation to get started!
        </div>
      `;
      return;
    }

    conversationsList.innerHTML = this._conversations.map(conv => {
      const deployments = conv.deployments || [];
      const activeDeployments = deployments.filter(d => d.status === 'active').length;
      const disabledDeployments = deployments.filter(d => d.status === 'disabled').length;
      const errorDeployments = deployments.filter(d => d.status === 'error').length;
      const deletedDeployments = deployments.filter(d => d.status === 'deleted').length;
      
      const isArchived = conv.archived;
      const hasDeployments = deployments.length > 0;
      
      let deploymentIndicators = '';
      if (hasDeployments) {
        deploymentIndicators = `
          <div class="conversation-deployments">
            ${activeDeployments > 0 ? `<span class="deployment-indicator active"></span>${activeDeployments}` : ''}
            ${disabledDeployments > 0 ? `<span class="deployment-indicator disabled"></span>${disabledDeployments}` : ''}
            ${errorDeployments > 0 ? `<span class="deployment-indicator error"></span>${errorDeployments}` : ''}
            ${deletedDeployments > 0 ? `<span class="deployment-indicator deleted"></span>${deletedDeployments}` : ''}
            <span class="deployment-count">${deployments.length}</span>
          </div>
        `;
      }
      
      return `
        <button class="conversation-item ${conv.id === this._currentConversationId ? 'active' : ''} ${isArchived ? 'archived' : ''}" 
                data-conversation-id="${conv.id}">
          <div class="conversation-content">
            <div class="conversation-title">${conv.title || 'New Conversation'}</div>
            <div class="conversation-preview">${conv.preview || 'No messages yet'}</div>
            ${deploymentIndicators}
          </div>
          <div class="conversation-actions">
            <div class="conversation-date">${this._formatDate(conv.timestamp)}</div>
            <button class="conversation-delete-btn" data-conversation-id="${conv.id}" title="Delete conversation">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="m18 6-12 12"></path>
                <path d="m6 6 12 12"></path>
              </svg>
            </button>
          </div>
        </button>
      `;
    }).join('');

    // Add event listeners
    conversationsList.querySelectorAll('.conversation-item').forEach(item => {
      item.addEventListener('click', (e) => {
        if (e.target.closest('.conversation-delete-btn')) return;
        const conversationId = item.dataset.conversationId;
        this._loadConversation(conversationId);
      });
    });

    conversationsList.querySelectorAll('.conversation-delete-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const conversationId = btn.dataset.conversationId;
        this._deleteConversation(conversationId);
      });
    });
  }

  _generateConversationId() {
    return 'conv_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
  }

  _startNewConversation() {
    const conversationId = this._generateConversationId();
    
    // Create new conversation
    const newConversation = {
      id: conversationId,
      title: 'New Conversation',
      messages: [],
      timestamp: Date.now(),
      preview: 'No messages yet'
    };

    // Add to conversations list
    this._conversations.unshift(newConversation);
    
    // Set as current
    this._currentConversationId = conversationId;
    this._conversationMessages = [];
    
    // Clear chat
    this._clearChatMessages();
    
    // Update UI
    this._renderConversationsList();
    this._renderDeploymentPanel();
  }

  async _loadConversation(conversationId) {
    const conversation = this._conversations.find(c => c.id === conversationId);
    if (!conversation) return;

    this._currentConversationId = conversationId;
    this._conversationMessages = conversation.messages || [];
    
    // Clear and reload chat messages
    this._clearChatMessages();
    
    // Display messages
    this._conversationMessages.forEach(message => {
      this._addChatMessage(message.role, message.content, {}, false);
    });
    
    // Update UI
    this._renderConversationsList();
    this._renderDeploymentPanel();
  }

  async _saveCurrentConversation() {
    if (!this._currentConversationId) return;

    const conversation = this._conversations.find(c => c.id === this._currentConversationId);
    if (!conversation) return;

    // Update conversation data
    conversation.messages = [...this._conversationMessages];
    conversation.timestamp = Date.now();
    
    // Generate title and preview from first user message
    const firstUserMessage = this._conversationMessages.find(m => m.role === 'user');
    if (firstUserMessage && !conversation.title || conversation.title === 'New Conversation') {
      conversation.title = firstUserMessage.content.slice(0, 50);
      if (firstUserMessage.content.length > 50) {
        conversation.title += '...';
      }
    }
    
    const lastMessage = this._conversationMessages[this._conversationMessages.length - 1];
    if (lastMessage) {
      conversation.preview = lastMessage.content.slice(0, 100);
      if (lastMessage.content.length > 100) {
        conversation.preview += '...';
      }
    }

    // Save to server
    try {
      await this._hass.callWS({
        type: 'ai_config_assistant/save_conversation',
        conversation: conversation
      });
    } catch (error) {
      console.error('Failed to save conversation:', error);
    }
  }

  async _deleteConversation(conversationId) {
    if (!confirm('Are you sure you want to delete this conversation?')) return;

    try {
      // Delete from server
      await this._hass.callWS({
        type: 'ai_config_assistant/delete_conversation',
        conversation_id: conversationId
      });

      // Remove from local list
      this._conversations = this._conversations.filter(c => c.id !== conversationId);

      // If this was the current conversation, start a new one
      if (this._currentConversationId === conversationId) {
        if (this._conversations.length > 0) {
          this._loadConversation(this._conversations[0].id);
        } else {
          this._startNewConversation();
        }
      }

      // Update UI
      this._renderConversationsList();
    } catch (error) {
      console.error('Failed to delete conversation:', error);
    }
  }

  _clearChatMessages() {
    const root = this.shadowRoot;
    const chatMessages = root.getElementById('chat-messages');
    if (chatMessages) {
      chatMessages.innerHTML = '';
    }
  }

  _formatDate(timestamp) {
    if (!timestamp) return '';
    
    const now = new Date();
    const date = new Date(timestamp);
    const diff = now - date;
    
    // Less than 1 minute
    if (diff < 60000) {
      return 'now';
    }
    
    // Less than 1 hour
    if (diff < 3600000) {
      const minutes = Math.floor(diff / 60000);
      return `${minutes}m`;
    }
    
    // Less than 24 hours
    if (diff < 86400000) {
      const hours = Math.floor(diff / 3600000);
      return `${hours}h`;
    }
    
    // Less than 7 days
    if (diff < 604800000) {
      const days = Math.floor(diff / 86400000);
      return `${days}d`;
    }
    
    // Older than 7 days
    return date.toLocaleDateString('en-US', { 
      month: 'short', 
      day: 'numeric' 
    });
  }

  async _renderDeploymentPanel() {
    const root = this.shadowRoot;
    const deploymentPanel = root.getElementById('deployment-panel');
    if (!deploymentPanel) return;

    if (!this._currentConversationId) {
      deploymentPanel.style.display = 'none';
      return;
    }

    const conversation = this._conversations.find(c => c.id === this._currentConversationId);
    const deployments = conversation?.deployments || [];

    if (deployments.length === 0) {
      deploymentPanel.style.display = 'none';
      return;
    }

    deploymentPanel.style.display = 'block';
    deploymentPanel.innerHTML = `
      <h5>🚀 Deployed Configurations</h5>
      ${deployments.map(deployment => this._renderDeploymentItem(deployment)).join('')}
      <div style="margin-top: 8px; text-align: center;">
        <button class="deployment-action-btn" id="link-entity-btn">
          + Link Entity
        </button>
      </div>
    `;

    // Add event listeners for deployment actions
    this._attachDeploymentListeners();
  }

  _renderDeploymentItem(deployment) {
    const statusText = this._getDeploymentStatusText(deployment);
    const entityName = deployment.entity_id.replace(/^[^.]+\./, '').replace(/_/g, ' ');
    
    return `
      <div class="deployment-item" data-entity-id="${deployment.entity_id}">
        <div class="deployment-info">
          <div class="deployment-entity">
            <span class="deployment-indicator ${deployment.status}"></span>
            <a href="#" class="entity-link" data-entity-id="${deployment.entity_id}">
              ${entityName}
            </a>
          </div>
          <div class="deployment-status">${statusText}</div>
        </div>
        <div class="deployment-actions">
          <button class="deployment-action-btn edit" data-action="edit" data-entity-id="${deployment.entity_id}">
            ⚙️ Edit
          </button>
          <button class="deployment-action-btn version" data-action="versions" data-entity-id="${deployment.entity_id}">
            📦 v${deployment.version || 1}
          </button>
          <button class="deployment-action-btn delete" data-action="unlink" data-entity-id="${deployment.entity_id}">
            🗑️ Unlink
          </button>
        </div>
      </div>
    `;
  }

  _getDeploymentStatusText(deployment) {
    switch (deployment.status) {
      case 'active':
        return 'Active • Working properly';
      case 'disabled':
        return 'Disabled • Click to enable';
      case 'error':
        return 'Error • Needs attention';
      case 'deleted':
        return 'Deleted • Entity removed';
      default:
        return 'Unknown status';
    }
  }

  async _attachDeploymentListeners() {
    const root = this.shadowRoot;
    
    // Link entity button
    const linkEntityBtn = root.getElementById('link-entity-btn');
    if (linkEntityBtn) {
      linkEntityBtn.addEventListener('click', () => this._showLinkEntityDialog());
    }

    // Entity links - clickable entity names
    root.querySelectorAll('.entity-link').forEach(link => {
      link.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const entityId = link.dataset.entityId;
        this._showEntityDialog(entityId);
      });
    });

    // Deployment action buttons
    root.querySelectorAll('.deployment-action-btn[data-action]').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const action = btn.dataset.action;
        const entityId = btn.dataset.entityId;
        await this._handleDeploymentAction(action, entityId);
      });
    });
  }

  async _handleDeploymentAction(action, entityId) {
    switch (action) {
      case 'edit':
        this._openEntityEditor(entityId);
        break;
      case 'versions':
        await this._showVersionHistory(entityId);
        break;
      case 'unlink':
        await this._unlinkDeployment(entityId);
        break;
    }
  }

  _showEntityDialog(entityId) {
    // Use Home Assistant's built-in more-info dialog
    const event = new CustomEvent('hass-more-info', {
      detail: { entityId },
      bubbles: true,
      composed: true
    });
    this.dispatchEvent(event);
  }

  _openEntityEditor(entityId) {
    // Open Home Assistant's native entity editor
    const domain = entityId.split('.')[0];
    let editorPath;
    
    switch (domain) {
      case 'automation':
        editorPath = `/config/automation/edit/${entityId}`;
        break;
      case 'script':
        editorPath = `/config/script/edit/${entityId}`;
        break;
      case 'scene':
        editorPath = `/config/scene/edit/${entityId}`;
        break;
      default:
        alert('Entity editor not available for this type');
        return;
    }
    
    window.open(editorPath, '_blank');
  }

  async _showVersionHistory(entityId) {
    try {
      const response = await this._hass.callWS({
        type: 'ai_config_assistant/get_version_history',
        conversation_id: this._currentConversationId,
        entity_id: entityId
      });
      
      const versions = response.versions || [];
      const versionList = versions.map(v => 
        `<li>${v.is_current ? '<strong>' : ''}v${v.version} - ${v.note}${v.is_current ? ' (Current)</strong>' : ''}</li>`
      ).join('');
      
      const message = `
        <h4>Version History for ${entityId}</h4>
        <ul>${versionList}</ul>
      `;
      
      // For now, show in alert - in production, you'd want a proper modal
      alert(message.replace(/<[^>]*>/g, ''));
      
    } catch (error) {
      console.error('Failed to load version history:', error);
      alert('Failed to load version history');
    }
  }

  async _unlinkDeployment(entityId) {
    if (!confirm(`Unlink ${entityId} from this conversation?`)) return;
    
    try {
      await this._hass.callWS({
        type: 'ai_config_assistant/unlink_deployment',
        conversation_id: this._currentConversationId,
        entity_id: entityId
      });
      
      // Remove from local conversation data
      const conversation = this._conversations.find(c => c.id === this._currentConversationId);
      if (conversation) {
        conversation.deployments = conversation.deployments.filter(d => d.entity_id !== entityId);
      }
      
      // Update UI
      this._renderDeploymentPanel();
      this._renderConversationsList();
      
    } catch (error) {
      console.error('Failed to unlink deployment:', error);
      alert('Failed to unlink deployment');
    }
  }

  _showLinkEntityDialog() {
    const entityId = prompt('Enter entity ID to link (e.g., automation.my_automation):');
    if (!entityId) return;
    
    const configType = entityId.split('.')[0];
    const configYaml = prompt('Enter the YAML configuration (optional):') || '';
    
    this._linkEntityManually(entityId, configType, configYaml);
  }

  async _linkEntityManually(entityId, configType, configYaml) {
    try {
      await this._hass.callWS({
        type: 'ai_config_assistant/link_deployment',
        conversation_id: this._currentConversationId,
        entity_id: entityId,
        config_type: configType,
        config_yaml: configYaml,
        deployment_method: 'manual'
      });
      
      // Reload conversation data
      await this._loadConversations();
      this._loadConversation(this._currentConversationId);
      
    } catch (error) {
      console.error('Failed to link entity:', error);
      alert('Failed to link entity: ' + error.message);
    }
  }

  async _trackDeploymentInConversation(entityId, configType, configYaml) {
    console.log('Tracking deployment:', { entityId, configType, conversationId: this._currentConversationId });
    try {
      // Link the deployment to the current conversation
      const response = await this._hass.callWS({
        type: 'ai_config_assistant/link_deployment',
        conversation_id: this._currentConversationId,
        entity_id: entityId,
        config_type: configType,
        config_yaml: configYaml,
        deployment_method: 'direct'
      });
      console.log('Deployment tracking response:', response);
      
      // Update local conversation data
      const conversation = this._conversations.find(c => c.id === this._currentConversationId);
      if (conversation) {
        if (!conversation.deployments) {
          conversation.deployments = [];
        }
        
        // Add the new deployment
        conversation.deployments.push({
          entity_id: entityId,
          type: configType,
          deployed_at: new Date().toISOString(),
          deployment_method: 'direct',
          config_yaml: configYaml,
          status: 'active',
          version: 1
        });
        
        // Save the updated conversation
        await this._saveCurrentConversation();
        
        // Reload conversations to ensure we have the latest data from server
        await this._loadConversations();
        
        // Update UI
        this._renderDeploymentPanel();
        this._renderConversationsList();
      }
      
      console.log(`Deployment tracked: ${entityId} -> ${this._currentConversationId}`);
      
    } catch (error) {
      console.error('Failed to track deployment:', error);
      // Don't show an alert as this is a background operation
    }
  }
  });
}