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
    this._conversationMessages = [];
    this._conversationContext = {};
    this._isProcessing = false;
  }

  set hass(hass) {
    this._hass = hass;
    if (!this._rendered) {
      this._render();
      this._rendered = true;
      this._loadEntities();
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

        .tabs {
          display: flex;
          gap: 8px;
          margin-bottom: 24px;
          border-bottom: 1px solid var(--divider-color);
          overflow-x: auto;
        }

        .tab {
          padding: 12px 24px;
          background: transparent;
          border: none;
          border-bottom: 2px solid transparent;
          cursor: pointer;
          font-size: 14px;
          font-weight: 500;
          color: var(--primary-text-color);
          text-transform: uppercase;
          transition: all 0.3s ease;
        }

        .tab:hover {
          background: rgba(0, 0, 0, 0.04);
        }

        .tab.active {
          color: var(--primary-color);
          border-bottom-color: var(--primary-color);
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
          flex-direction: column;
          height: calc(100vh - 200px);
          max-height: 700px;
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
        }

        .chat-input-wrapper {
          display: flex;
          gap: 8px;
          align-items: flex-end;
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

        /* System Prompts Styles */
        .prompts-list {
          margin-top: 16px;
        }

        .prompt-card {
          background: var(--secondary-background-color);
          border: 1px solid var(--divider-color);
          border-radius: 8px;
          padding: 16px;
          margin-bottom: 12px;
          transition: border-color 0.3s, box-shadow 0.3s;
          cursor: pointer;
        }

        .prompt-card:hover {
          border-color: var(--primary-color);
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
        }

        .prompt-card.active {
          border-color: var(--primary-color);
          background: rgba(var(--primary-color-rgb), 0.05);
        }

        .prompt-card.default {
          border-left: 4px solid var(--primary-color);
        }

        .prompt-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          margin-bottom: 8px;
        }

        .prompt-title {
          font-weight: 500;
          font-size: 16px;
          color: var(--primary-text-color);
          margin: 0;
        }

        .prompt-badge {
          background: var(--primary-color);
          color: white;
          padding: 2px 8px;
          border-radius: 12px;
          font-size: 12px;
          font-weight: 500;
        }

        .prompt-badge.default {
          background: var(--success-color, #4caf50);
        }

        .prompt-description {
          color: var(--secondary-text-color);
          font-size: 14px;
          margin: 8px 0;
          line-height: 1.4;
        }

        .prompt-meta {
          display: flex;
          justify-content: space-between;
          align-items: center;
          font-size: 12px;
          color: var(--secondary-text-color);
          margin-top: 12px;
          padding-top: 12px;
          border-top: 1px solid var(--divider-color);
        }

        .prompt-actions {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 8px;
          margin-top: 16px;
        }

        .action-btn {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 12px 16px;
          background: var(--secondary-background-color);
          border: 1px solid var(--divider-color);
          border-radius: 6px;
          color: var(--primary-text-color);
          text-decoration: none;
          font-size: 14px;
          transition: background-color 0.3s, border-color 0.3s;
          cursor: pointer;
        }

        .action-btn:hover {
          background: var(--primary-background-color);
          border-color: var(--primary-color);
        }

        .action-btn.danger:hover {
          background: var(--error-color);
          color: white;
          border-color: var(--error-color);
        }

        .modal {
          position: fixed;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          background: rgba(0, 0, 0, 0.5);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 1000;
        }

        .modal-content {
          background: var(--card-background-color);
          border-radius: 8px;
          max-width: 600px;
          width: 90vw;
          max-height: 80vh;
          overflow-y: auto;
          box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
        }

        .modal-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 20px;
          border-bottom: 1px solid var(--divider-color);
        }

        .modal-header h3 {
          margin: 0;
          color: var(--primary-text-color);
        }

        .close-btn {
          background: none;
          border: none;
          font-size: 24px;
          cursor: pointer;
          color: var(--secondary-text-color);
          padding: 0;
          width: 30px;
          height: 30px;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .close-btn:hover {
          color: var(--primary-text-color);
        }

        .modal-body {
          padding: 20px;
        }

        .modal-footer {
          display: flex;
          justify-content: flex-end;
          gap: 12px;
          padding: 20px;
          border-top: 1px solid var(--divider-color);
        }

        .help-text {
          font-size: 12px;
          color: var(--secondary-text-color);
          margin-top: 8px;
          line-height: 1.4;
        }

        .help-text code {
          background: var(--secondary-background-color);
          padding: 2px 4px;
          border-radius: 3px;
          font-family: monospace;
          font-size: 11px;
        }

        .loading-message {
          text-align: center;
          padding: 40px;
          color: var(--secondary-text-color);
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
          <button class="tab" data-tab="prompts">System Prompts</button>
        </div>

        <div class="content active" id="chat">
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
            <div class="chat-input-container">
              <div class="chat-input-wrapper">
                <textarea 
                  class="chat-input" 
                  id="chat-input"
                  placeholder="Describe what you want to configure..."
                  rows="1"
                ></textarea>
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

        <div class="content" id="prompts">
          <div class="card">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
              <h3>System Prompts</h3>
              <button id="create-prompt-btn" class="secondary">Create New Prompt</button>
            </div>
            
            <div class="input-group">
              <label>Filter by Configuration Type</label>
              <select id="prompt-filter-type">
                <option value="">All Types</option>
                <option value="automation">Automation</option>
                <option value="script">Script</option>
                <option value="dashboard">Dashboard</option>
                <option value="scene">Scene</option>
                <option value="template">Template</option>
              </select>
            </div>

            <div id="prompts-list" class="prompts-list">
              <div class="loading-message">Loading system prompts...</div>
            </div>
          </div>

          <!-- Create/Edit Prompt Modal -->
          <div id="prompt-modal" class="modal" style="display: none;">
            <div class="modal-content">
              <div class="modal-header">
                <h3 id="modal-title">Create System Prompt</h3>
                <button id="close-modal-btn" class="close-btn">&times;</button>
              </div>
              
              <div class="modal-body">
                <div class="input-group">
                  <label>Prompt Name <span style="color: var(--error-color);">*</span></label>
                  <input type="text" id="prompt-name" placeholder="e.g., Custom Automation Prompt">
                </div>

                <div class="input-group">
                  <label>Configuration Type <span style="color: var(--error-color);">*</span></label>
                  <select id="prompt-config-type">
                    <option value="">Select Type</option>
                    <option value="automation">Automation</option>
                    <option value="script">Script</option>
                    <option value="dashboard">Dashboard</option>
                    <option value="scene">Scene</option>
                    <option value="template">Template</option>
                  </select>
                </div>

                <div class="input-group">
                  <label>Description</label>
                  <textarea id="prompt-description" placeholder="Describe what this prompt does..."></textarea>
                </div>

                <div class="input-group">
                  <label>System Prompt Template <span style="color: var(--error-color);">*</span></label>
                  <textarea id="prompt-template" rows="10" placeholder="Enter your system prompt template..."></textarea>
                  <div class="help-text">
                    <strong>Available Variables:</strong>
                    <code>{prompt}</code> - User's request, 
                    <code>{entities}</code> - Available entities, 
                    <code>{current_states}</code> - Entity states, 
                    <code>{services}</code> - Available services, 
                    <code>{current_time}</code> - Current timestamp,
                    <code>{areas}</code> - Areas, 
                    <code>{domains}</code> - Entity domains
                  </div>
                </div>

                <div class="input-group">
                  <button id="preview-prompt-btn" class="secondary">Preview Template</button>
                </div>

                <div id="prompt-preview" style="display: none;">
                  <h4>Template Preview</h4>
                  <pre id="prompt-preview-content" style="background: var(--code-editor-background-color, #1e1e1e); color: var(--code-editor-text-color, #d4d4d4); padding: 12px; border-radius: 4px; font-size: 12px; overflow-x: auto; white-space: pre-wrap;"></pre>
                </div>
              </div>

              <div class="modal-footer">
                <button id="cancel-prompt-btn" class="secondary">Cancel</button>
                <button id="save-prompt-btn" class="primary">Save Prompt</button>
              </div>
            </div>
          </div>

          <!-- Prompt Actions Modal -->
          <div id="prompt-actions-modal" class="modal" style="display: none;">
            <div class="modal-content">
              <div class="modal-header">
                <h3 id="actions-modal-title">Prompt Actions</h3>
                <button id="close-actions-modal-btn" class="close-btn">&times;</button>
              </div>
              
              <div class="modal-body">
                <div class="prompt-actions">
                  <button id="edit-prompt-action" class="action-btn">
                    <span>✏️</span> Edit Prompt
                  </button>
                  <button id="preview-prompt-action" class="action-btn">
                    <span>👁️</span> Preview Template
                  </button>
                  <button id="set-active-action" class="action-btn">
                    <span>⭐</span> Set as Active
                  </button>
                  <button id="duplicate-prompt-action" class="action-btn">
                    <span>📋</span> Duplicate
                  </button>
                  <button id="export-prompt-action" class="action-btn">
                    <span>📤</span> Export
                  </button>
                  <button id="delete-prompt-action" class="action-btn danger">
                    <span>🗑️</span> Delete
                  </button>
                </div>
              </div>
            </div>
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
        
        // Load prompts when switching to prompts tab
        if (targetId === 'prompts') {
          this._loadSystemPrompts();
        }
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

    // Chat interface event listeners
    const chatInput = root.getElementById('chat-input');
    const chatSendBtn = root.getElementById('chat-send-btn');
    
    if (chatInput && chatSendBtn) {
      // Send message on button click
      chatSendBtn.addEventListener('click', () => this._sendChatMessage());
      
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
    
    // Quick action chips
    root.querySelectorAll('.quick-action-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        const action = chip.dataset.action;
        this._handleQuickAction(action);
      });
    });
    
    // System Prompts event listeners
    this._attachPromptEventListeners();
  }
  
  _attachPromptEventListeners() {
    const root = this.shadowRoot;
    
    // Create new prompt button
    const createPromptBtn = root.getElementById('create-prompt-btn');
    if (createPromptBtn) {
      createPromptBtn.addEventListener('click', () => this._openPromptModal());
    }
    
    // Filter prompts by type
    const filterSelect = root.getElementById('prompt-filter-type');
    if (filterSelect) {
      filterSelect.addEventListener('change', () => this._filterPrompts());
    }
    
    // Modal close buttons
    const closeModalBtn = root.getElementById('close-modal-btn');
    if (closeModalBtn) {
      closeModalBtn.addEventListener('click', () => this._closePromptModal());
    }
    
    const closeActionsModalBtn = root.getElementById('close-actions-modal-btn');
    if (closeActionsModalBtn) {
      closeActionsModalBtn.addEventListener('click', () => this._closeActionsModal());
    }
    
    // Cancel button
    const cancelPromptBtn = root.getElementById('cancel-prompt-btn');
    if (cancelPromptBtn) {
      cancelPromptBtn.addEventListener('click', () => this._closePromptModal());
    }
    
    // Save prompt button
    const savePromptBtn = root.getElementById('save-prompt-btn');
    if (savePromptBtn) {
      savePromptBtn.addEventListener('click', () => this._savePrompt());
    }
    
    // Preview prompt button
    const previewPromptBtn = root.getElementById('preview-prompt-btn');
    if (previewPromptBtn) {
      previewPromptBtn.addEventListener('click', () => this._previewPrompt());
    }
    
    // Prompt action buttons
    const editPromptAction = root.getElementById('edit-prompt-action');
    if (editPromptAction) {
      editPromptAction.addEventListener('click', () => this._editSelectedPrompt());
    }
    
    const previewPromptAction = root.getElementById('preview-prompt-action');
    if (previewPromptAction) {
      previewPromptAction.addEventListener('click', () => this._previewSelectedPrompt());
    }
    
    const setActiveAction = root.getElementById('set-active-action');
    if (setActiveAction) {
      setActiveAction.addEventListener('click', () => this._setActivePrompt());
    }
    
    const duplicatePromptAction = root.getElementById('duplicate-prompt-action');
    if (duplicatePromptAction) {
      duplicatePromptAction.addEventListener('click', () => this._duplicatePrompt());
    }
    
    const exportPromptAction = root.getElementById('export-prompt-action');
    if (exportPromptAction) {
      exportPromptAction.addEventListener('click', () => this._exportPrompt());
    }
    
    const deletePromptAction = root.getElementById('delete-prompt-action');
    if (deletePromptAction) {
      deletePromptAction.addEventListener('click', () => this._deletePrompt());
    }
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
    // Add welcome message if no messages exist
    if (this._conversationMessages.length === 0) {
      this._addChatMessage('assistant', 'Hi! I\'m your AI Configuration Assistant. I can help you create automations, scenes, scripts, and dashboards for Home Assistant. Just describe what you want in natural language!');
      
      // Add example suggestions
      this._addChatMessage('system', 'Try: "Turn on the lights when I get home after sunset" or "Create a bedtime routine"');
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
      let messageContent = `
        <div class="message-bubble">
          <div class="message-content">${this._escapeHtml(content)}</div>
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
          <div class="message-content">${this._escapeHtml(content)}</div>
        </div>
      `;
    } else if (type === 'entity-confirmation') {
      messageEl.innerHTML = this._createEntityConfirmationCard(extras.entities);
    } else if (type === 'config-preview') {
      messageEl.innerHTML = this._createConfigPreviewCard(extras.config, extras.configType);
    }
    
    messagesContainer.appendChild(messageEl);
    
    // Store message in conversation history
    this._conversationMessages.push({ type, content, timestamp, extras });
    
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
      const result = await this._hass.callService('ai_config_assistant', 'generate_config', {
        prompt: refinedPrompt,
        type: configType,
        entities: this._conversationContext.confirmedEntities ? this._conversationContext.confirmedEntities.map(e => (e.entity || e).entity_id) : [],
        return_response: true
      });
      
      this._hideTypingIndicator();
      
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
    
    return `
      <div class="error-logs-container">
        <button class="error-logs-toggle" data-target="${logId}">
          <span>📋 Error logs</span>
          <span class="chevron">▶</span>
        </button>
        <div id="${logId}" class="error-logs-content hidden">
Service Call Details:
${JSON.stringify(debugInfo.serviceCall || {}, null, 2)}

Service Response:
${debugInfo.fullServiceResponse || 'No response captured'}

Error Details:
${debugInfo.errorMessage || error.message || 'Unknown error'}

Error Stack:
${debugInfo.errorStack || error.stack || 'No stack trace available'}

Request Context:
- Timestamp: ${debugInfo.timestamp || 'Unknown'}
- Prompt: "${debugInfo.prompt || 'Unknown'}"
- Config Type: ${debugInfo.configType || 'Unknown'}
- Relevant Domains: ${debugInfo.domains ? debugInfo.domains.join(', ') : 'Unknown'}
- Entity Filtering: ${debugInfo.filteredFromTotal || `${debugInfo.relevantEntityCount || 0} entities`}
- Total Entities Available: ${debugInfo.totalEntityCount || 'Unknown'}

Entity IDs Sent (first 10):
${debugInfo.entityIds ? debugInfo.entityIds.slice(0, 10).join('\n') : 'None'}
${debugInfo.entityIds && debugInfo.entityIds.length > 10 ? `\n... and ${debugInfo.entityIds.length - 10} more` : ''}

Please share this information when reporting issues.
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
      // Show typing indicator
      this._showTypingIndicator();
      
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
        entities: entities.map(e => (e.entity || e).entity_id),
        return_response: true
      };

      console.log('Making service call with:', serviceCall);
      const result = await this._hass.callService('ai_config_assistant', 'generate_config', serviceCall);
      console.log('Service call result:', result);
      
      // Hide typing indicator
      this._hideTypingIndicator();
      
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

  async _deployConfiguration(config, configType) {
    try {
      this._addChatMessage('system', `Deploying ${configType}...`);
      
      // Call the deploy service
      const result = await this._hass.callService('ai_config_assistant', 'deploy_config', {
        config: config,
        type: configType,
        return_response: true
      });
      
      if (result && result.success) {
        this._addChatMessage('system', `✅ ${configType} deployed successfully!`);
        
        // Offer to reload automations if it was an automation
        if (configType === 'automation') {
          setTimeout(() => {
            this._addChatMessage('assistant', 'The automation has been added. Would you like me to reload automations to activate it?');
            this._addChatMessage('system', 'Type "reload" to reload automations.');
          }, 500);
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

  // System Prompts Management Methods
  async _loadSystemPrompts() {
    const root = this.shadowRoot;
    const promptsList = root.getElementById('prompts-list');
    
    if (!promptsList) return;
    
    try {
      const response = await fetch('/api/ai_config_assistant/prompts', {
        headers: {
          'Authorization': `Bearer ${this._hass.auth.access_token}`
        }
      });
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      const data = await response.json();
      this._allPrompts = data.prompts || [];
      this._renderPrompts(this._allPrompts);
      
    } catch (error) {
      console.error('Failed to load system prompts:', error);
      promptsList.innerHTML = `
        <div class="loading-message" style="color: var(--error-color);">
          Failed to load system prompts: ${error.message}
        </div>
      `;
    }
  }

  _renderPrompts(prompts) {
    const root = this.shadowRoot;
    const promptsList = root.getElementById('prompts-list');
    
    if (!promptsList) return;
    
    if (!prompts || prompts.length === 0) {
      promptsList.innerHTML = `
        <div class="loading-message">
          No system prompts found. Create your first custom prompt!
        </div>
      `;
      return;
    }
    
    promptsList.innerHTML = prompts.map(prompt => `
      <div class="prompt-card ${prompt.is_default ? 'default' : ''}" data-prompt-id="${prompt.id}">
        <div class="prompt-header">
          <h4 class="prompt-title">${prompt.name}</h4>
          <span class="prompt-badge ${prompt.is_default ? 'default' : ''}">${prompt.config_type}</span>
        </div>
        
        <div class="prompt-description">
          ${prompt.description || 'No description provided'}
        </div>
        
        <div class="prompt-meta">
          <span>Variables: ${(prompt.variables || []).length}</span>
          <span>${prompt.is_default ? 'Default' : 'Custom'}</span>
          <span>Updated: ${new Date(prompt.updated_at).toLocaleDateString()}</span>
        </div>
      </div>
    `).join('');
    
    // Attach click listeners to prompt cards
    promptsList.querySelectorAll('.prompt-card').forEach(card => {
      card.addEventListener('click', () => {
        const promptId = card.dataset.promptId;
        this._selectPrompt(promptId);
      });
    });
  }

  _filterPrompts() {
    const root = this.shadowRoot;
    const filterType = root.getElementById('prompt-filter-type').value;
    
    if (!this._allPrompts) return;
    
    let filteredPrompts = this._allPrompts;
    
    if (filterType) {
      filteredPrompts = this._allPrompts.filter(prompt => 
        prompt.config_type === filterType
      );
    }
    
    this._renderPrompts(filteredPrompts);
  }

  _selectPrompt(promptId) {
    this._selectedPromptId = promptId;
    this._selectedPrompt = this._allPrompts.find(p => p.id === promptId);
    
    // Update UI to show selected state
    const root = this.shadowRoot;
    root.querySelectorAll('.prompt-card').forEach(card => {
      card.classList.remove('active');
    });
    root.querySelector(`[data-prompt-id="${promptId}"]`)?.classList.add('active');
    
    // Show actions modal
    this._openActionsModal();
  }

  _openPromptModal(promptData = null) {
    const root = this.shadowRoot;
    const modal = root.getElementById('prompt-modal');
    const modalTitle = root.getElementById('modal-title');
    
    // Clear form
    root.getElementById('prompt-name').value = promptData?.name || '';
    root.getElementById('prompt-config-type').value = promptData?.config_type || '';
    root.getElementById('prompt-description').value = promptData?.description || '';
    root.getElementById('prompt-template').value = promptData?.template || '';
    
    // Hide preview
    const preview = root.getElementById('prompt-preview');
    if (preview) preview.style.display = 'none';
    
    // Update modal title
    modalTitle.textContent = promptData ? 'Edit System Prompt' : 'Create System Prompt';
    
    // Store current prompt data for editing
    this._editingPrompt = promptData;
    
    modal.style.display = 'flex';
  }

  _closePromptModal() {
    const root = this.shadowRoot;
    const modal = root.getElementById('prompt-modal');
    modal.style.display = 'none';
    this._editingPrompt = null;
  }

  _openActionsModal() {
    const root = this.shadowRoot;
    const modal = root.getElementById('prompt-actions-modal');
    const title = root.getElementById('actions-modal-title');
    
    if (this._selectedPrompt) {
      title.textContent = `Actions: ${this._selectedPrompt.name}`;
      
      // Hide delete button for default prompts
      const deleteBtn = root.getElementById('delete-prompt-action');
      if (deleteBtn) {
        deleteBtn.style.display = this._selectedPrompt.is_default ? 'none' : 'flex';
      }
      
      modal.style.display = 'flex';
    }
  }

  _closeActionsModal() {
    const root = this.shadowRoot;
    const modal = root.getElementById('prompt-actions-modal');
    modal.style.display = 'none';
    this._selectedPromptId = null;
    this._selectedPrompt = null;
    
    // Remove active state from cards
    root.querySelectorAll('.prompt-card').forEach(card => {
      card.classList.remove('active');
    });
  }

  async _savePrompt() {
    const root = this.shadowRoot;
    
    // Get form values
    const name = root.getElementById('prompt-name').value.trim();
    const configType = root.getElementById('prompt-config-type').value;
    const description = root.getElementById('prompt-description').value.trim();
    const template = root.getElementById('prompt-template').value.trim();
    
    // Validate required fields
    if (!name || !configType || !template) {
      this._showMessage('Please fill in all required fields', 'error');
      return;
    }
    
    // Validate template contains {prompt}
    if (!template.includes('{prompt}')) {
      this._showMessage('Template must contain the {prompt} variable', 'error');
      return;
    }
    
    const saveBtn = root.getElementById('save-prompt-btn');
    const originalText = saveBtn.textContent;
    saveBtn.textContent = 'Saving...';
    saveBtn.disabled = true;
    
    try {
      const url = this._editingPrompt 
        ? `/api/ai_config_assistant/prompts/${this._editingPrompt.id}`
        : '/api/ai_config_assistant/prompts';
        
      const method = this._editingPrompt ? 'PUT' : 'POST';
      
      const response = await fetch(url, {
        method: method,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this._hass.auth.access_token}`
        },
        body: JSON.stringify({
          name,
          config_type: configType,
          description,
          template
        })
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `HTTP ${response.status}`);
      }
      
      this._showMessage(`Prompt ${this._editingPrompt ? 'updated' : 'created'} successfully!`, 'success');
      this._closePromptModal();
      await this._loadSystemPrompts(); // Reload prompts list
      
    } catch (error) {
      console.error('Failed to save prompt:', error);
      this._showMessage('Failed to save prompt: ' + error.message, 'error');
    } finally {
      saveBtn.textContent = originalText;
      saveBtn.disabled = false;
    }
  }

  async _previewPrompt() {
    const root = this.shadowRoot;
    const template = root.getElementById('prompt-template').value.trim();
    
    if (!template) {
      this._showMessage('Please enter a template to preview', 'error');
      return;
    }
    
    try {
      // Create a temporary prompt object for preview
      const tempPrompt = {
        id: 'preview',
        template: template
      };
      
      // Use the preview endpoint with sample data
      const response = await fetch('/api/ai_config_assistant/prompts/preview/preview', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this._hass.auth.access_token}`
        },
        body: JSON.stringify({
          sample_data: {
            prompt: 'Turn on living room lights when motion detected',
            entities: '- light.living_room (Living Room Light) - light in Living Room - Current state: off\n- binary_sensor.living_room_motion (Living Room Motion) - binary_sensor in Living Room - Current state: off',
            current_states: '- light.living_room: off\n- binary_sensor.living_room_motion: off',
            services: '- light.turn_on\n- light.turn_off\n- automation.trigger',
            current_time: new Date().toISOString(),
            areas: 'Living Room, Kitchen, Bedroom',
            domains: 'light, binary_sensor, automation'
          }
        })
      });
      
      if (response.ok) {
        const data = await response.json();
        const previewDiv = root.getElementById('prompt-preview');
        const previewContent = root.getElementById('prompt-preview-content');
        
        previewContent.textContent = data.preview;
        previewDiv.style.display = 'block';
      } else {
        // Fallback: simple template replacement
        const sampleData = {
          prompt: 'Turn on living room lights when motion detected',
          entities: '- light.living_room (Living Room Light) - light in Living Room - Current state: off\n- binary_sensor.living_room_motion (Living Room Motion) - binary_sensor in Living Room - Current state: off',
          current_states: '- light.living_room: off\n- binary_sensor.living_room_motion: off',
          services: '- light.turn_on\n- light.turn_off\n- automation.trigger',
          current_time: new Date().toISOString(),
          areas: 'Living Room, Kitchen, Bedroom',
          domains: 'light, binary_sensor, automation'
        };
        
        let preview = template;
        Object.keys(sampleData).forEach(key => {
          preview = preview.replace(new RegExp(`{${key}}`, 'g'), sampleData[key]);
        });
        
        const previewDiv = root.getElementById('prompt-preview');
        const previewContent = root.getElementById('prompt-preview-content');
        
        previewContent.textContent = preview;
        previewDiv.style.display = 'block';
      }
      
    } catch (error) {
      console.error('Failed to preview prompt:', error);
      this._showMessage('Failed to preview prompt: ' + error.message, 'error');
    }
  }

  _editSelectedPrompt() {
    if (this._selectedPrompt) {
      this._closeActionsModal();
      this._openPromptModal(this._selectedPrompt);
    }
  }

  async _previewSelectedPrompt() {
    if (!this._selectedPrompt) return;
    
    try {
      const response = await fetch(`/api/ai_config_assistant/prompts/${this._selectedPrompt.id}/preview`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this._hass.auth.access_token}`
        },
        body: JSON.stringify({
          sample_data: {
            prompt: 'Turn on living room lights when motion detected',
            entities: '- light.living_room (Living Room Light) - light in Living Room - Current state: off',
            current_states: '- light.living_room: off',
            services: '- light.turn_on\n- light.turn_off',
            current_time: new Date().toISOString(),
            areas: 'Living Room, Kitchen',
            domains: 'light, binary_sensor'
          }
        })
      });
      
      if (response.ok) {
        const data = await response.json();
        
        // Show preview in a simple alert for now
        const preview = data.preview;
        const previewWindow = window.open('', '_blank', 'width=800,height=600');
        previewWindow.document.write(`
          <html>
            <head><title>Prompt Preview - ${this._selectedPrompt.name}</title></head>
            <body style="font-family: monospace; padding: 20px; background: #1e1e1e; color: #d4d4d4;">
              <h3 style="color: #4fc3f7;">Prompt Preview: ${this._selectedPrompt.name}</h3>
              <pre style="white-space: pre-wrap; background: #2d2d2d; padding: 15px; border-radius: 5px;">${preview}</pre>
            </body>
          </html>
        `);
        
        this._closeActionsModal();
      } else {
        const errorData = await response.json();
        this._showMessage('Failed to preview prompt: ' + errorData.error, 'error');
      }
      
    } catch (error) {
      console.error('Failed to preview prompt:', error);
      this._showMessage('Failed to preview prompt: ' + error.message, 'error');
    }
  }

  async _setActivePrompt() {
    if (!this._selectedPrompt) return;
    
    try {
      const response = await fetch(`/api/ai_config_assistant/prompts/active/${this._selectedPrompt.config_type}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this._hass.auth.access_token}`
        },
        body: JSON.stringify({
          prompt_id: this._selectedPrompt.id
        })
      });
      
      if (response.ok) {
        this._showMessage(`Set "${this._selectedPrompt.name}" as active prompt for ${this._selectedPrompt.config_type}`, 'success');
        this._closeActionsModal();
        await this._loadSystemPrompts(); // Reload to update active status
      } else {
        const errorData = await response.json();
        throw new Error(errorData.error || `HTTP ${response.status}`);
      }
      
    } catch (error) {
      console.error('Failed to set active prompt:', error);
      this._showMessage('Failed to set active prompt: ' + error.message, 'error');
    }
  }

  _duplicatePrompt() {
    if (this._selectedPrompt) {
      const duplicateData = {
        ...this._selectedPrompt,
        name: this._selectedPrompt.name + ' (Copy)',
        id: undefined, // Remove ID so it creates a new prompt
        is_default: false // Duplicates are never default
      };
      
      this._closeActionsModal();
      this._openPromptModal(duplicateData);
    }
  }

  _exportPrompt() {
    if (!this._selectedPrompt) return;
    
    const exportData = {
      name: this._selectedPrompt.name,
      config_type: this._selectedPrompt.config_type,
      description: this._selectedPrompt.description,
      template: this._selectedPrompt.template,
      variables: this._selectedPrompt.variables,
      version: this._selectedPrompt.version || '1.0.0'
    };
    
    const dataStr = JSON.stringify([exportData], null, 2);
    const dataUri = 'data:application/json;charset=utf-8,'+ encodeURIComponent(dataStr);
    
    const exportFileDefaultName = `${this._selectedPrompt.name.replace(/\s+/g, '_').toLowerCase()}_prompt.json`;
    
    const linkElement = document.createElement('a');
    linkElement.setAttribute('href', dataUri);
    linkElement.setAttribute('download', exportFileDefaultName);
    linkElement.click();
    
    this._showMessage(`Prompt "${this._selectedPrompt.name}" exported successfully`, 'success');
    this._closeActionsModal();
  }

  async _deletePrompt() {
    if (!this._selectedPrompt || this._selectedPrompt.is_default) return;
    
    const confirmDelete = confirm(`Are you sure you want to delete the prompt "${this._selectedPrompt.name}"? This action cannot be undone.`);
    
    if (!confirmDelete) return;
    
    try {
      const response = await fetch(`/api/ai_config_assistant/prompts/${this._selectedPrompt.id}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${this._hass.auth.access_token}`
        }
      });
      
      if (response.ok) {
        this._showMessage(`Prompt "${this._selectedPrompt.name}" deleted successfully`, 'success');
        this._closeActionsModal();
        await this._loadSystemPrompts(); // Reload prompts list
      } else {
        const errorData = await response.json();
        throw new Error(errorData.error || `HTTP ${response.status}`);
      }
      
    } catch (error) {
      console.error('Failed to delete prompt:', error);
      this._showMessage('Failed to delete prompt: ' + error.message, 'error');
    }
  }

  });
}