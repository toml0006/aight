// Check if already defined to prevent duplicate registration
if (!customElements.get('ai-config-panel')) {
  customElements.define('ai-config-panel', class extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._hass = null;
    this._currentTab = 'chat';
    this._entities = [];
    this._autocompleteTimeout = null;
    this._slashCommands = [
      { command: '/automation', name: 'Create Automation', icon: '⚡', description: 'Generate automation with triggers and actions' },
      { command: '/scene', name: 'Create Scene', icon: '🎬', description: 'Define scene with device states' },
      { command: '/script', name: 'Create Script', icon: '📜', description: 'Build reusable script sequence' },
      { command: '/dashboard', name: 'Create Dashboard', icon: '📊', description: 'Design custom dashboard layout' },
      { command: '/template', name: 'Template Sensor', icon: '🔧', description: 'Create template-based sensor' },
      { command: '/helper', name: 'Create Helper', icon: '🎛️', description: 'Create input helper entity' },
      { command: '/agent', name: 'Switch Agent', icon: '🤖', description: 'Change the AI assistant agent' },
      { command: '/chat', name: 'Go to Chat', icon: '💬', description: 'Navigate to the Chat tab' },
      { command: '/validate', name: 'Go to Validate', icon: '✅', description: 'Navigate to the Validate tab' },
      { command: '/preview', name: 'Go to Preview', icon: '👁️', description: 'Navigate to the Preview tab' },
      { command: '/settings', name: 'Go to Settings', icon: '⚙️', description: 'Navigate to the Settings tab' }
    ];
    
    // Available AI agents
    this._availableAgents = [
      { id: 'home-assistant', name: 'Home Assistant AI', icon: '🤖', description: 'Specialized in Home Assistant automation' },
      { id: 'general', name: 'General Assistant', icon: '🧠', description: 'General purpose AI assistant' },
      { id: 'expert', name: 'YAML Expert', icon: '⚙️', description: 'Specialized in YAML configuration' }
    ];
    
    // Current selected agent
    this._currentAgent = this._availableAgents[0];
    this._showingAutocomplete = false;
    this._selectedAutocompleteIndex = -1;
    this._conversationMessages = [];
    this._conversationContext = {};
    this._isProcessing = false;
    this._conversationHistory = [];  // Initialize as empty, will load async
    this._currentConversationId = null;
    this._conversationSidebarOpen = false;
    this._conversationsLoaded = false;
  }

  set hass(hass) {
    this._hass = hass;
    
    // Log Home Assistant version for debugging
    if (hass && hass.config) {
      console.log('Home Assistant version:', hass.config.version);
      this._haVersion = hass.config.version;
    }
    
    if (!this._rendered) {
      this._render();
      this._rendered = true;
      this._loadEntities();
      // Initialize agent display
      this._updateAgentDisplay();
      // Load conversations asynchronously after render
      this._initializeConversations();
    }
  }

  async _initializeConversations() {
    if (this._conversationsLoaded) {
      return;
    }
    
    try {
      this._conversationHistory = await this._loadConversationHistory();
      this._conversationsLoaded = true;
      this._renderConversationList();
    } catch (error) {
      console.error('Failed to initialize conversations:', error);
      this._conversationHistory = [];
    }
  }

  _render() {
    this.shadowRoot.innerHTML = `
      <style>
        :host {
          display: block;
          padding: 16px;
          font-family: var(--paper-font-common-base_-_font-family);
          background: var(--primary-background-color);
          color: var(--primary-text-color);
        }

        .container {
          max-width: 1200px;
          margin: 0 auto;
        }

        .header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 24px;
          padding-bottom: 16px;
          border-bottom: 1px solid var(--divider-color);
          flex-wrap: wrap;
          gap: 16px;
        }

        .header-content {
          display: flex;
          align-items: center;
          gap: 32px;
          flex: 1;
        }

        .header-tabs {
          display: flex;
          gap: 8px;
          flex-wrap: wrap;
        }

        /* Mobile responsive adjustments */
        @media (max-width: 768px) {
          .header {
            flex-direction: column;
            gap: 12px;
            align-items: stretch;
          }

          .header-content {
            flex-direction: column;
            gap: 16px;
            align-items: stretch;
          }

          .header-tabs {
            justify-content: center;
          }

          .tab {
            font-size: 12px;
            padding: 6px 12px;
          }

          .autocomplete-dropdown {
            max-height: 150px;
            font-size: 14px;
          }

          .autocomplete-item {
            padding: 10px 12px;
          }

          .entity-autocomplete-dropdown {
            max-height: 150px;
            font-size: 14px;
          }

          .entity-autocomplete-item {
            padding: 10px 12px;
          }
        }

        .header h1 {
          margin: 0;
          font-size: 24px;
          font-weight: 400;
        }

        .header .status {
          font-size: 14px;
          color: var(--secondary-text-color);
        }

        /* Removed separate tabs container - tabs are now in header */

        .tab {
          padding: 8px 16px;
          background: var(--card-background-color);
          border: 1px solid var(--divider-color);
          border-radius: 8px;
          cursor: pointer;
          font-size: 13px;
          font-weight: 500;
          color: var(--secondary-text-color);
          transition: all 0.2s ease;
          white-space: nowrap;
        }

        .tab:hover {
          background: var(--primary-color);
          color: var(--text-primary-color);
          transform: translateY(-1px);
        }

        .tab.active {
          background: var(--primary-color);
          color: var(--text-primary-color);
          border-color: var(--primary-color);
        }

        .content {
          display: none;
        }

        .content.active {
          display: block;
          animation: fadeIn 0.3s ease;
        }

        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }

        .card {
          background: var(--card-background-color);
          border-radius: 8px;
          padding: 16px;
          margin-bottom: 16px;
          box-shadow: 0 2px 2px 0 rgba(0, 0, 0, 0.14),
                      0 1px 5px 0 rgba(0, 0, 0, 0.12),
                      0 3px 1px -2px rgba(0, 0, 0, 0.2);
        }

        .input-group {
          margin-bottom: 16px;
        }

        label {
          display: block;
          margin-bottom: 8px;
          font-weight: 500;
          font-size: 14px;
          color: var(--secondary-text-color);
        }

        input, textarea, select {
          width: 100%;
          padding: 12px;
          background: var(--card-background-color);
          border: 1px solid var(--divider-color);
          border-radius: 4px;
          color: var(--primary-text-color);
          font-family: inherit;
          font-size: 16px;
          box-sizing: border-box;
          transition: border-color 0.3s;
        }

        input:focus, textarea:focus, select:focus {
          outline: none;
          border-color: var(--primary-color);
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
          padding: 12px 24px;
          background: var(--primary-color);
          color: white;
          border: none;
          border-radius: 4px;
          cursor: pointer;
          font-family: inherit;
          font-size: 14px;
          font-weight: 500;
          text-transform: uppercase;
          transition: all 0.3s ease;
          min-width: 100px;
        }

        button:hover {
          background: var(--dark-primary-color);
          box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
        }

        button:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        button.secondary {
          background: transparent;
          color: var(--primary-color);
          border: 1px solid var(--primary-color);
        }

        button.secondary:hover {
          background: rgba(3, 169, 244, 0.1);
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
          position: absolute;
          top: 100%;
          left: 0;
          right: 0;
          background: var(--card-background-color);
          border: 1px solid var(--divider-color);
          border-radius: 4px;
          max-height: 200px;
          overflow-y: auto;
          z-index: 1000;
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
          display: none;
          margin-top: 4px;
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
          background: var(--secondary-background-color);
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
          padding: 12px;
          border-radius: 4px;
          margin: 16px 0;
          animation: slideIn 0.3s ease;
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
          background: var(--success-color, #4caf50);
          color: white;
        }

        .message.error {
          background: var(--error-color, #f44336);
          color: white;
        }

        .message.warning {
          background: var(--warning-color, #ff9800);
          color: white;
        }

        .message.info {
          background: var(--info-color, #2196f3);
          color: white;
        }

        .loading {
          display: inline-block;
          width: 20px;
          height: 20px;
          border: 3px solid rgba(255, 255, 255, 0.3);
          border-radius: 50%;
          border-top-color: white;
          animation: spin 1s ease-in-out infinite;
          vertical-align: middle;
          margin-right: 8px;
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
          padding: 6px 12px;
          background: var(--primary-color);
          color: white;
          border-radius: 16px;
          font-size: 12px;
          cursor: pointer;
          transition: all 0.2s;
        }

        .example-chip:hover {
          transform: scale(1.05);
          box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
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
        .chat-container {
          display: flex;
          flex-direction: row;
          height: calc(100vh - 200px);
          max-height: 700px;
          background: var(--card-background-color);
          border-radius: 8px;
          overflow: hidden;
        }

        .chat-main {
          display: flex;
          flex-direction: column;
          flex: 1;
          min-width: 0;
        }

        .conversations-sidebar {
          width: 300px;
          background: var(--secondary-background-color);
          border-left: 1px solid var(--divider-color);
          display: flex;
          flex-direction: column;
          transition: width 0.3s ease, opacity 0.3s ease;
        }

        .conversations-sidebar.collapsed {
          width: 0;
          opacity: 0;
          overflow: hidden;
        }

        .conversations-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 12px 16px;
          border-bottom: 1px solid var(--divider-color);
          background: var(--primary-background-color);
        }

        .conversations-header h4 {
          margin: 0;
          font-size: 14px;
          font-weight: 500;
          color: var(--primary-text-color);
        }

        .conversations-toggle {
          width: 40px;
          height: 40px;
          min-width: 40px;
          background: var(--primary-color);
          border: none;
          border-radius: 50%;
          color: white;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: all 0.2s ease;
          flex-shrink: 0;
        }

        .conversations-toggle:hover {
          transform: scale(1.1);
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
        }

        .conversations-toggle svg {
          width: 20px;
          height: 20px;
        }

        .conversations-list {
          flex: 1;
          overflow-y: auto;
          padding: 8px;
        }

        .conversation-item {
          padding: 12px;
          margin-bottom: 4px;
          border-radius: 6px;
          cursor: pointer;
          border: 1px solid transparent;
          transition: all 0.2s ease;
        }

        .conversation-item:hover {
          background: var(--primary-background-color);
          border-color: var(--divider-color);
        }

        .conversation-item.active {
          background: var(--primary-color);
          color: white;
        }

        .conversation-item.active .conversation-preview {
          color: rgba(255, 255, 255, 0.8);
        }

        .conversation-title {
          font-size: 13px;
          font-weight: 500;
          margin-bottom: 4px;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .conversation-preview {
          font-size: 12px;
          color: var(--secondary-text-color);
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          margin-bottom: 4px;
        }

        .conversation-date {
          font-size: 11px;
          color: var(--secondary-text-color);
        }

        .conversation-actions {
          display: flex;
          gap: 4px;
          opacity: 0;
          transition: opacity 0.2s ease;
        }

        .conversation-item:hover .conversation-actions {
          opacity: 1;
        }

        .conversation-action-btn {
          background: none;
          border: none;
          color: var(--secondary-text-color);
          cursor: pointer;
          padding: 2px;
          border-radius: 3px;
          font-size: 12px;
          min-width: auto;
          width: auto;
          height: auto;
        }

        .conversation-action-btn:hover {
          background: var(--divider-color);
        }

        .conversations-footer {
          padding: 12px 16px;
          border-top: 1px solid var(--divider-color);
          background: var(--primary-background-color);
        }

        .new-conversation-btn {
          width: 100%;
          padding: 8px 12px;
          background: var(--primary-color);
          color: white;
          border: none;
          border-radius: 4px;
          cursor: pointer;
          font-size: 13px;
          font-weight: 500;
        }

        .new-conversation-btn:hover {
          background: var(--dark-primary-color);
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

        .chat-header-controls {
          display: flex;
          align-items: center;
          gap: 12px;
        }

        .chat-header .conversations-toggle {
          color: rgba(255, 255, 255, 0.8);
          background: none;
        }

        .chat-header .conversations-toggle:hover {
          color: white;
          background: rgba(255, 255, 255, 0.1);
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
        }

        .chat-footer {
          padding: 12px 16px;
          background: var(--card-background-color);
          border-top: 1px solid var(--divider-color);
          display: flex;
          justify-content: space-between;
          align-items: center;
        }

        .chat-footer .chat-status {
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 14px;
          color: var(--secondary-text-color);
        }

        .chat-footer .chat-status-dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          background: #4caf50;
        }

        .chat-footer .conversations-toggle {
          background: none;
          border: none;
          color: var(--primary-text-color);
          cursor: pointer;
          padding: 8px;
          border-radius: 8px;
          font-size: 16px;
          transition: background-color 0.2s ease;
        }

        .chat-footer .conversations-toggle:hover {
          background: var(--secondary-background-color);
        }

        .chat-input-wrapper {
          display: flex;
          gap: 12px;
          align-items: flex-end;
        }

        .agent-indicator {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 8px 12px;
          margin-top: 8px;
          background: var(--secondary-background-color);
          border: 1px solid var(--divider-color);
          border-radius: 12px;
          cursor: pointer;
          transition: all 0.2s ease;
          font-size: 14px;
          color: var(--primary-text-color);
        }

        .agent-indicator:hover {
          background: var(--card-background-color);
          border-color: var(--primary-color);
        }

        .agent-icon {
          font-size: 16px;
        }

        .agent-selector-container {
          display: flex;
          align-items: center;
          gap: 12px;
          flex-wrap: wrap;
        }

        .change-agent-btn {
          padding: 8px 16px;
          background: var(--primary-color);
          color: white;
          border: none;
          border-radius: 8px;
          cursor: pointer;
          font-size: 14px;
          transition: all 0.2s ease;
        }

        .change-agent-btn:hover {
          background: var(--primary-color);
          opacity: 0.8;
        }

        .label-picker-container {
          position: relative;
          width: 100%;
        }
        
        .label-picker-button {
          width: 100%;
          padding: 12px 16px;
          border: 1px solid var(--divider-color);
          border-radius: 8px;
          background: var(--card-background-color);
          color: var(--primary-text-color);
          font-size: 14px;
          font-family: inherit;
          text-align: left;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: space-between;
          transition: border-color 0.3s ease;
        }
        
        .label-picker-button:hover {
          border-color: var(--primary-color);
        }
        
        .label-picker-button:focus {
          outline: none;
          border-color: var(--primary-color);
          box-shadow: 0 0 0 2px rgba(var(--primary-color-rgb), 0.2);
        }
        
        .selected-label {
          display: flex;
          align-items: center;
          gap: 8px;
        }
        
        .label-icon {
          width: 16px;
          height: 16px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 12px;
        }
        
        .label-dropdown {
          position: absolute;
          top: 100%;
          left: 0;
          right: 0;
          background: var(--card-background-color);
          border: 1px solid var(--divider-color);
          border-radius: 8px;
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
          z-index: 1000;
          max-height: 200px;
          overflow-y: auto;
          display: none;
        }
        
        .label-dropdown.open {
          display: block;
        }
        
        .label-option {
          padding: 12px 16px;
          cursor: pointer;
          display: flex;
          align-items: center;
          gap: 8px;
          border-bottom: 1px solid var(--divider-color);
          transition: background-color 0.2s ease;
        }
        
        .label-option:last-child {
          border-bottom: none;
        }
        
        .label-option:hover {
          background: var(--secondary-background-color);
        }
        
        .label-option.selected {
          background: rgba(var(--primary-color-rgb), 0.1);
        }
        
        .create-label-option {
          border-top: 1px solid var(--divider-color);
          color: var(--primary-color);
          font-weight: 500;
        }
        
        .no-labels-message {
          padding: 16px;
          text-align: center;
          color: var(--secondary-text-color);
          font-style: italic;
        }

        .disclaimer-text {
          margin-top: 8px;
          font-size: 12px;
          color: var(--secondary-text-color);
          opacity: 0.8;
        }


        .autocomplete-container {
          flex: 1;
        }

        .chat-input {
          width: 100%;
          min-height: 44px;
          max-height: 120px;
          padding: 12px 20px;
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

        /* Autocomplete Styles */
        .autocomplete-container {
          position: relative;
        }

        .autocomplete-dropdown {
          position: absolute;
          bottom: 100%;
          left: 0;
          right: 0;
          background: var(--card-background-color);
          border: 1px solid var(--divider-color);
          border-radius: 12px;
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
          max-height: 200px;
          overflow-y: auto;
          z-index: 1000;
          margin-bottom: 8px;
          display: none;
        }

        .autocomplete-dropdown.show {
          display: block;
          animation: slideUpFade 0.2s ease;
        }

        @keyframes slideUpFade {
          from {
            opacity: 0;
            transform: translateY(10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        .autocomplete-item {
          padding: 12px 16px;
          cursor: pointer;
          border-bottom: 1px solid var(--divider-color);
          transition: background-color 0.2s ease;
          display: flex;
          align-items: center;
          gap: 12px;
        }

        .autocomplete-item:last-child {
          border-bottom: none;
        }

        .autocomplete-item:hover,
        .autocomplete-item.selected {
          background: var(--primary-color);
          color: var(--text-primary-color);
        }

        .autocomplete-item .icon {
          font-size: 16px;
          width: 20px;
          text-align: center;
        }

        .autocomplete-item .details {
          flex: 1;
        }

        .autocomplete-item .command {
          font-weight: 500;
          font-size: 14px;
        }

        .autocomplete-item .description {
          font-size: 12px;
          opacity: 0.7;
          margin-top: 2px;
        }

        .autocomplete-item.selected .description {
          opacity: 0.9;
        }

        /* Entity Autocomplete Styles */
        .entity-autocomplete-container {
          position: relative;
        }

        .entity-autocomplete-dropdown {
          position: absolute;
          top: 100%;
          left: 0;
          right: 0;
          background: var(--card-background-color);
          border: 1px solid var(--divider-color);
          border-radius: 8px;
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
          max-height: 200px;
          overflow-y: auto;
          z-index: 9999;
          margin-top: 4px;
          display: none;
        }

        .entity-autocomplete-dropdown.show {
          display: block;
          animation: slideDownFade 0.2s ease;
        }

        @keyframes slideDownFade {
          from {
            opacity: 0;
            transform: translateY(-10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        .entity-autocomplete-item {
          padding: 8px 12px;
          cursor: pointer;
          border-bottom: 1px solid var(--divider-color);
          transition: background-color 0.2s ease;
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .entity-autocomplete-item:last-child {
          border-bottom: none;
        }

        .entity-autocomplete-item:hover,
        .entity-autocomplete-item.selected {
          background: var(--primary-color);
          color: var(--text-primary-color);
        }

        .entity-autocomplete-item .entity-id {
          font-family: monospace;
          font-size: 12px;
          font-weight: 500;
        }

        .entity-autocomplete-item .friendly-name {
          font-size: 13px;
          opacity: 0.8;
        }

        .entity-autocomplete-item.selected .friendly-name {
          opacity: 1;
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

        .deploy-options {
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .deploy-target {
          padding: 8px 12px;
          border-radius: 4px;
          border: 1px solid var(--divider-color);
          background: var(--card-background-color);
          cursor: pointer;
          font-size: 13px;
          font-family: inherit;
        }

        .deploy-target:focus {
          outline: 2px solid var(--primary-color);
          outline-offset: 2px;
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
          .chat-container {
            height: calc(100vh - 150px);
            flex-direction: column;
          }
          
          .conversations-sidebar {
            width: 100%;
            height: 300px;
            border-left: none;
            border-top: 1px solid var(--divider-color);
            order: 2;
          }
          
          .conversations-sidebar.collapsed {
            height: 0;
            min-height: 0;
          }
          
          .chat-main {
            order: 1;
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
        
        .action-buttons {
          display: flex;
          gap: 10px;
          margin-top: 10px;
        }
        
        .execute-script-btn,
        .save-script-btn {
          padding: 8px 16px;
          border: none;
          border-radius: 4px;
          cursor: pointer;
          font-size: 14px;
          font-weight: 500;
          transition: all 0.2s;
        }
        
        .execute-script-btn.primary {
          background: var(--primary-color);
          color: white;
        }
        
        .execute-script-btn.primary:hover {
          opacity: 0.9;
        }
        
        .save-script-btn {
          background: var(--card-background-color);
          color: var(--primary-text-color);
          border: 1px solid var(--divider-color);
        }
        
        .save-script-btn:hover {
          background: var(--secondary-background-color);
        }
      </style>

      <div class="container">
        <div class="header">
          <div class="header-content">
            <h1>🤖 AIGHT</h1>
            <div class="header-tabs">
              <button class="tab active" data-tab="chat">Chat</button>
              <button class="tab" data-tab="validate">Validate</button>
              <button class="tab" data-tab="preview">Preview</button>
              <button class="tab" data-tab="debug">LLM Debug</button>
              <button class="tab" data-tab="help">Help</button>
              <button class="tab" data-tab="settings">Settings</button>
            </div>
          </div>
          <div style="display: flex; align-items: center; gap: 16px;">
            <div class="status" id="entity-count"></div>
            <button id="reload-btn" class="secondary" style="min-width: auto; padding: 8px 16px;">🔄 Reload</button>
          </div>
        </div>

        <div class="content active" id="chat">
          <div class="chat-container">
            <div class="chat-main">
              <div class="chat-messages" id="chat-messages">
                <!-- Messages will be added here dynamically -->
              </div>
              <div class="chat-input-container">
                <div class="chat-input-wrapper">
                  <div class="autocomplete-container">
                    <div class="autocomplete-dropdown" id="autocomplete-dropdown"></div>
                    <textarea 
                      class="chat-input" 
                      id="chat-input"
                      placeholder="Describe what you want to configure or type / for commands..."
                      rows="1"
                    ></textarea>
                  </div>
                  <button class="chat-send-btn" id="chat-send-btn" title="Send message">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                      <path d="m22 2-7 20-4-9-9-4Z"/>
                      <path d="M22 2 11 13"/>
                    </svg>
                  </button>
                  <button class="conversations-toggle" id="conversations-toggle" title="Toggle conversation history">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
                    </svg>
                  </button>
                </div>
                <div class="disclaimer-text">
                  AI can make mistakes. Please verify important information.
                </div>
              </div>
            </div>
            <div class="conversations-sidebar collapsed" id="conversations-sidebar">
              <div class="conversations-header">
                <h4>Conversations</h4>
                <button class="conversations-toggle" id="conversations-close" title="Close sidebar">
                  ✕
                </button>
              </div>
              <div class="conversations-list" id="conversations-list">
                <!-- Conversation history will be loaded here -->
              </div>
              <div class="conversations-footer">
                <button class="new-conversation-btn" id="new-conversation-btn">
                  + New Conversation
                </button>
              </div>
            </div>
          </div>
        </div>

        <div class="content" id="settings">
          <div class="card">
            <h3>Settings</h3>
            
            <div class="input-group">
              <label>AI Assistant Agent</label>
              <div class="agent-selector-container">
                <div class="agent-indicator" id="agent-indicator-settings" title="Current AI agent">
                  <span class="agent-icon">🤖</span>
                  <span class="agent-name" id="agent-name-settings">Home Assistant AI</span>
                </div>
                <button class="change-agent-btn" id="change-agent-btn" title="Change AI agent">
                  Change Agent
                </button>
              </div>
            </div>

            <div class="input-group">
              <label>Auto-label Configuration</label>
              <div class="label-picker-container">
                <button type="button" class="label-picker-button" id="label-picker-button">
                  <div class="selected-label">
                    <span class="label-icon" id="selected-label-icon" style="background-color: #888;">🏷️</span>
                    <span id="selected-label-name">No label selected</span>
                  </div>
                  <span>▼</span>
                </button>
                <div class="label-dropdown" id="label-dropdown">
                  <div class="no-labels-message" id="no-labels-message">
                    Loading labels...
                  </div>
                </div>
              </div>
              <small>Select a label to automatically apply to generated configurations</small>
            </div>

            <div class="input-group">
              <button class="primary" id="save-settings-btn">Save Settings</button>
            </div>
          </div>
        </div>

        <!-- Form tab removed - replaced with slash commands in chat -->

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
              <div class="entity-autocomplete-container">
                <div class="entity-autocomplete-dropdown" id="validate-entity-dropdown"></div>
                <textarea id="config-yaml" class="code-editor" placeholder="Paste your YAML configuration here..."></textarea>
              </div>
              <div class="help-text">Paste your YAML configuration to validate its syntax. Entity IDs will autocomplete as you type.</div>
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
              <div class="entity-autocomplete-container">
                <div class="entity-autocomplete-dropdown" id="preview-entity-dropdown"></div>
                <textarea id="preview-yaml" class="code-editor" placeholder="Paste your YAML configuration here..."></textarea>
              </div>
              <div class="help-text">Preview how your configuration will work with current entity states. Entity IDs will autocomplete as you type.</div>
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

    // Generate button and clear button removed - Form tab functionality replaced with slash commands

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
    if (promptField) {
      promptField.addEventListener('input', (e) => {
        clearTimeout(this._autocompleteTimeout);
        this._autocompleteTimeout = setTimeout(() => {
          this._handleEntityAutocomplete(e.target.value);
        }, 150);
      });
      
      // Hide suggestions when clicking outside
      promptField.addEventListener('blur', () => {
        setTimeout(() => {
          const suggestionsDiv = root.getElementById('entity-suggestions');
          suggestionsDiv.classList.remove('show');
        }, 200); // Small delay to allow click on suggestion
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

    // Chat interface event listeners with slash command support
    const chatInput = root.getElementById('chat-input');
    const chatSendBtn = root.getElementById('chat-send-btn');
    const agentIndicator = root.getElementById('agent-indicator');
    const autocompleteDropdown = root.getElementById('autocomplete-dropdown');
    
    if (chatInput && chatSendBtn) {
      // Send message on button click
      chatSendBtn.addEventListener('click', () => this._sendChatMessage());
      
      // Agent selector click handler
      if (agentIndicator) {
        agentIndicator.addEventListener('click', () => {
          this._showAgentSelector();
        });
      }
      
      // Enhanced keydown handler with slash command support
      chatInput.addEventListener('keydown', (e) => {
        if (this._showingAutocomplete) {
          this._handleAutocompleteKeydown(e);
        } else if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          this._sendChatMessage();
        }
      });
      
      // Enhanced input handler with slash command detection
      chatInput.addEventListener('input', (e) => {
        // Auto-resize textarea
        chatInput.style.height = 'auto';
        chatInput.style.height = Math.min(chatInput.scrollHeight, 120) + 'px';
        
        // Handle slash command autocomplete
        this._handleSlashCommandInput(e.target.value);
      });
      
      // Hide autocomplete when clicking outside
      document.addEventListener('click', (e) => {
        if (!e.target.closest('.autocomplete-container')) {
          this._hideAutocomplete();
        }
      });
    }
    
    // Quick action chips
    root.querySelectorAll('.quick-action-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        const action = chip.dataset.action;
        this._handleQuickAction(action);
      });
    });

    // Entity autocomplete for Validate and Preview tabs
    this._setupEntityAutocomplete();
    
    // Settings tab event listeners
    const changeAgentBtn = root.getElementById('change-agent-btn');
    if (changeAgentBtn) {
      changeAgentBtn.addEventListener('click', () => {
        this._showAgentSelector();
      });
    }
    
    const saveSettingsBtn = root.getElementById('save-settings-btn');
    if (saveSettingsBtn) {
      saveSettingsBtn.addEventListener('click', () => {
        this._saveSettings();
      });
    }
    
    // Load saved settings
    this._loadSettings();
    
    // Initialize label picker properties
    this._selectedLabelId = null;
    this._availableLabels = [];
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

  _handleEntityAutocomplete(text) {
    const root = this.shadowRoot;
    const suggestionsDiv = root.getElementById('entity-suggestions');

    // Handle edge cases where text might be undefined or null
    if (!text || typeof text !== 'string') {
      suggestionsDiv.classList.remove('show');
      return;
    }

    // More flexible pattern to catch entity typing
    const words = text.split(/\s+/);
    const lastWord = words[words.length - 1] || '';
    
    // Check if the last word looks like an entity being typed
    if (lastWord.includes('.') && this._entities.length > 0) {
      const query = lastWord.toLowerCase();
      const queryParts = query.split('.');
      const domain = queryParts[0];
      const entityPart = queryParts[1] || '';

      // Filter entities by domain and partial entity name
      const suggestions = this._entities
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

      if (suggestions.length > 0) {
        suggestionsDiv.innerHTML = suggestions.map(entity => {
          const entityParts = entity.entity_id.split('.');
          let highlightedName = entity.entity_id;
          
          // Only highlight if entityPart exists and is not empty
          if (entityPart && entityPart.length > 0) {
            // Escape special regex characters in entityPart
            const escapedEntityPart = entityPart.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            highlightedName = entity.entity_id.replace(
              new RegExp(`(${escapedEntityPart})`, 'gi'), 
              '<strong>$1</strong>'
            );
          }
          
          return '<div class="entity-suggestion" data-entity="' + entity.entity_id + '">' +
            '<div class="entity-name">' + highlightedName + '</div>' +
            '<div class="entity-info">' + entity.friendly_name + ' (' + entity.state + ')</div>' +
            '</div>';
        }).join('');

        suggestionsDiv.classList.add('show');

        // Re-attach click events
        suggestionsDiv.querySelectorAll('.entity-suggestion').forEach(suggestion => {
          suggestion.addEventListener('click', () => {
            const entityId = suggestion.dataset.entity;
            const textarea = root.getElementById('prompt');
            const currentText = textarea.value;
            
            // Replace the last word (partial entity) with the selected entity
            const words = currentText.split(/\s+/);
            words[words.length - 1] = entityId;
            textarea.value = words.join(' ') + ' ';
            
            suggestionsDiv.classList.remove('show');
            textarea.focus();
          });
        });
      } else {
        suggestionsDiv.classList.remove('show');
      }
    } else {
      suggestionsDiv.classList.remove('show');
    }
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
    // Initialize conversation listeners
    this._attachConversationListeners();
    
    // Add welcome message if no messages exist
    if (this._conversationMessages.length === 0) {
      this._addChatMessage('assistant', 'Hi! I\'m your AI Configuration Assistant. I can help you create automations, scenes, scripts, dashboards, template sensors, and helpers for Home Assistant. Just describe what you want in natural language, or use slash commands for quick access!');
      
      // Add example suggestions
      this._addChatMessage('system', 'Try: "Turn on the lights when I get home after sunset", or use slash commands like /automation, /scene, /script, /dashboard, /template, or /helper. Type / to see all available commands. Use /settings to configure the AI agent.');
    }
  }

  _addChatMessage(type, content, extras = {}) {
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
    
    // Store message in conversation history (only if not loading from history)
    if (!this._isLoadingFromHistory) {
      this._conversationMessages.push({ type, content, timestamp, extras });
      
      // Auto-save conversation after adding messages (debounced)
      if (this._saveTimeout) {
        clearTimeout(this._saveTimeout);
      }
      this._saveTimeout = setTimeout(() => {
        this._saveCurrentConversation();
      }, 1000);
    }
    
    // Attach error log listeners if they exist
    if (extras.debugInfo) {
      setTimeout(() => this._attachErrorLogListeners(), 100);
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
    
    // Check if this is a slash command
    if (message.startsWith('/')) {
      this._handleSlashCommand(message);
      chatInput.value = '';
      chatInput.style.height = 'auto';
      return;
    }
    
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
      
      // Check if this is a one-time action request
      const isOneTimeAction = this._isOneTimeActionRequest(message);
      
      if (isOneTimeAction) {
        // User wants to perform a one-time action
        await this._handleOneTimeAction(message);
        return;
      }
      
      // Check if this is a refinement request
      const isRefinement = this._isRefinementRequest(message);
      
      if (isRefinement && this._conversationContext.lastConfig) {
        // User wants to refine the last configuration
        await this._refineConfiguration(message);
      } else {
        // Detect config type first
        const configType = this._detectConfigType(message);
        
        // Detect relevant domains and get entities
        const relevantDomains = this._detectRelevantDomains(message);
        const relevantEntities = this._getRelevantEntities(message, relevantDomains, configType);
        
        // Store context
        this._conversationContext = {
          originalPrompt: message,
          configType: configType,
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

  // Slash command handling methods
  _handleSlashCommandInput(value) {
    const lines = value.split('\n');
    const currentLine = lines[lines.length - 1];
    
    if (currentLine.startsWith('/')) {
      this._showSlashCommandAutocomplete(currentLine);
    } else {
      this._hideAutocomplete();
    }
  }

  _showSlashCommandAutocomplete(input) {
    const root = this.shadowRoot;
    const dropdown = root.getElementById('autocomplete-dropdown');
    
    if (!dropdown) return;
    
    const query = input.slice(1).toLowerCase(); // Remove the /
    const matchingCommands = this._slashCommands.filter(cmd =>
      cmd.command.slice(1).toLowerCase().includes(query) ||
      cmd.name.toLowerCase().includes(query)
    );
    
    if (matchingCommands.length === 0) {
      this._hideAutocomplete();
      return;
    }
    
    dropdown.innerHTML = matchingCommands.map((cmd, index) => `
      <div class="autocomplete-item ${index === 0 ? 'selected' : ''}" data-command="${cmd.command}">
        <div class="icon">${cmd.icon}</div>
        <div class="details">
          <div class="command">${cmd.command} ${cmd.name}</div>
          <div class="description">${cmd.description}</div>
        </div>
      </div>
    `).join('');
    
    // Add click handlers
    dropdown.querySelectorAll('.autocomplete-item').forEach(item => {
      item.addEventListener('click', () => {
        this._selectSlashCommand(item.dataset.command);
      });
    });
    
    dropdown.classList.add('show');
    this._showingAutocomplete = true;
    this._selectedAutocompleteIndex = 0;
  }

  _hideAutocomplete() {
    const root = this.shadowRoot;
    const dropdown = root.getElementById('autocomplete-dropdown');
    if (dropdown) {
      dropdown.classList.remove('show');
      dropdown.innerHTML = '';
    }
    this._showingAutocomplete = false;
    this._selectedAutocompleteIndex = -1;
  }

  _handleAutocompleteKeydown(e) {
    const root = this.shadowRoot;
    const dropdown = root.getElementById('autocomplete-dropdown');
    const items = dropdown.querySelectorAll('.autocomplete-item');
    
    if (items.length === 0) return;
    
    switch (e.key) {
      case 'Escape':
        e.preventDefault();
        this._hideAutocomplete();
        break;
        
      case 'ArrowUp':
        e.preventDefault();
        this._selectedAutocompleteIndex = Math.max(0, this._selectedAutocompleteIndex - 1);
        this._updateAutocompleteSelection(items);
        break;
        
      case 'ArrowDown':
        e.preventDefault();
        this._selectedAutocompleteIndex = Math.min(items.length - 1, this._selectedAutocompleteIndex + 1);
        this._updateAutocompleteSelection(items);
        break;
        
      case 'Tab':
      case 'Enter':
        e.preventDefault();
        const selectedItem = items[this._selectedAutocompleteIndex];
        if (selectedItem) {
          this._selectSlashCommand(selectedItem.dataset.command);
        }
        break;
    }
  }

  _updateAutocompleteSelection(items) {
    items.forEach((item, index) => {
      item.classList.toggle('selected', index === this._selectedAutocompleteIndex);
    });
  }

  _selectSlashCommand(command) {
    const root = this.shadowRoot;
    const chatInput = root.getElementById('chat-input');
    
    // Special handling for /agent command
    if (command === '/agent') {
      this._showAgentSelector();
      this._hideAutocomplete();
      return;
    }
    
    // Transform slash command to natural language prompt
    const prompt = this._transformSlashCommand(command);
    
    // Add user message showing what they selected
    this._addChatMessage('user', command);
    
    // Add the transformed prompt and send it
    chatInput.value = prompt;
    this._hideAutocomplete();
    this._sendChatMessage();
  }

  _transformSlashCommand(command) {
    const commandMap = {
      '/automation': 'Create an automation that ',
      '/scene': 'Create a scene that defines ',
      '/script': 'Create a script sequence that ',
      '/dashboard': 'Create a dashboard layout with ',
      '/template': 'Create a template sensor that calculates or monitors ',
      '/helper': 'Create an input helper entity for ',
      '/agent': 'Switch to a different AI agent: '
    };
    
    const basePrompt = commandMap[command] || 'Help me create ';
    
    // Add some context to make it more specific
    const contextPrompts = {
      '/automation': 'Create an automation with triggers and actions. Please describe what should trigger it and what should happen.',
      '/scene': 'Create a scene that sets specific device states. Please describe what devices should be included and their desired states.',
      '/script': 'Create a script with a sequence of actions. Please describe what steps the script should perform.',
      '/dashboard': 'Create a custom dashboard layout. Please describe what cards and information should be displayed.',
      '/template': 'Create a template sensor that calculates values or monitors conditions. Please describe what it should calculate or monitor.',
      '/helper': 'Create an input helper (input_boolean, input_number, input_select, etc.). Please describe what type of helper and its purpose.',
      '/agent': 'Select a different AI agent for specialized assistance.'
    };
    
    return contextPrompts[command] || basePrompt;
  }

  _switchToTab(tabName) {
    const root = this.shadowRoot;
    
    // Update active tab
    root.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    root.querySelectorAll('.content').forEach(c => c.classList.remove('active'));
    
    const targetTab = root.querySelector(`[data-tab="${tabName}"]`);
    const targetContent = root.getElementById(tabName);
    
    if (targetTab && targetContent) {
      targetTab.classList.add('active');
      targetContent.classList.add('active');
      this._currentTab = tabName;
    }
  }

  _handleSlashCommand(command) {
    const cleanCommand = command.split(' ')[0]; // Get just the command part
    const remainingText = command.substring(cleanCommand.length).trim(); // Get text after command
    
    if (!this._slashCommands.find(cmd => cmd.command === cleanCommand)) {
      this._addChatMessage('system', `Unknown command: ${cleanCommand}. Type / to see available commands.`);
      return;
    }
    
    // Handle navigation commands
    const navigationCommands = ['/chat', '/validate', '/preview', '/settings'];
    if (navigationCommands.includes(cleanCommand)) {
      const tabName = cleanCommand.substring(1); // Remove the '/'
      this._switchToTab(tabName);
      
      // If there's remaining text, put it back in the chat input
      const chatInput = this.shadowRoot.getElementById('chat-input');
      if (remainingText && tabName === 'chat') {
        chatInput.value = remainingText;
        chatInput.focus();
      }
      return;
    }
    
    // Special handling for /agent command
    if (cleanCommand === '/agent') {
      this._switchToTab('settings');
      return;
    }
    
    // Transform and send the command
    const prompt = this._transformSlashCommand(cleanCommand);
    const chatInput = this.shadowRoot.getElementById('chat-input');
    
    // Add user message showing the command
    this._addChatMessage('user', cleanCommand);
    
    // Set the prompt (and any remaining text) and send
    chatInput.value = remainingText ? `${prompt} ${remainingText}` : prompt;
    this._sendChatMessage();
  }

  // Entity autocomplete methods
  _setupEntityAutocomplete() {
    const root = this.shadowRoot;
    
    // Setup autocomplete for validate tab
    const configYaml = root.getElementById('config-yaml');
    if (configYaml) {
      this._setupTextareaEntityAutocomplete(configYaml, 'validate-entity-dropdown');
    }
    
    // Setup autocomplete for preview tab
    const previewYaml = root.getElementById('preview-yaml');
    if (previewYaml) {
      this._setupTextareaEntityAutocomplete(previewYaml, 'preview-entity-dropdown');
    }
  }

  _setupTextareaEntityAutocomplete(textarea, dropdownId) {
    const root = this.shadowRoot;
    const dropdown = root.getElementById(dropdownId);
    
    if (!textarea || !dropdown) return;
    
    let currentEntityAutocomplete = null;
    let selectedEntityIndex = -1;
    
    // Handle input for entity detection
    textarea.addEventListener('input', (e) => {
      const cursorPos = e.target.selectionStart;
      const textBeforeCursor = e.target.value.substring(0, cursorPos);
      
      // Look for entity_id patterns
      const entityMatch = this._findEntityIdAtCursor(textBeforeCursor);
      
      if (entityMatch) {
        // Get cursor coordinates for positioning
        const cursorCoords = this._getCursorCoordinates(e.target, cursorPos);
        
        this._showEntityAutocomplete(dropdown, entityMatch.query, (entityId) => {
          // Replace the partial entity_id with the selected one
          const beforeMatch = e.target.value.substring(0, entityMatch.start);
          const afterCursor = e.target.value.substring(cursorPos);
          e.target.value = beforeMatch + entityId + afterCursor;
          
          // Position cursor after the inserted entity_id
          const newCursorPos = entityMatch.start + entityId.length;
          e.target.setSelectionRange(newCursorPos, newCursorPos);
          
          this._hideEntityAutocomplete(dropdown);
        }, cursorCoords);
        currentEntityAutocomplete = { dropdown, callback: null };
        selectedEntityIndex = 0; // Reset selection to first item
      } else {
        this._hideEntityAutocomplete(dropdown);
        currentEntityAutocomplete = null;
      }
    });
    
    // Handle keyboard navigation
    textarea.addEventListener('keydown', (e) => {
      if (currentEntityAutocomplete && dropdown.classList.contains('show')) {
        const items = dropdown.querySelectorAll('.entity-autocomplete-item');
        
        switch (e.key) {
          case 'Escape':
            e.preventDefault();
            this._hideEntityAutocomplete(dropdown);
            currentEntityAutocomplete = null;
            break;
            
          case 'ArrowUp':
            e.preventDefault();
            selectedEntityIndex = Math.max(0, selectedEntityIndex - 1);
            this._updateEntitySelection(items, selectedEntityIndex);
            break;
            
          case 'ArrowDown':
            e.preventDefault();
            selectedEntityIndex = Math.min(items.length - 1, selectedEntityIndex + 1);
            this._updateEntitySelection(items, selectedEntityIndex);
            break;
            
          case 'Tab':
          case 'Enter':
            if (selectedEntityIndex >= 0 && selectedEntityIndex < items.length) {
              e.preventDefault();
              items[selectedEntityIndex].click();
            }
            break;
        }
      }
    });
    
    // Hide dropdown when textarea loses focus (with delay to allow clicks)
    textarea.addEventListener('blur', () => {
      setTimeout(() => {
        if (currentEntityAutocomplete) {
          this._hideEntityAutocomplete(dropdown);
          currentEntityAutocomplete = null;
        }
      }, 200);
    });
  }

  _getCursorCoordinates(textarea, cursorPos) {
    // Create a mirror div to measure text position
    const mirror = document.createElement('div');
    const computedStyle = getComputedStyle(textarea);
    
    // Copy textarea styles to mirror
    mirror.style.position = 'absolute';
    mirror.style.left = '-9999px';
    mirror.style.top = '-9999px';
    mirror.style.whiteSpace = 'pre-wrap';
    mirror.style.wordWrap = 'break-word';
    mirror.style.padding = computedStyle.padding;
    mirror.style.border = computedStyle.border;
    mirror.style.fontSize = computedStyle.fontSize;
    mirror.style.fontFamily = computedStyle.fontFamily;
    mirror.style.lineHeight = computedStyle.lineHeight;
    mirror.style.width = textarea.offsetWidth + 'px';
    mirror.style.height = textarea.offsetHeight + 'px';
    mirror.style.overflow = 'hidden';
    
    document.body.appendChild(mirror);
    
    // Get text before cursor
    const textBeforeCursor = textarea.value.substring(0, cursorPos);
    mirror.textContent = textBeforeCursor;
    
    // Add a span to mark cursor position
    const cursorSpan = document.createElement('span');
    cursorSpan.textContent = '|';
    mirror.appendChild(cursorSpan);
    
    const textareaRect = textarea.getBoundingClientRect();
    const cursorSpanRect = cursorSpan.getBoundingClientRect();
    const mirrorRect = mirror.getBoundingClientRect();
    
    // Calculate relative position
    const x = cursorSpanRect.left - mirrorRect.left;
    const y = cursorSpanRect.top - mirrorRect.top;
    
    document.body.removeChild(mirror);
    
    return {
      x: x + textareaRect.left,
      y: y + textareaRect.top
    };
  }

  _findEntityIdAtCursor(textBeforeCursor) {
    // Look for patterns like: entity_id: light.kitchen_
    // or: - light.living_room_
    // or: entity: switch.bedroom_
    
    const patterns = [
      /entity_id:\s*([a-zA-Z_]*\.[a-zA-Z0-9_]*)$/,
      /entity:\s*([a-zA-Z_]*\.[a-zA-Z0-9_]*)$/,
      /^\s*-\s*([a-zA-Z_]*\.[a-zA-Z0-9_]*)$/m,
      /service_data:\s*entity_id:\s*([a-zA-Z_]*\.[a-zA-Z0-9_]*)$/,
      /"([a-zA-Z_]*\.[a-zA-Z0-9_]*)"?$/,
      /'([a-zA-Z_]*\.[a-zA-Z0-9_]*)'?$/
    ];
    
    for (const pattern of patterns) {
      const match = textBeforeCursor.match(pattern);
      if (match && match[1]) {
        const query = match[1];
        const start = textBeforeCursor.lastIndexOf(query);
        
        // Only show autocomplete if the query looks like it could be an entity_id
        if (query.includes('.') || query.length >= 2) {
          return { query, start };
        }
      }
    }
    
    return null;
  }

  _showEntityAutocomplete(dropdown, query, callback, cursorCoords = null) {
    if (!this._entities || this._entities.length === 0) {
      return;
    }
    
    // Filter entities based on the query
    const filteredEntities = this._entities.filter(entity => {
      const entityId = entity.entity_id.toLowerCase();
      const friendlyName = (entity.friendly_name || '').toLowerCase();
      const queryLower = query.toLowerCase();
      
      return entityId.includes(queryLower) || friendlyName.includes(queryLower);
    }).slice(0, 10); // Limit to 10 results
    
    if (filteredEntities.length === 0) {
      this._hideEntityAutocomplete(dropdown);
      return;
    }
    
    // Populate dropdown
    dropdown.innerHTML = filteredEntities.map((entity, index) => `
      <div class="entity-autocomplete-item ${index === 0 ? 'selected' : ''}" data-entity-id="${entity.entity_id}">
        <div class="entity-id">${entity.entity_id}</div>
        <div class="friendly-name">${entity.friendly_name || ''}</div>
      </div>
    `).join('');
    
    // Add click handlers
    dropdown.querySelectorAll('.entity-autocomplete-item').forEach(item => {
      item.addEventListener('mousedown', (e) => {
        // Prevent blur event from firing and hiding dropdown
        e.preventDefault();
      });
      item.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        callback(item.dataset.entityId);
      });
    });
    
    // Position the dropdown at cursor coordinates if provided
    if (cursorCoords) {
      dropdown.style.position = 'fixed';
      dropdown.style.width = '300px'; // Set width first for proper measurement
      dropdown.style.zIndex = '9999'; // Ensure it appears on top
      
      // Calculate dropdown dimensions
      const dropdownHeight = Math.min(200, filteredEntities.length * 40 + 20); // Estimate height
      
      // Calculate positioning with screen bounds checking
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;
      
      let left = cursorCoords.x;
      let top = cursorCoords.y + 20; // Show below cursor by default
      
      // Check if dropdown goes off right edge
      if (left + 300 > viewportWidth) {
        left = viewportWidth - 320; // 20px padding from edge
      }
      
      // Check if dropdown goes off bottom edge
      if (top + dropdownHeight > viewportHeight) {
        top = cursorCoords.y - dropdownHeight - 10; // Show above cursor
      }
      
      dropdown.style.left = `${Math.max(10, left)}px`;
      dropdown.style.top = `${Math.max(10, top)}px`;
    }
    
    dropdown.classList.add('show');
  }

  _hideEntityAutocomplete(dropdown) {
    dropdown.classList.remove('show');
    dropdown.innerHTML = '';
  }

  _updateEntitySelection(items, selectedIndex) {
    items.forEach((item, index) => {
      item.classList.toggle('selected', index === selectedIndex);
    });
  }

  _isOneTimeActionRequest(message) {
    const lower = message.toLowerCase();
    
    // Keywords that indicate a one-time action request
    const actionVerbs = [
      'turn on', 'turn off', 'switch on', 'switch off', 
      'toggle', 'activate', 'deactivate', 'open', 'close',
      'lock', 'unlock', 'start', 'stop', 'set', 'adjust',
      'increase', 'decrease', 'dim', 'brighten', 'play', 'pause'
    ];
    
    // Time-based keywords that suggest temporary action
    const timeKeywords = [
      'for', 'in', 'after', 'minute', 'hour', 'second',
      'now', 'immediately', 'quickly', 'temporarily'
    ];
    
    // Check if message contains action verbs
    const hasActionVerb = actionVerbs.some(verb => lower.includes(verb));
    
    // Check if it's NOT about creating automation (which would be permanent)
    const notAutomation = !lower.includes('automation') && 
                         !lower.includes('when') && 
                         !lower.includes('every') &&
                         !lower.includes('always') &&
                         !lower.includes('create') &&
                         !lower.includes('make');
    
    // It's likely a one-time action if it has an action verb and isn't about automation
    return hasActionVerb && notAutomation;
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

  async _handleOneTimeAction(message) {
    try {
      this._showTypingIndicator();
      
      // Add confirmation message
      this._addChatMessage('assistant', `I understand you want to perform a one-time action: "${message}". Let me create a script to do this for you.`);
      
      // Detect relevant domains and entities
      const relevantDomains = this._detectRelevantDomains(message);
      const relevantEntities = this._getRelevantEntities(message, relevantDomains, 'script');
      
      // Generate a script for this action
      const scriptConfig = await this._generateFromChat(message, 'script', relevantEntities, true);
      
      if (scriptConfig && scriptConfig.success) {
        // Parse the script config to extract the script name
        const scriptYaml = scriptConfig.config;
        const scriptName = this._extractScriptName(scriptYaml);
        
        // Offer to execute immediately
        this._addChatMessage('assistant', `I've created a script that will ${message}. Would you like me to run it now?`);
        
        // Add action buttons
        const actionButtons = `
          <div class="action-buttons" style="margin-top: 10px;">
            <button class="execute-script-btn primary" data-script="${this._escapeHtml(scriptYaml)}" data-name="${scriptName}" style="margin-right: 10px;">
              ▶️ Execute Now
            </button>
            <button class="save-script-btn" data-script="${this._escapeHtml(scriptYaml)}" data-name="${scriptName}">
              💾 Save for Later
            </button>
          </div>
        `;
        
        this._addChatMessage('system', actionButtons);
        
        // Attach event listeners
        setTimeout(() => {
          this._attachScriptActionListeners();
        }, 100);
      }
      
    } catch (error) {
      this._addChatMessage('assistant', `Sorry, I couldn't create a script for that action: ${error.message}`);
    } finally {
      this._hideTypingIndicator();
    }
  }

  _extractScriptName(scriptYaml) {
    // Extract the alias from the script YAML
    const aliasMatch = scriptYaml.match(/alias:\s*['"]?([^'":\n]+)['"]?/);
    if (aliasMatch) {
      return aliasMatch[1].toLowerCase().replace(/\s+/g, '_');
    }
    return `script_${Date.now()}`;
  }

  _extractActionParameters(message) {
    // Extract parameters from the user's message for script execution
    const parameters = {};
    
    // Extract duration/time parameters
    const durationMatch = message.match(/(\d+)\s*(minute|min|hour|hr|second|sec)s?/i);
    if (durationMatch) {
      const value = parseInt(durationMatch[1]);
      const unit = durationMatch[2].toLowerCase();
      
      // Convert to seconds for Home Assistant
      let seconds = value;
      if (unit.startsWith('min')) {
        seconds = value * 60;
      } else if (unit.startsWith('hour') || unit === 'hr') {
        seconds = value * 3600;
      }
      
      parameters.duration = seconds;
    }
    
    // Extract brightness parameters
    const brightnessMatch = message.match(/(\d+)\s*%|brightness\s+(\d+)/i);
    if (brightnessMatch) {
      const brightness = parseInt(brightnessMatch[1] || brightnessMatch[2]);
      parameters.brightness = Math.round((brightness / 100) * 255);
    }
    
    // Extract temperature parameters
    const tempMatch = message.match(/(\d+)\s*(?:degrees?|°)/i);
    if (tempMatch) {
      parameters.temperature = parseInt(tempMatch[1]);
    }
    
    return parameters;
  }

  _attachScriptActionListeners() {
    const root = this.shadowRoot;
    
    // Execute script button
    root.querySelectorAll('.execute-script-btn').forEach(btn => {
      if (!btn.hasListener) {
        btn.hasListener = true;
        btn.addEventListener('click', async () => {
          const scriptYaml = btn.dataset.script;
          const scriptName = btn.dataset.name;
          await this._deployAndExecuteScript(scriptYaml, scriptName);
        });
      }
    });
    
    // Save script button
    root.querySelectorAll('.save-script-btn').forEach(btn => {
      if (!btn.hasListener) {
        btn.hasListener = true;
        btn.addEventListener('click', async () => {
          const scriptYaml = btn.dataset.script;
          const scriptName = btn.dataset.name;
          await this._deployScript(scriptYaml, scriptName);
        });
      }
    });
  }

  async _deployAndExecuteScript(scriptYaml, scriptName) {
    try {
      this._addChatMessage('system', '⏳ Deploying and executing script...');
      
      // First deploy the script
      const deployResult = await this._deployConfiguration(scriptYaml, 'script');
      
      if (deployResult && deployResult.success) {
        // Wait a moment for the script to be registered
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        // Extract script ID from deployment result
        const scriptId = deployResult.entity_id ? deployResult.entity_id.replace('script.', '') : 
                        (deployResult.id || scriptName);
        
        try {
          // Parse the original prompt to extract any parameters
          const parameters = this._extractActionParameters(this._conversationContext.originalPrompt || '');
          
          // Execute the script with parameters
          await this._hass.callService('script', scriptId, parameters);
          
          this._addChatMessage('assistant', `✅ Script executed successfully! The action has been performed.`);
          
          // Provide link to the script
          const scriptUrl = `/config/script/edit/${scriptId}`;
          this._addChatMessage('system', `📝 The script has been saved as "${scriptName}" and you can [edit it here](${scriptUrl}) or run it again anytime.`);
          
        } catch (execError) {
          console.error('Script execution error:', execError);
          const scriptUrl = `/config/script/edit/${scriptId}`;
          this._addChatMessage('system', `⚠️ Script was created but couldn't be executed immediately. You can run it manually from [here](${scriptUrl}).`);
        }
      } else {
        this._addChatMessage('system', `❌ Failed to deploy script: ${deployResult?.error || 'Unknown error'}`);
      }
      
    } catch (error) {
      this._addChatMessage('system', `❌ Error: ${error.message}`);
    }
  }

  async _deployScript(scriptYaml, scriptName) {
    try {
      this._addChatMessage('system', '💾 Saving script...');
      
      const deployResult = await this._deployConfiguration(scriptYaml, 'script');
      
      if (deployResult && deployResult.success) {
        // Extract script ID from deployment result
        const scriptId = deployResult.entity_id ? deployResult.entity_id.replace('script.', '') : 
                        (deployResult.id || scriptName);
        const scriptUrl = `/config/script/edit/${scriptId}`;
        
        this._addChatMessage('assistant', `✅ Script saved successfully! You can [edit it here](${scriptUrl}) or run it from the Scripts page.`);
      } else {
        this._addChatMessage('system', `❌ Failed to save script: ${deployResult?.error || 'Unknown error'}`);
      }
      
    } catch (error) {
      this._addChatMessage('system', `❌ Error saving script: ${error.message}`);
    }
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
    
    // Check for specific helper types first
    if (lower.includes('toggle') || lower.includes('switch') && (lower.includes('input') || lower.includes('helper'))) {
      return 'input_boolean';
    } else if (lower.includes('slider') || lower.includes('number') && (lower.includes('input') || lower.includes('helper'))) {
      return 'input_number';
    } else if (lower.includes('text') && (lower.includes('input') || lower.includes('helper'))) {
      return 'input_text';
    } else if (lower.includes('dropdown') || lower.includes('select') && (lower.includes('input') || lower.includes('helper'))) {
      return 'input_select';
    } else if (lower.includes('date') || lower.includes('time') && (lower.includes('input') || lower.includes('helper'))) {
      return 'input_datetime';
    } else if (lower.includes('button') && (lower.includes('input') || lower.includes('helper'))) {
      return 'input_button';
    } else if (lower.includes('helper')) {
      return 'helper'; // Generic helper, will be determined by the LLM
    }
    
    // Check for sensor types
    else if (lower.includes('sensor') || lower.includes('template') || 
             lower.includes('average') || lower.includes('calculate') || lower.includes('combine')) {
      return 'sensor';
    }
    
    // Standard config types
    else if (lower.includes('automation') || lower.includes('when') || lower.includes('trigger') || 
             lower.includes('alert') || lower.includes('notify') || lower.includes('if')) {
      return 'automation';
    } else if (lower.includes('scene')) {
      return 'scene';
    } else if (lower.includes('script') || lower.includes('sequence')) {
      return 'script';
    } else if (lower.includes('dashboard') || lower.includes('card') || lower.includes('lovelace')) {
      return 'lovelace';
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

  _getRelevantEntities(prompt, domains, configType) {
    if (!this._entities || this._entities.length === 0) return [];
    
    const lowerPrompt = prompt.toLowerCase();
    
    // Extract potential location/room keywords from the prompt
    const locationKeywords = this._extractLocationKeywords(lowerPrompt);
    console.log('Entity filtering:', { prompt: lowerPrompt, locationKeywords, domains, configType });
    
    // Start with domain-filtered entities
    let relevantEntities = this._entities.filter(entity => {
      const domain = entity.entity_id.split('.')[0];
      return domains.includes(domain);
    });
    
    console.log(`Initial domain filtering: ${relevantEntities.length} entities from domains: ${domains.join(', ')}`);
    
    // If no entities found with domain filtering and this is a dashboard, get ALL entities
    if (relevantEntities.length === 0 && (configType === 'dashboard' || configType === 'lovelace')) {
      console.log('No domain-specific entities found for dashboard, including all entities');
      relevantEntities = [...this._entities];
    }
    
    // For dashboards, we should provide ALL entities of the relevant domains
    // to ensure the LLM has access to all real entity IDs
    if (configType === 'dashboard' || configType === 'lovelace') {
      // For dashboards, include ALL entities from relevant domains
      // Don't filter by location unless explicitly specified
      if (locationKeywords.length > 0) {
        // If location is specified, add those as well but keep all domain entities
        const locationFiltered = this._entities.filter(entity => {
          const entityId = entity.entity_id.toLowerCase();
          const friendlyName = (entity.friendly_name || '').toLowerCase();
          
          return locationKeywords.some(keyword => 
            entityId.includes(keyword) || friendlyName.includes(keyword)
          );
        });
        
        // Combine domain filtered and location filtered entities
        const combinedSet = new Set([...relevantEntities, ...locationFiltered]);
        relevantEntities = Array.from(combinedSet);
        console.log(`Dashboard: Including ${relevantEntities.length} entities (domain + location filtered)`);
      } else {
        console.log(`Dashboard: Including all ${relevantEntities.length} entities from relevant domains`);
      }
      
      // For dashboards, increase the limit since we need more entities
      if (relevantEntities.length > 200) {
        console.warn(`Too many entities (${relevantEntities.length}), limiting to 200 for dashboard`);
        relevantEntities = relevantEntities.slice(0, 200);
      }
    } else {
      // For automations, scripts, etc., use more targeted filtering
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
      
      // Limit entities to prevent service overload (max 100 entities for non-dashboards)
      if (relevantEntities.length > 100) {
        console.warn(`Too many entities (${relevantEntities.length}), limiting to 100 most relevant`);
        relevantEntities = relevantEntities.slice(0, 100);
      }
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
          <div class="deploy-options">
            <select class="deploy-target">
              <option value="database">Deploy to Database</option>
              <option value="yaml">Export to YAML File</option>
            </select>
            <button class="deploy-config-btn primary" data-config="${this._escapeHtml(config)}" data-type="${configType}">🚀 Deploy</button>
          </div>
        </div>
      </div>
    `;
  }

  async _generateFromChat(prompt, configType, entities, returnResult = false) {
    let serviceCall = {};
    
    try {
      // Don't show typing indicator here - it's already shown in _handleChatSend or handler
      
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

      // Normalize config type for backend compatibility
      const normalizedConfigType = configType === 'lovelace' ? 'dashboard' : configType;
      
      serviceCall = {
        prompt: prompt,
        type: normalizedConfigType,
        entities: entities.map(e => (e.entity || e).entity_id)
      };

      console.log('Making service call with:', serviceCall);
      console.log('Config type:', configType, '-> normalized to:', normalizedConfigType);
      console.log('Number of entities being sent:', entities.length);
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
        // If we're returning the result (for one-time actions), just return it
        if (returnResult) {
          return result;
        }
        
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
          const configPreview = btn.closest('.config-preview-message');
          const config = configPreview.querySelector('pre').textContent;
          const configType = btn.dataset.type;
          const deployTarget = configPreview.querySelector('.deploy-target').value;
          
          if (deployTarget === 'yaml') {
            await this._exportToYaml(config, configType);
          } else {
            await this._deployConfiguration(config, configType);
          }
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

  // Agent selector methods
  _showAgentSelector() {
    const root = this.shadowRoot;
    
    // Create agent selector modal/dropdown
    let agentModal = root.getElementById('agent-selector-modal');
    if (!agentModal) {
      agentModal = document.createElement('div');
      agentModal.id = 'agent-selector-modal';
      agentModal.innerHTML = `
        <div class="agent-modal-backdrop">
          <div class="agent-modal-content">
            <h3>Select AI Agent</h3>
            <div class="agent-list">
              ${this._availableAgents.map(agent => `
                <div class="agent-option" data-agent-id="${agent.id}">
                  <span class="agent-option-icon">${agent.icon}</span>
                  <div class="agent-option-details">
                    <div class="agent-option-name">${agent.name}</div>
                    <div class="agent-option-description">${agent.description}</div>
                  </div>
                  ${this._currentAgent.id === agent.id ? '<span class="agent-selected-indicator">✓</span>' : ''}
                </div>
              `).join('')}
            </div>
            <button class="agent-modal-close">Cancel</button>
          </div>
        </div>
      `;
      
      // Add styles for the modal
      const style = document.createElement('style');
      style.textContent = `
        .agent-modal-backdrop {
          position: fixed;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          background: rgba(0, 0, 0, 0.5);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 10000;
        }
        
        .agent-modal-content {
          background: var(--card-background-color, #ffffff);
          border-radius: 12px;
          padding: 24px;
          max-width: 400px;
          width: 90%;
          box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
        }
        
        .agent-modal-content h3 {
          margin: 0 0 16px 0;
          color: var(--primary-text-color);
          font-size: 18px;
        }
        
        .agent-list {
          display: flex;
          flex-direction: column;
          gap: 12px;
          margin-bottom: 20px;
        }
        
        .agent-option {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 12px;
          border: 1px solid var(--divider-color);
          border-radius: 8px;
          cursor: pointer;
          transition: all 0.2s ease;
          position: relative;
        }
        
        .agent-option:hover {
          background: var(--secondary-background-color);
          border-color: var(--primary-color);
        }
        
        .agent-option-icon {
          font-size: 20px;
        }
        
        .agent-option-details {
          flex: 1;
        }
        
        .agent-option-name {
          font-weight: 500;
          color: var(--primary-text-color);
          margin-bottom: 4px;
        }
        
        .agent-option-description {
          font-size: 12px;
          color: var(--secondary-text-color);
        }
        
        .agent-selected-indicator {
          color: var(--primary-color);
          font-weight: bold;
        }
        
        .agent-modal-close {
          width: 100%;
          padding: 10px;
          background: var(--secondary-background-color);
          border: 1px solid var(--divider-color);
          border-radius: 6px;
          cursor: pointer;
          color: var(--primary-text-color);
        }
        
        .agent-modal-close:hover {
          background: var(--divider-color);
        }
      `;
      
      agentModal.appendChild(style);
      root.appendChild(agentModal);
      
      // Add event listeners
      agentModal.querySelectorAll('.agent-option').forEach(option => {
        option.addEventListener('click', () => {
          const agentId = option.dataset.agentId;
          this._selectAgent(agentId);
          this._hideAgentSelector();
        });
      });
      
      agentModal.querySelector('.agent-modal-close').addEventListener('click', () => {
        this._hideAgentSelector();
      });
      
      agentModal.querySelector('.agent-modal-backdrop').addEventListener('click', (e) => {
        if (e.target === e.currentTarget) {
          this._hideAgentSelector();
        }
      });
    } else {
      agentModal.style.display = 'block';
    }
  }

  _hideAgentSelector() {
    const root = this.shadowRoot;
    const agentModal = root.getElementById('agent-selector-modal');
    if (agentModal) {
      agentModal.remove();
    }
  }

  _selectAgent(agentId) {
    const agent = this._availableAgents.find(a => a.id === agentId);
    if (agent) {
      this._currentAgent = agent;
      this._updateAgentDisplay();
      
      // Add a system message about the agent change
      this._addChatMessage('system', `Switched to ${agent.name}. ${agent.description}`);
    }
  }

  _updateAgentDisplay() {
    const root = this.shadowRoot;
    const agentIcon = root.querySelector('.agent-icon');
    const agentName = root.querySelector('.agent-name');
    const agentNameSettings = root.getElementById('agent-name-settings');
    const agentIconSettings = root.querySelector('#agent-indicator-settings .agent-icon');
    
    if (agentIcon && agentName) {
      agentIcon.textContent = this._currentAgent.icon;
      agentName.textContent = this._currentAgent.name;
    }
    
    // Update settings tab display as well
    if (agentNameSettings && agentIconSettings) {
      agentNameSettings.textContent = this._currentAgent.name;
      agentIconSettings.textContent = this._currentAgent.icon;
    }
  }
  
  async _loadSettings() {
    const root = this.shadowRoot;
    
    // Load saved auto-label configuration
    const savedLabelId = localStorage.getItem('ai-config-auto-label') || '';
    this._selectedLabelId = savedLabelId;
    
    // Set up label picker
    await this._setupLabelPicker();
    
    // Load available labels
    await this._loadAvailableLabels();
  }
  
  _saveSettings() {
    // Save auto-label configuration
    localStorage.setItem('ai-config-auto-label', this._selectedLabelId || '');
    
    this._showMessage('Settings saved successfully!', 'success');
  }
  
  async _setupLabelPicker() {
    const root = this.shadowRoot;
    const labelButton = root.getElementById('label-picker-button');
    const labelDropdown = root.getElementById('label-dropdown');
    
    if (!labelButton || !labelDropdown) return;
    
    // Toggle dropdown on button click
    labelButton.addEventListener('click', (e) => {
      e.stopPropagation();
      labelDropdown.classList.toggle('open');
    });
    
    // Close dropdown when clicking outside
    document.addEventListener('click', () => {
      labelDropdown.classList.remove('open');
    });
    
    // Prevent dropdown from closing when clicking inside it
    labelDropdown.addEventListener('click', (e) => {
      e.stopPropagation();
    });
  }
  
  async _loadAvailableLabels() {
    if (!this._hass) return;
    
    try {
      // Fetch available labels from Home Assistant
      const labels = await this._hass.callWS({
        type: 'config/label_registry/list'
      });
      
      this._availableLabels = labels || [];
      this._updateLabelDropdown();
      this._updateSelectedLabelDisplay();
    } catch (error) {
      console.warn('Could not load labels:', error);
      this._availableLabels = [];
      this._updateLabelDropdown();
      this._updateSelectedLabelDisplay();
    }
  }
  
  _updateLabelDropdown() {
    const root = this.shadowRoot;
    const dropdown = root.getElementById('label-dropdown');
    const noLabelsMessage = root.getElementById('no-labels-message');
    
    if (!dropdown) return;
    
    // Clear existing content
    dropdown.innerHTML = '';
    
    if (this._availableLabels.length === 0) {
      const noLabelsDiv = document.createElement('div');
      noLabelsDiv.className = 'no-labels-message';
      noLabelsDiv.textContent = 'No labels found. Create one in Home Assistant first.';
      dropdown.appendChild(noLabelsDiv);
      
      const createOption = document.createElement('div');
      createOption.className = 'label-option create-label-option';
      createOption.innerHTML = `
        <span class="label-icon">➕</span>
        <span>Manage Labels in Home Assistant</span>
      `;
      createOption.addEventListener('click', () => this._openLabelManagement());
      dropdown.appendChild(createOption);
      return;
    }
    
    // Add "No label" option
    const noLabelOption = document.createElement('div');
    noLabelOption.className = 'label-option';
    if (!this._selectedLabelId) {
      noLabelOption.classList.add('selected');
    }
    noLabelOption.innerHTML = `
      <span class="label-icon" style="background-color: #888;">🏷️</span>
      <span>No label</span>
    `;
    noLabelOption.addEventListener('click', () => this._selectLabel(null));
    dropdown.appendChild(noLabelOption);
    
    // Add existing labels
    this._availableLabels.forEach(label => {
      const option = document.createElement('div');
      option.className = 'label-option';
      if (this._selectedLabelId === label.label_id) {
        option.classList.add('selected');
      }
      
      const labelColor = label.color || '#888888';
      const labelIcon = label.icon || '🏷️';
      
      option.innerHTML = `
        <span class="label-icon" style="background-color: ${labelColor};">${labelIcon}</span>
        <span>${label.name}</span>
      `;
      
      option.addEventListener('click', () => this._selectLabel(label.label_id, label.name, labelIcon, labelColor));
      dropdown.appendChild(option);
    });
    
    // Add "Create new label" option
    const createOption = document.createElement('div');
    createOption.className = 'label-option create-label-option';
    createOption.innerHTML = `
      <span class="label-icon">➕</span>
      <span>Manage Labels in Home Assistant</span>
    `;
    createOption.addEventListener('click', () => this._openLabelManagement());
    dropdown.appendChild(createOption);
  }
  
  _selectLabel(labelId, labelName = null, labelIcon = null, labelColor = null) {
    const root = this.shadowRoot;
    const dropdown = root.getElementById('label-dropdown');
    
    this._selectedLabelId = labelId;
    
    // Update visual selection in dropdown
    dropdown.querySelectorAll('.label-option').forEach(option => {
      option.classList.remove('selected');
    });
    
    if (labelId) {
      const selectedOption = Array.from(dropdown.querySelectorAll('.label-option'))
        .find(option => option.querySelector('span:last-child')?.textContent === labelName);
      if (selectedOption) {
        selectedOption.classList.add('selected');
      }
    } else {
      // Select "No label" option
      dropdown.querySelector('.label-option:first-child')?.classList.add('selected');
    }
    
    this._updateSelectedLabelDisplay();
    dropdown.classList.remove('open');
  }
  
  _updateSelectedLabelDisplay() {
    const root = this.shadowRoot;
    const labelIcon = root.getElementById('selected-label-icon');
    const labelName = root.getElementById('selected-label-name');
    
    if (!labelIcon || !labelName) return;
    
    if (!this._selectedLabelId) {
      labelIcon.textContent = '🏷️';
      labelIcon.style.backgroundColor = '#888';
      labelName.textContent = 'No label selected';
      return;
    }
    
    // Find the selected label in available labels
    const selectedLabel = this._availableLabels.find(label => label.label_id === this._selectedLabelId);
    if (selectedLabel) {
      labelIcon.textContent = selectedLabel.icon || '🏷️';
      labelIcon.style.backgroundColor = selectedLabel.color || '#888888';
      labelName.textContent = selectedLabel.name;
    } else {
      // Fallback if label not found (maybe it was deleted)
      labelIcon.textContent = '🏷️';
      labelIcon.style.backgroundColor = '#888';
      labelName.textContent = 'Label not found';
    }
  }
  
  _openLabelManagement() {
    // Open Home Assistant's label management page
    const labelUrl = '/config/labels';
    
    // Try to navigate using Home Assistant's navigation
    if (this._hass && this._hass.navigate) {
      this._hass.navigate(labelUrl);
    } else {
      // Fallback: open in new tab
      window.open(labelUrl, '_blank');
    }
  }

  _escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  _renderMarkdownLinks(text) {
    // Escape HTML first, then convert markdown links to HTML
    let escaped = this._escapeHtml(text);
    
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

  async _exportToYaml(config, configType) {
    try {
      this._addChatMessage('system', `Exporting ${configType} to YAML file...`);
      
      // Determine the appropriate file and location based on config type
      const yamlFileInfo = this._getYamlFileInfo(configType);
      
      // Create a downloadable YAML file
      const blob = new Blob([config], { type: 'text/yaml' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      
      // Generate filename with timestamp
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
      a.download = `${configType}_${timestamp}.yaml`;
      
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
      
      // Provide instructions for where to place the file
      let instructions = `✅ YAML file downloaded successfully!\n\n`;
      instructions += `📁 **File saved as:** ${a.download}\n\n`;
      instructions += `📝 **Instructions for adding to Home Assistant:**\n\n`;
      
      if (configType === 'automation') {
        instructions += `1. Place the file in your Home Assistant config directory\n`;
        instructions += `2. Add to your \`configuration.yaml\`:\n\`\`\`yaml\nautomation: !include automations.yaml\n\`\`\`\n`;
        instructions += `3. Or if using split configuration:\n\`\`\`yaml\nautomation: !include_dir_merge_list automations/\n\`\`\`\n`;
        instructions += `4. Reload automations or restart Home Assistant\n`;
      } else if (configType === 'script') {
        instructions += `1. Place the file in your Home Assistant config directory\n`;
        instructions += `2. Add to your \`configuration.yaml\`:\n\`\`\`yaml\nscript: !include scripts.yaml\n\`\`\`\n`;
        instructions += `3. Or if using split configuration:\n\`\`\`yaml\nscript: !include_dir_merge_named scripts/\n\`\`\`\n`;
        instructions += `4. Reload scripts or restart Home Assistant\n`;
      } else if (configType === 'scene') {
        instructions += `1. Place the file in your Home Assistant config directory\n`;
        instructions += `2. Add to your \`configuration.yaml\`:\n\`\`\`yaml\nscene: !include scenes.yaml\n\`\`\`\n`;
        instructions += `3. Or if using split configuration:\n\`\`\`yaml\nscene: !include_dir_merge_list scenes/\n\`\`\`\n`;
        instructions += `4. Reload scenes or restart Home Assistant\n`;
      } else if (configType === 'dashboard' || configType === 'lovelace') {
        instructions += `1. Go to your Dashboard configuration\n`;
        instructions += `2. Click the three dots menu → Edit Dashboard\n`;
        instructions += `3. Click the three dots menu → Raw configuration editor\n`;
        instructions += `4. Add the content from the downloaded file\n`;
        instructions += `5. Save the configuration\n`;
      } else if (configType === 'sensor' || configType === 'binary_sensor' || configType === 'template') {
        instructions += `1. Add the content to your \`configuration.yaml\`\n`;
        instructions += `2. Or create a separate file and include it:\n\`\`\`yaml\ntemplate: !include templates.yaml\n\`\`\`\n`;
        instructions += `3. Check configuration: Developer Tools → YAML → Check Configuration\n`;
        instructions += `4. Restart Home Assistant to apply changes (Settings → System → Restart)\n`;
      } else if (configType.includes('input_')) {
        instructions += `1. Add the content to your \`configuration.yaml\`\n`;
        instructions += `2. Or create a separate file and include it:\n\`\`\`yaml\n${configType}: !include ${configType}.yaml\n\`\`\`\n`;
        instructions += `3. Check configuration: Developer Tools → YAML → Check Configuration\n`;
        instructions += `4. Restart Home Assistant to apply changes\n`;
      } else {
        instructions += `1. Add the content to your \`configuration.yaml\`\n`;
        instructions += `2. Check configuration: Developer Tools → YAML → Check Configuration\n`;
        instructions += `3. Reload or restart Home Assistant as needed\n`;
      }
      
      instructions += `\n💡 **Tip:** You can also copy the configuration from above and paste it directly into your YAML files.`;
      
      this._addChatMessage('assistant', instructions);
      
    } catch (error) {
      this._addChatMessage('system', `❌ Error exporting to YAML: ${error.message}`);
    }
  }

  _getYamlFileInfo(configType) {
    const fileMap = {
      'automation': 'automations.yaml',
      'script': 'scripts.yaml',
      'scene': 'scenes.yaml',
      'dashboard': 'ui-lovelace.yaml',
      'lovelace': 'ui-lovelace.yaml',
      'sensor': 'configuration.yaml',
      'binary_sensor': 'configuration.yaml',
      'template': 'configuration.yaml',
      'input_boolean': 'configuration.yaml',
      'input_number': 'configuration.yaml',
      'input_text': 'configuration.yaml',
      'input_select': 'configuration.yaml',
      'input_datetime': 'configuration.yaml',
      'helper': 'configuration.yaml'
    };
    
    return fileMap[configType] || 'configuration.yaml';
  }

  async _deployConfiguration(config, configType) {
    try {
      this._addChatMessage('system', `Deploying ${configType}...`);
      
      // Call the deploy service
      let result = await this._hass.callWS({
        type: 'call_service',
        domain: 'ai_config_assistant',
        service: 'deploy_config',
        service_data: {
          config: config,
          type: configType
        },
        return_response: true
      });
      
      // Handle the new response structure where data is wrapped in "response"
      if (result && result.response) {
        result = result.response;
      }
      
      if (result && result.success) {
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
        } else if (['sensor', 'binary_sensor', 'template'].includes(configType) && result.entity_id) {
          // Template sensor deployed
          this._addChatMessage('system', '⚠️ Template sensor saved to file');
          
          let instructions = `Your template sensor configuration has been saved to \`template_sensors.yaml\`\n\n`;
          instructions += `🌡️ **Entity ID (when activated):** ${result.entity_id}\n\n`;
          instructions += `⚠️ **IMPORTANT - Manual Setup Required:**\n\n`;
          instructions += `The sensor has been written to \`template_sensors.yaml\` in your config directory, but it won't be active until you:\n\n`;
          instructions += `**Step 1: Add to configuration.yaml**\n`;
          instructions += `Add this line to your \`configuration.yaml\` file:\n`;
          instructions += `\`\`\`yaml\ntemplate: !include template_sensors.yaml\n\`\`\`\n\n`;
          instructions += `**Step 2: Check Configuration**\n`;
          instructions += `1. Go to [Developer Tools → YAML](/developer-tools/yaml)\n`;
          instructions += `2. Click **"Check Configuration"**\n`;
          instructions += `3. Fix any errors if shown\n\n`;
          instructions += `**Step 3: Restart Home Assistant**\n`;
          instructions += `1. Go to [Settings → System](/config/system)\n`;
          instructions += `2. Click **"Restart"** under "Home Assistant Core"\n`;
          instructions += `3. Click **"Restart Home Assistant"**\n\n`;
          instructions += `After completing these steps, your sensor will be available at: **${result.entity_id}**\n\n`;
          instructions += `💡 **Recommendation:** For template sensors, using "Export to YAML File" might be easier as you can add the configuration directly to your existing files.`;
          
          this._addChatMessage('assistant', instructions);
        } else if (configType.includes('input_') || configType === 'helper') {
          // Helper deployed
          if (result.success) {
            this._addChatMessage('system', successMessage);
            
            let helperMessage = `Your helper has been created!\n\n🎛️ **Entity ID:** ${result.entity_id}\n`;
            helperMessage += `**Type:** ${result.type}\n\n`;
            helperMessage += `You can now use this helper in your automations and scripts.\n\n`;
            helperMessage += `To view or edit: Go to [Settings → Devices & Services → Helpers](/config/helpers)`;
            
            this._addChatMessage('assistant', helperMessage);
          } else if (result.manual_config) {
            // Helper needs manual configuration
            this._addChatMessage('system', '⚠️ Helper creation requires manual configuration');
            
            let manualMessage = `To create this helper, you need to add the following to your configuration.yaml:\n\n`;
            manualMessage += '```yaml\n' + result.manual_config + '\n```\n\n';
            manualMessage += `After adding this configuration:\n`;
            manualMessage += `1. Save the file\n`;
            manualMessage += `2. Go to [Developer Tools → YAML](/developer-tools/yaml)\n`;
            manualMessage += `3. Click **"Check Configuration"**\n`;
            manualMessage += `4. If valid, click **"Restart"** to apply changes`;
            
            this._addChatMessage('assistant', manualMessage);
          }
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

  // Conversation Management Methods
  async _loadConversationHistory() {
    try {
      // Try to load from server first
      const response = await this.hass.connection.sendMessagePromise({
        type: 'ai_config_assistant/load_conversations'
      });
      
      if (response && response.conversations) {
        // Check if we have local conversations to migrate
        const localStored = localStorage.getItem('ai-config-conversations');
        if (localStored) {
          const localConversations = JSON.parse(localStored);
          if (localConversations && localConversations.length > 0) {
            // Migrate local conversations to server
            await this._migrateLocalConversations(localConversations);
            // Clear local storage after successful migration
            localStorage.removeItem('ai-config-conversations');
          }
        }
        
        return response.conversations || [];
      }
      
      // Fallback to localStorage if server storage fails
      const stored = localStorage.getItem('ai-config-conversations');
      return stored ? JSON.parse(stored) : [];
    } catch (error) {
      console.error('Failed to load conversation history:', error);
      // Fallback to localStorage
      try {
        const stored = localStorage.getItem('ai-config-conversations');
        return stored ? JSON.parse(stored) : [];
      } catch (localError) {
        console.error('Failed to load from localStorage:', localError);
        return [];
      }
    }
  }

  async _migrateLocalConversations(localConversations) {
    try {
      const response = await this.hass.connection.sendMessagePromise({
        type: 'ai_config_assistant/migrate_conversations',
        conversations: localConversations
      });
      
      if (response && response.conversations) {
        this._conversationHistory = response.conversations;
        console.log(`Successfully migrated ${localConversations.length} conversations to server storage`);
      }
    } catch (error) {
      console.error('Failed to migrate conversations:', error);
    }
  }

  async _saveConversationHistory() {
    // Don't save during initial load or when loading from history
    if (this._isLoadingFromHistory || !this._currentConversationId) {
      return;
    }
    
    // Find the current conversation in the history
    const currentConv = this._conversationHistory.find(c => c.id === this._currentConversationId);
    if (!currentConv) {
      return;
    }
    
    try {
      // Save to server
      await this.hass.connection.sendMessagePromise({
        type: 'ai_config_assistant/save_conversation',
        conversation: currentConv
      });
    } catch (error) {
      console.error('Failed to save conversation to server:', error);
      // Fallback to localStorage if server save fails
      try {
        localStorage.setItem('ai-config-conversations', JSON.stringify(this._conversationHistory));
      } catch (localError) {
        console.error('Failed to save to localStorage:', localError);
      }
    }
  }

  _generateConversationId() {
    return 'conv_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
  }

  _saveCurrentConversation() {
    if (this._conversationMessages.length === 0) {
      return;
    }

    const conversationId = this._currentConversationId || this._generateConversationId();
    
    // Get first user message as title
    const firstUserMessage = this._conversationMessages.find(msg => msg.type === 'user');
    const title = firstUserMessage ? 
      firstUserMessage.content.substring(0, 50) + (firstUserMessage.content.length > 50 ? '...' : '') :
      'New Conversation';

    // Get preview from last message
    const lastMessage = this._conversationMessages[this._conversationMessages.length - 1];
    const preview = lastMessage ? 
      (lastMessage.content || '').substring(0, 80) + ((lastMessage.content || '').length > 80 ? '...' : '') :
      'Empty conversation';

    const conversationData = {
      id: conversationId,
      title: title,
      preview: preview,
      messages: [...this._conversationMessages],
      context: {...this._conversationContext},
      lastUpdated: Date.now(),
      created: this._currentConversationId ? 
        (this._conversationHistory.find(c => c.id === conversationId)?.created || Date.now()) :
        Date.now()
    };

    // Update or add conversation
    const existingIndex = this._conversationHistory.findIndex(c => c.id === conversationId);
    if (existingIndex >= 0) {
      this._conversationHistory[existingIndex] = conversationData;
    } else {
      this._conversationHistory.unshift(conversationData);
    }

    // Keep only last 50 conversations
    if (this._conversationHistory.length > 50) {
      this._conversationHistory = this._conversationHistory.slice(0, 50);
    }

    this._currentConversationId = conversationId;
    this._saveConversationHistory();
    this._renderConversationList();
  }

  _startNewConversation() {
    // Save current conversation if it has messages
    this._saveCurrentConversation();
    
    // Clear current conversation
    this._conversationMessages = [];
    this._conversationContext = {};
    this._currentConversationId = null;
    
    // Clear chat interface
    const messagesContainer = this.shadowRoot.getElementById('chat-messages');
    messagesContainer.innerHTML = '';
    
    // Clear input
    const chatInput = this.shadowRoot.getElementById('chat-input');
    chatInput.value = '';
    
    // Update conversation list
    this._renderConversationList();
  }

  _loadConversation(conversationId) {
    const conversation = this._conversationHistory.find(c => c.id === conversationId);
    if (!conversation) {
      return;
    }

    // Save current conversation if it has changes
    if (this._conversationMessages.length > 0) {
      this._saveCurrentConversation();
    }

    // Load the selected conversation
    this._conversationMessages = [...conversation.messages];
    this._conversationContext = {...conversation.context};
    this._currentConversationId = conversationId;

    // Clear and repopulate chat interface
    const messagesContainer = this.shadowRoot.getElementById('chat-messages');
    messagesContainer.innerHTML = '';

    // Re-render all messages (set flag to prevent saving duplicates)
    this._isLoadingFromHistory = true;
    this._conversationMessages.forEach(message => {
      this._addChatMessage(message.type, message.content, message.extras);
    });
    this._isLoadingFromHistory = false;

    // Update conversation list to show active conversation
    this._renderConversationList();

    // Scroll to bottom
    setTimeout(() => {
      messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }, 100);
  }

  async _deleteConversation(conversationId) {
    try {
      // Delete from server
      await this.hass.connection.sendMessagePromise({
        type: 'ai_config_assistant/delete_conversation',
        conversation_id: conversationId
      });
      
      // Remove from local cache
      this._conversationHistory = this._conversationHistory.filter(c => c.id !== conversationId);
      this._renderConversationList();

      // If deleting the current conversation, start a new one
      if (this._currentConversationId === conversationId) {
        this._startNewConversation();
      }
    } catch (error) {
      console.error('Failed to delete conversation:', error);
      // Still remove from local cache even if server delete fails
      this._conversationHistory = this._conversationHistory.filter(c => c.id !== conversationId);
      this._renderConversationList();
      
      if (this._currentConversationId === conversationId) {
        this._startNewConversation();
      }
    }
  }

  _renderConversationList() {
    const listContainer = this.shadowRoot.getElementById('conversations-list');
    
    if (this._conversationHistory.length === 0) {
      listContainer.innerHTML = `
        <div style="text-align: center; color: var(--secondary-text-color); margin-top: 24px;">
          <p>No conversations yet</p>
          <p style="font-size: 12px;">Start a new conversation to see it here</p>
        </div>
      `;
      return;
    }

    listContainer.innerHTML = this._conversationHistory.map(conversation => {
      const date = new Date(conversation.lastUpdated);
      const dateStr = date.toLocaleDateString();
      const isActive = conversation.id === this._currentConversationId;

      return `
        <div class="conversation-item ${isActive ? 'active' : ''}" data-conversation-id="${conversation.id}">
          <div class="conversation-title">${this._escapeHtml(conversation.title)}</div>
          <div class="conversation-preview">${this._escapeHtml(conversation.preview)}</div>
          <div style="display: flex; justify-content: space-between; align-items: center;">
            <div class="conversation-date">${dateStr}</div>
            <div class="conversation-actions">
              <button class="conversation-action-btn delete-conversation" data-conversation-id="${conversation.id}" title="Delete">
                🗑️
              </button>
            </div>
          </div>
        </div>
      `;
    }).join('');

    // Attach event listeners
    this._attachConversationListeners();
  }

  _attachConversationListeners() {
    const root = this.shadowRoot;
    
    // Conversation item click
    root.querySelectorAll('.conversation-item').forEach(item => {
      if (!item.hasClickListener) {
        item.hasClickListener = true;
        item.addEventListener('click', (e) => {
          // Don't load conversation if clicking on action buttons
          if (e.target.classList.contains('conversation-action-btn')) {
            return;
          }
          const conversationId = item.dataset.conversationId;
          this._loadConversation(conversationId);
        });
      }
    });

    // Delete conversation buttons
    root.querySelectorAll('.delete-conversation').forEach(btn => {
      if (!btn.hasClickListener) {
        btn.hasClickListener = true;
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const conversationId = btn.dataset.conversationId;
          if (confirm('Are you sure you want to delete this conversation?')) {
            this._deleteConversation(conversationId);
          }
        });
      }
    });

    // Toggle sidebar buttons
    const toggleBtn = root.getElementById('conversations-toggle');
    const closeBtn = root.getElementById('conversations-close');
    const newConvBtn = root.getElementById('new-conversation-btn');

    if (toggleBtn && !toggleBtn.hasClickListener) {
      toggleBtn.hasClickListener = true;
      toggleBtn.addEventListener('click', () => {
        this._toggleConversationSidebar();
      });
    }

    if (closeBtn && !closeBtn.hasClickListener) {
      closeBtn.hasClickListener = true;
      closeBtn.addEventListener('click', () => {
        this._toggleConversationSidebar();
      });
    }

    if (newConvBtn && !newConvBtn.hasClickListener) {
      newConvBtn.hasClickListener = true;
      newConvBtn.addEventListener('click', () => {
        this._startNewConversation();
      });
    }
  }

  _toggleConversationSidebar() {
    const sidebar = this.shadowRoot.getElementById('conversations-sidebar');
    const isCollapsed = sidebar.classList.contains('collapsed');
    
    if (isCollapsed) {
      sidebar.classList.remove('collapsed');
      this._conversationSidebarOpen = true;
      // Load conversations when opening sidebar
      this._renderConversationList();
    } else {
      sidebar.classList.add('collapsed');
      this._conversationSidebarOpen = false;
    }
  }
  });
}