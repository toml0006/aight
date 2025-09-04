# System Prompt Management Feature Specification

> **Feature:** System Prompt Management Interface  
> **Version:** 1.0.0  
> **Last Updated:** 2025-09-02  
> **Status:** Specification  

## Overview

Add comprehensive system prompt management capabilities to the AI Configuration Assistant, allowing users to view, edit, create, and manage custom system prompts for different configuration types.

## Current State Analysis

### Existing System Prompts

The plugin currently uses hardcoded system prompts in `const.py`:

- **AUTOMATION_PROMPT**: Template for automation generation 
- **DASHBOARD_PROMPT**: Template for dashboard creation
- **SCRIPT_PROMPT**: Template for script generation

### Current Architecture

System prompts are:
- Hardcoded as string constants in `const.py`
- Selected via `_get_system_prompt()` in `config_generator.py:208`
- Formatted with dynamic context (entities, states, services)
- Used in `generate_config()`, `validate_config()`, and `improve_config()` methods

## Feature Requirements

### Core Features

1. **Prompt Library Management**
   - View all available system prompts
   - Create new custom prompts
   - Edit existing prompts
   - Delete unused custom prompts
   - Import/export prompt collections

2. **Dynamic Prompt Selection**
   - Default prompts remain unchanged for backward compatibility
   - Override defaults with custom prompts
   - Per-config-type prompt customization
   - Fallback to defaults if custom prompt fails

3. **Prompt Template System**
   - Support for dynamic placeholders: `{entities}`, `{current_states}`, `{services}`, `{current_time}`
   - Template validation and preview
   - Variable documentation and help
   - Syntax highlighting for prompt editing

4. **Management Interface**
   - New "System Prompts" section in AI Config panel
   - Rich text editor with markdown support
   - Live preview with sample data
   - Template validation feedback

## Technical Specification

### Database Schema

Create new storage system for custom prompts:

```python
# New file: custom_components/ai_config_assistant/prompt_manager.py
@dataclass
class SystemPrompt:
    id: str
    name: str
    config_type: str  # automation, script, dashboard, etc.
    template: str
    description: str
    is_default: bool
    created_at: datetime
    updated_at: datetime
    author: str
    version: str
```

### Storage Implementation

Use Home Assistant's data storage API:

```python
# In __init__.py, add prompt storage
async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    # Existing setup...
    
    # Add prompt storage
    prompt_store = hass.helpers.storage.Store(
        version=1,
        key=f"{DOMAIN}.system_prompts",
        encoder=JSONEncoder
    )
    
    hass.data[DOMAIN][entry.entry_id]["prompt_store"] = prompt_store
```

### API Endpoints

Add new REST API endpoints in `api.py`:

```python
# GET /api/ai_config_assistant/prompts
async def get_system_prompts(request):
    """Get all available system prompts."""

# POST /api/ai_config_assistant/prompts
async def create_system_prompt(request):
    """Create a new custom system prompt."""

# PUT /api/ai_config_assistant/prompts/{prompt_id}
async def update_system_prompt(request):
    """Update an existing system prompt."""

# DELETE /api/ai_config_assistant/prompts/{prompt_id}
async def delete_system_prompt(request):
    """Delete a custom system prompt."""

# POST /api/ai_config_assistant/prompts/{prompt_id}/preview
async def preview_system_prompt(request):
    """Preview a system prompt with sample data."""
```

### Services

Add new services in `services.yaml`:

```yaml
manage_system_prompts:
  name: Manage System Prompts
  description: Create, edit, or delete custom system prompts
  fields:
    action:
      name: Action
      description: Action to perform (create, update, delete)
      required: true
      selector:
        select:
          options:
            - create
            - update
            - delete
    prompt_data:
      name: Prompt Data
      description: System prompt configuration data
      required: true

export_prompts:
  name: Export Prompts
  description: Export system prompts to a file
  fields:
    format:
      name: Format  
      description: Export format (json, yaml)
      selector:
        select:
          options:
            - json
            - yaml

import_prompts:
  name: Import Prompts
  description: Import system prompts from a file
  fields:
    file_data:
      name: File Data
      description: Prompt data to import
      required: true
```

### Frontend Components

#### System Prompts Management Panel

```javascript
// New component: prompt-manager-panel.js
class PromptManagerPanel extends LitElement {
  // Prompt library view
  renderPromptLibrary() {
    return html`
      <div class="prompt-library">
        <div class="section-header">
          <h3>System Prompts</h3>
          <mwc-button @click=${this.createNewPrompt}>
            <mwc-icon>add</mwc-icon> New Prompt
          </mwc-button>
        </div>
        
        <div class="prompt-cards">
          ${this.prompts.map(prompt => this.renderPromptCard(prompt))}
        </div>
      </div>
    `;
  }

  // Individual prompt card
  renderPromptCard(prompt) {
    return html`
      <div class="prompt-card" data-config-type=${prompt.config_type}>
        <div class="card-header">
          <h4>${prompt.name}</h4>
          <span class="config-type-badge">${prompt.config_type}</span>
        </div>
        
        <p class="description">${prompt.description}</p>
        
        <div class="card-actions">
          <mwc-button @click=${() => this.editPrompt(prompt.id)}>
            Edit
          </mwc-button>
          <mwc-button @click=${() => this.previewPrompt(prompt.id)}>
            Preview
          </mwc-button>
          ${!prompt.is_default ? html`
            <mwc-button @click=${() => this.deletePrompt(prompt.id)}>
              Delete
            </mwc-button>
          ` : ''}
        </div>
      </div>
    `;
  }
}
```

#### Prompt Editor Component

```javascript
// Advanced prompt editor with features:
class PromptEditor extends LitElement {
  render() {
    return html`
      <div class="prompt-editor">
        <div class="editor-toolbar">
          <mwc-select label="Config Type" @selected=${this.onConfigTypeChange}>
            ${CONFIG_TYPES.map(type => html`
              <mwc-list-item value=${type}>${type}</mwc-list-item>
            `)}
          </mwc-select>
          
          <mwc-button @click=${this.insertPlaceholder}>
            Insert Variable
          </mwc-button>
          
          <mwc-button @click=${this.showPreview}>
            Preview
          </mwc-button>
        </div>

        <div class="editor-content">
          <mwc-textarea
            label="System Prompt Template"
            placeholder="Enter your system prompt template..."
            .value=${this.promptText}
            @input=${this.onPromptChange}
            rows="15"
          ></mwc-textarea>

          <div class="template-help">
            <h4>Available Variables:</h4>
            <ul>
              <li><code>{prompt}</code> - User's request</li>
              <li><code>{entities}</code> - Available entities</li>
              <li><code>{current_states}</code> - Current entity states</li>
              <li><code>{services}</code> - Available services</li>
              <li><code>{current_time}</code> - Current timestamp</li>
            </ul>
          </div>
        </div>
      </div>
    `;
  }
}
```

### Configuration Changes

Update `config_generator.py` to support dynamic prompt selection:

```python
# Modified method in ConfigGenerator class
def _get_system_prompt(self, config_type: str, context: Dict[str, Any]) -> str:
    """Get the appropriate system prompt for the configuration type."""
    
    # Try to get custom prompt first
    custom_prompt = self._get_custom_prompt(config_type)
    if custom_prompt:
        template = custom_prompt.template
    else:
        # Fallback to hardcoded defaults
        if config_type == "automation":
            template = AUTOMATION_PROMPT
        elif config_type == "dashboard":
            template = DASHBOARD_PROMPT
        elif config_type == "script":
            template = SCRIPT_PROMPT
        else:
            template = self._get_generic_template(config_type)
    
    return self._format_prompt_template(template, context)

async def _get_custom_prompt(self, config_type: str) -> Optional[SystemPrompt]:
    """Get custom prompt for config type if exists."""
    if not hasattr(self, '_prompt_manager'):
        return None
        
    return await self._prompt_manager.get_active_prompt(config_type)
```

## User Stories

### Story 1: View System Prompts
**As a** Home Assistant user  
**I want to** view all available system prompts  
**So that** I can understand how the AI generates different configurations  

**Acceptance Criteria:**
- [ ] Can access "System Prompts" section in AI Config panel
- [ ] Can see all default prompts (automation, script, dashboard)
- [ ] Can see any custom prompts I've created
- [ ] Each prompt shows config type, name, description
- [ ] Can distinguish between default and custom prompts

### Story 2: Create Custom Prompt
**As a** power user  
**I want to** create custom system prompts  
**So that** I can tailor AI output to my specific needs  

**Acceptance Criteria:**
- [ ] Can click "New Prompt" button
- [ ] Can select config type (automation, script, etc.)
- [ ] Can enter prompt name and description
- [ ] Can write custom prompt template with variables
- [ ] Can preview prompt with sample data
- [ ] Can save and activate custom prompt

### Story 3: Edit Existing Prompts
**As a** user  
**I want to** modify existing prompts  
**So that** I can improve AI output quality  

**Acceptance Criteria:**
- [ ] Can edit custom prompts (not defaults)
- [ ] Can modify name, description, template
- [ ] Changes are saved and take effect immediately
- [ ] Can revert to default if needed
- [ ] Can see edit history/version info

### Story 4: Template Variables
**As a** prompt creator  
**I want to** use template variables in my prompts  
**So that** I can create dynamic, context-aware prompts  

**Acceptance Criteria:**
- [ ] Can insert variables like `{entities}`, `{current_states}`
- [ ] Variables are automatically replaced with actual data
- [ ] Can see documentation for each variable
- [ ] Get validation errors for invalid variables
- [ ] Can preview how variables will be populated

### Story 5: Import/Export Prompts
**As a** community member  
**I want to** share custom prompts  
**So that** others can benefit from improved templates  

**Acceptance Criteria:**
- [ ] Can export prompts as JSON/YAML files
- [ ] Can import prompts from files
- [ ] Can import from community repositories
- [ ] Can select which prompts to import
- [ ] Get validation errors for invalid imports

## Implementation Plan

### Phase 1: Core Infrastructure
1. Create `PromptManager` class for CRUD operations
2. Add data storage for custom prompts
3. Update `config_generator.py` for dynamic prompt selection
4. Create basic API endpoints

### Phase 2: Management Interface
1. Create prompt library view component
2. Add prompt editor with syntax highlighting  
3. Implement template variable system
4. Add preview functionality

### Phase 3: Advanced Features
1. Import/export functionality
2. Prompt versioning and history
3. Community prompt sharing
4. Advanced template validation

### Phase 4: Polish & Testing
1. Comprehensive error handling
2. User experience improvements
3. Documentation and examples
4. Performance optimizations

## Success Metrics

- **Usability**: Users can create custom prompts in under 5 minutes
- **Adoption**: 30%+ of active users create at least one custom prompt
- **Quality**: Custom prompts improve generation success rate by 15%+
- **Community**: Enable sharing of 100+ community-created prompts
- **Flexibility**: Support for all current and future config types

## Risk Assessment

### Technical Risks
- **Storage Migration**: Need to handle existing installations gracefully
- **Template Security**: Prevent prompt injection attacks
- **Performance**: Large prompt libraries could impact load times

### User Experience Risks
- **Complexity**: Advanced users might find interface too simple
- **Confusion**: New users might be overwhelmed by options
- **Compatibility**: Custom prompts might break with AI model updates

### Mitigation Strategies
- Gradual rollout with feature flags
- Comprehensive validation and sandboxing
- Clear documentation and tutorials
- Backward compatibility guarantees

## Conclusion

This system prompt management feature will transform the AI Configuration Assistant from a fixed-template system into a fully customizable AI configuration platform, enabling users to fine-tune AI behavior for their specific needs while maintaining the simplicity that makes the plugin accessible to all users.