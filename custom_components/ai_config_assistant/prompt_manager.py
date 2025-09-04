"""System prompt management for AI Configuration Assistant."""
import logging
from typing import Any, Dict, List, Optional, Set
from dataclasses import dataclass, asdict
from datetime import datetime
import json
import uuid

from homeassistant.core import HomeAssistant
from homeassistant.helpers.storage import Store
from homeassistant.util import dt as dt_util

from .const import CONFIG_TYPES, AUTOMATION_PROMPT, DASHBOARD_PROMPT, SCRIPT_PROMPT

_LOGGER = logging.getLogger(__name__)

STORAGE_KEY = "ai_config_assistant.system_prompts"
STORAGE_VERSION = 1

@dataclass
class SystemPrompt:
    """System prompt configuration."""
    id: str
    name: str
    config_type: str
    template: str
    description: str
    is_default: bool = False
    created_at: Optional[str] = None
    updated_at: Optional[str] = None
    author: Optional[str] = None
    version: str = "1.0.0"
    variables: Optional[List[str]] = None
    
    def __post_init__(self):
        """Post-init processing."""
        if self.created_at is None:
            self.created_at = dt_util.now().isoformat()
        if self.updated_at is None:
            self.updated_at = self.created_at
        if self.variables is None:
            self.variables = self._extract_variables()
    
    def _extract_variables(self) -> List[str]:
        """Extract template variables from the prompt template."""
        import re
        pattern = r'\{([^}]+)\}'
        matches = re.findall(pattern, self.template)
        return list(set(matches))
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary."""
        return asdict(self)
    
    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "SystemPrompt":
        """Create from dictionary."""
        return cls(**data)

class PromptManager:
    """Manage system prompts for AI configuration generation."""
    
    def __init__(self, hass: HomeAssistant) -> None:
        """Initialize the prompt manager."""
        self.hass = hass
        self._store: Optional[Store] = None
        self._prompts: Dict[str, SystemPrompt] = {}
        self._default_prompts: Dict[str, SystemPrompt] = {}
        self._active_prompts: Dict[str, str] = {}  # config_type -> prompt_id
        
    async def async_setup(self) -> None:
        """Set up the prompt manager."""
        self._store = Store(
            self.hass,
            STORAGE_VERSION,
            STORAGE_KEY,
            encoder=lambda obj: json.loads(json.dumps(obj, default=str))
        )
        
        # Initialize default prompts
        await self._init_default_prompts()
        
        # Load custom prompts from storage
        await self._load_prompts()
        
        # Run migration if needed
        await self._run_migration()
        
        _LOGGER.info("Prompt manager initialized with %d prompts", len(self._prompts))
    
    async def _init_default_prompts(self) -> None:
        """Initialize default system prompts."""
        default_prompts = [
            SystemPrompt(
                id="default_automation",
                name="Default Automation",
                config_type="automation",
                template=AUTOMATION_PROMPT,
                description="Standard automation generation prompt",
                is_default=True,
                author="AI Config Assistant",
            ),
            SystemPrompt(
                id="default_dashboard",
                name="Default Dashboard",
                config_type="dashboard",
                template=DASHBOARD_PROMPT,
                description="Standard dashboard generation prompt",
                is_default=True,
                author="AI Config Assistant",
            ),
            SystemPrompt(
                id="default_script",
                name="Default Script",
                config_type="script",
                template=SCRIPT_PROMPT,
                description="Standard script generation prompt",
                is_default=True,
                author="AI Config Assistant",
            ),
        ]
        
        for prompt in default_prompts:
            self._default_prompts[prompt.id] = prompt
            self._prompts[prompt.id] = prompt
            # Set as active by default
            if prompt.config_type not in self._active_prompts:
                self._active_prompts[prompt.config_type] = prompt.id
    
    async def _load_prompts(self) -> None:
        """Load custom prompts from storage."""
        try:
            data = await self._store.async_load()
            if not data:
                return
            
            # Load custom prompts
            if "prompts" in data:
                for prompt_data in data["prompts"]:
                    prompt = SystemPrompt.from_dict(prompt_data)
                    self._prompts[prompt.id] = prompt
            
            # Load active prompt mappings
            if "active_prompts" in data:
                self._active_prompts.update(data["active_prompts"])
                
        except Exception as err:
            _LOGGER.error("Failed to load prompts from storage: %s", err)
    
    async def _save_prompts(self) -> None:
        """Save prompts to storage."""
        try:
            # Only save non-default prompts
            custom_prompts = [
                prompt.to_dict() 
                for prompt in self._prompts.values() 
                if not prompt.is_default
            ]
            
            data = {
                "prompts": custom_prompts,
                "active_prompts": self._active_prompts,
                "version": STORAGE_VERSION,
                "updated_at": dt_util.now().isoformat(),
            }
            
            await self._store.async_save(data)
            
        except Exception as err:
            _LOGGER.error("Failed to save prompts to storage: %s", err)
            raise
    
    async def get_all_prompts(self) -> List[SystemPrompt]:
        """Get all available prompts."""
        return list(self._prompts.values())
    
    async def get_prompts_by_type(self, config_type: str) -> List[SystemPrompt]:
        """Get prompts for a specific configuration type."""
        return [
            prompt for prompt in self._prompts.values()
            if prompt.config_type == config_type
        ]
    
    async def get_prompt(self, prompt_id: str) -> Optional[SystemPrompt]:
        """Get a specific prompt by ID."""
        return self._prompts.get(prompt_id)
    
    async def get_active_prompt(self, config_type: str) -> Optional[SystemPrompt]:
        """Get the active prompt for a configuration type."""
        active_id = self._active_prompts.get(config_type)
        if active_id:
            return self._prompts.get(active_id)
        return None
    
    async def create_prompt(
        self,
        name: str,
        config_type: str,
        template: str,
        description: str = "",
        author: Optional[str] = None,
        set_active: bool = False
    ) -> SystemPrompt:
        """Create a new custom prompt."""
        if config_type not in CONFIG_TYPES:
            raise ValueError(f"Invalid config type: {config_type}")
        
        # Validate template
        await self._validate_template(template)
        
        prompt = SystemPrompt(
            id=str(uuid.uuid4()),
            name=name,
            config_type=config_type,
            template=template,
            description=description,
            author=author,
            is_default=False,
        )
        
        self._prompts[prompt.id] = prompt
        
        if set_active:
            self._active_prompts[config_type] = prompt.id
        
        await self._save_prompts()
        
        _LOGGER.info("Created new prompt: %s (%s)", name, prompt.id)
        return prompt
    
    async def update_prompt(
        self,
        prompt_id: str,
        name: Optional[str] = None,
        template: Optional[str] = None,
        description: Optional[str] = None,
        set_active: Optional[bool] = None
    ) -> SystemPrompt:
        """Update an existing prompt."""
        prompt = self._prompts.get(prompt_id)
        if not prompt:
            raise ValueError(f"Prompt not found: {prompt_id}")
        
        if prompt.is_default:
            raise ValueError("Cannot modify default prompts")
        
        # Update fields
        if name is not None:
            prompt.name = name
        if template is not None:
            await self._validate_template(template)
            prompt.template = template
            prompt.variables = prompt._extract_variables()
        if description is not None:
            prompt.description = description
        
        prompt.updated_at = dt_util.now().isoformat()
        
        if set_active:
            self._active_prompts[prompt.config_type] = prompt_id
        
        await self._save_prompts()
        
        _LOGGER.info("Updated prompt: %s", prompt_id)
        return prompt
    
    async def delete_prompt(self, prompt_id: str) -> bool:
        """Delete a custom prompt."""
        prompt = self._prompts.get(prompt_id)
        if not prompt:
            return False
        
        if prompt.is_default:
            raise ValueError("Cannot delete default prompts")
        
        # Remove from prompts
        del self._prompts[prompt_id]
        
        # If this was the active prompt, revert to default
        if self._active_prompts.get(prompt.config_type) == prompt_id:
            default_prompt = await self._get_default_prompt(prompt.config_type)
            if default_prompt:
                self._active_prompts[prompt.config_type] = default_prompt.id
        
        await self._save_prompts()
        
        _LOGGER.info("Deleted prompt: %s", prompt_id)
        return True
    
    async def set_active_prompt(self, config_type: str, prompt_id: str) -> bool:
        """Set the active prompt for a configuration type."""
        if config_type not in CONFIG_TYPES:
            raise ValueError(f"Invalid config type: {config_type}")
        
        prompt = self._prompts.get(prompt_id)
        if not prompt:
            raise ValueError(f"Prompt not found: {prompt_id}")
        
        if prompt.config_type != config_type:
            raise ValueError(f"Prompt type mismatch: expected {config_type}, got {prompt.config_type}")
        
        self._active_prompts[config_type] = prompt_id
        await self._save_prompts()
        
        _LOGGER.info("Set active prompt for %s: %s", config_type, prompt_id)
        return True
    
    async def reset_to_default(self, config_type: str) -> bool:
        """Reset to default prompt for a configuration type."""
        default_prompt = await self._get_default_prompt(config_type)
        if not default_prompt:
            return False
        
        self._active_prompts[config_type] = default_prompt.id
        await self._save_prompts()
        
        _LOGGER.info("Reset %s to default prompt", config_type)
        return True
    
    async def import_prompts(self, prompts_data: List[Dict[str, Any]], overwrite: bool = False) -> List[str]:
        """Import prompts from data."""
        imported_ids = []
        
        for prompt_data in prompts_data:
            try:
                # Skip if prompt already exists and overwrite is False
                if not overwrite and prompt_data.get("id") in self._prompts:
                    continue
                
                # Create new prompt
                prompt = SystemPrompt.from_dict(prompt_data)
                
                # Generate new ID if importing
                if not overwrite:
                    prompt.id = str(uuid.uuid4())
                
                # Validate template
                await self._validate_template(prompt.template)
                
                # Add to prompts
                self._prompts[prompt.id] = prompt
                imported_ids.append(prompt.id)
                
            except Exception as err:
                _LOGGER.error("Failed to import prompt %s: %s", prompt_data.get("name", "unknown"), err)
        
        if imported_ids:
            await self._save_prompts()
            _LOGGER.info("Imported %d prompts", len(imported_ids))
        
        return imported_ids
    
    async def export_prompts(self, prompt_ids: Optional[List[str]] = None) -> List[Dict[str, Any]]:
        """Export prompts data."""
        if prompt_ids is None:
            # Export all non-default prompts
            prompts_to_export = [p for p in self._prompts.values() if not p.is_default]
        else:
            prompts_to_export = [
                self._prompts[pid] for pid in prompt_ids 
                if pid in self._prompts and not self._prompts[pid].is_default
            ]
        
        return [prompt.to_dict() for prompt in prompts_to_export]
    
    async def _get_default_prompt(self, config_type: str) -> Optional[SystemPrompt]:
        """Get the default prompt for a configuration type."""
        for prompt in self._default_prompts.values():
            if prompt.config_type == config_type:
                return prompt
        return None
    
    async def _validate_template(self, template: str) -> None:
        """Validate a prompt template."""
        if not template.strip():
            raise ValueError("Template cannot be empty")
        
        # Check for required variables
        if "{prompt}" not in template:
            raise ValueError("Template must contain {prompt} variable")
        
        # Validate template variables
        import re
        variables = re.findall(r'\{([^}]+)\}', template)
        
        allowed_variables = {
            "prompt", "entities", "current_states", "services", 
            "current_time", "areas", "domains"
        }
        
        invalid_variables = set(variables) - allowed_variables
        if invalid_variables:
            raise ValueError(f"Invalid template variables: {', '.join(invalid_variables)}")
    
    async def preview_prompt(
        self,
        prompt_id: str,
        sample_data: Optional[Dict[str, Any]] = None
    ) -> str:
        """Preview a prompt with sample data."""
        prompt = self._prompts.get(prompt_id)
        if not prompt:
            raise ValueError(f"Prompt not found: {prompt_id}")
        
        if sample_data is None:
            sample_data = {
                "prompt": "Turn on living room lights when motion detected",
                "entities": "- light.living_room (Living Room Light) - light in Living Room - Current state: off\n- binary_sensor.living_room_motion (Living Room Motion) - binary_sensor in Living Room - Current state: off",
                "current_states": "- light.living_room: off\n- binary_sensor.living_room_motion: off",
                "services": "- light.turn_on\n- light.turn_off\n- automation.trigger",
                "current_time": dt_util.now().isoformat(),
                "areas": "Living Room, Kitchen, Bedroom",
                "domains": "light, binary_sensor, automation"
            }
        
        try:
            return prompt.template.format(**sample_data)
        except KeyError as err:
            raise ValueError(f"Template variable not found in sample data: {err}")
    
    async def _run_migration(self) -> None:
        """Run any necessary migrations for existing installations."""
        try:
            data = await self._store.async_load() or {}
            migration_version = data.get("migration_version", 0)
            
            if migration_version < 1:
                # Migration v1: Initialize active prompts if not set
                if not self._active_prompts:
                    for config_type in ["automation", "script", "dashboard"]:
                        default_prompt = await self._get_default_prompt(config_type)
                        if default_prompt:
                            self._active_prompts[config_type] = default_prompt.id
                    
                    _LOGGER.info("Migration v1: Initialized active prompts")
                    await self._save_migration_data(migration_version=1)
            
            # Future migrations can be added here as migration_version < 2, etc.
            
        except Exception as err:
            _LOGGER.error("Failed to run prompt manager migration: %s", err)

    async def _save_migration_data(self, migration_version: int) -> None:
        """Save migration data along with prompts."""
        try:
            # Get existing data
            existing_data = await self._store.async_load() or {}
            
            # Update migration version
            existing_data["migration_version"] = migration_version
            existing_data["migrated_at"] = dt_util.now().isoformat()
            
            # Update active prompts
            existing_data["active_prompts"] = self._active_prompts
            
            # Save updated data
            await self._store.async_save(existing_data)
            
        except Exception as err:
            _LOGGER.error("Failed to save migration data: %s", err)

    @property
    def is_setup(self) -> bool:
        """Check if the manager is set up."""
        return self._store is not None