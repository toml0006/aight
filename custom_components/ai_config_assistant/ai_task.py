"""AI Task entity for AI Configuration Assistant."""
import logging
from typing import Any, Dict, Optional
import json
import yaml

_LOGGER = logging.getLogger(__name__)

try:
    from homeassistant.components.ai_task import (
        AITaskEntity,
        GenDataTask,
        GenDataTaskResult,
    )
    AI_TASK_AVAILABLE = True
    _LOGGER.info("✅ AI Task component successfully imported")
except ImportError as e:
    _LOGGER.info("AI Task component not available in this Home Assistant version: %s", e)
    AI_TASK_AVAILABLE = False
    # Create dummy classes to prevent errors
    class AITaskEntity:
        pass
    class GenDataTask:
        pass
    class GenDataTaskResult:
        pass
from homeassistant.core import HomeAssistant, callback
from homeassistant.helpers.entity_platform import AddEntitiesCallback
from homeassistant.config_entries import ConfigEntry
from homeassistant.exceptions import HomeAssistantError

from .const import DOMAIN
from .config_generator import ConfigGenerator
from .entity_manager import EntityManager

_LOGGER = logging.getLogger(__name__)

# Define output schemas for different configuration types
AUTOMATION_SCHEMA = {
    "type": "object",
    "properties": {
        "alias": {"type": "string"},
        "description": {"type": "string"},
        "trigger": {"type": "array"},
        "condition": {"type": "array"},
        "action": {"type": "array"},
        "mode": {"type": "string", "enum": ["single", "parallel", "queued", "restart"]},
    },
    "required": ["trigger", "action"],
}

SCRIPT_SCHEMA = {
    "type": "object",
    "properties": {
        "alias": {"type": "string"},
        "description": {"type": "string"},
        "sequence": {"type": "array"},
        "mode": {"type": "string", "enum": ["single", "parallel", "queued", "restart"]},
        "fields": {"type": "object"},
    },
    "required": ["sequence"],
}

DASHBOARD_SCHEMA = {
    "type": "object",
    "properties": {
        "title": {"type": "string"},
        "path": {"type": "string"},
        "cards": {"type": "array"},
        "views": {"type": "array"},
    },
}

SCENE_SCHEMA = {
    "type": "object",
    "properties": {
        "name": {"type": "string"},
        "entities": {"type": "object"},
    },
    "required": ["name", "entities"],
}


class ConfigGeneratorAITask(AITaskEntity):
    """AI Task entity for generating Home Assistant configurations."""
    
    _attr_has_entity_name = True
    _attr_name = "Configuration Generator"
    _attr_unique_id = "ai_config_generator"
    
    def __init__(
        self,
        hass: HomeAssistant,
        config_generator: ConfigGenerator,
        entity_manager: EntityManager,
        entry: ConfigEntry,
    ) -> None:
        """Initialize the AI Task entity."""
        super().__init__()
        self.hass = hass
        self._config_generator = config_generator
        self._entity_manager = entity_manager
        self._entry = entry
        self._attr_device_info = {
            "identifiers": {(DOMAIN, entry.entry_id)},
            "name": "AI Configuration Assistant",
            "manufacturer": "Home Assistant Community",
            "model": "AI Config Generator",
        }
        
    async def async_added_to_hass(self) -> None:
        """Handle entity being added to Home Assistant."""
        await super().async_added_to_hass()
        _LOGGER.info("AI Configuration Generator task entity added to Home Assistant")
    
    async def _async_generate_data(
        self,
        task: GenDataTask,
        chat_log: Optional[Any] = None,
    ) -> GenDataTaskResult:
        """Generate configuration based on natural language instruction."""
        try:
            # Log the task details
            _LOGGER.info("AI Task received: %s", task.instruction[:100])
            
            # Detect configuration type from instruction
            config_type = self._detect_config_type(task.instruction)
            _LOGGER.info("Detected config type: %s", config_type)
            
            # Extract context from chat log if available
            context = {}
            if chat_log:
                context = self._build_context_from_chat(chat_log)
            
            # Extract entities mentioned in the instruction
            entities = await self._extract_relevant_entities(task.instruction)
            
            # Generate configuration using existing generator
            result = await self._config_generator.generate_config(
                prompt=task.instruction,
                config_type=config_type,
                context=context,
                include_entities=entities,
            )
            
            if not result.success:
                return GenDataTaskResult(
                    data=None,
                    error=result.warnings[0] if result.warnings else "Configuration generation failed",
                )
            
            # Parse the generated YAML configuration
            try:
                config_data = yaml.safe_load(result.config)
            except yaml.YAMLError as e:
                _LOGGER.error("Failed to parse generated YAML: %s", e)
                return GenDataTaskResult(
                    data=None,
                    error=f"Invalid YAML generated: {str(e)}",
                )
            
            # Validate against schema if needed
            if task.output_schema:
                validated_data = self._validate_against_schema(
                    config_data,
                    task.output_schema,
                    config_type
                )
                if validated_data.get("error"):
                    return GenDataTaskResult(
                        data=None,
                        error=validated_data["error"],
                    )
                config_data = validated_data.get("data", config_data)
            
            # Return structured result
            return GenDataTaskResult(
                data={
                    "config": config_data,
                    "config_yaml": result.config,
                    "type": config_type,
                    "explanation": result.explanation,
                    "entities_used": result.entities_used,
                    "can_deploy": True,
                }
            )
            
        except Exception as e:
            _LOGGER.error("Error generating configuration: %s", e)
            return GenDataTaskResult(
                data=None,
                error=f"Failed to generate configuration: {str(e)}",
            )
    
    def _detect_config_type(self, instruction: str) -> str:
        """Detect the type of configuration from the instruction."""
        instruction_lower = instruction.lower()
        
        # Check for specific configuration type keywords
        if any(word in instruction_lower for word in ["automation", "trigger", "when"]):
            return "automation"
        elif any(word in instruction_lower for word in ["script", "sequence", "steps"]):
            return "script"
        elif any(word in instruction_lower for word in ["dashboard", "lovelace", "card", "view"]):
            return "dashboard"
        elif any(word in instruction_lower for word in ["scene", "snapshot"]):
            return "scene"
        elif any(word in instruction_lower for word in ["sensor", "template"]):
            return "sensor"
        elif any(word in instruction_lower for word in ["helper", "input", "toggle", "boolean", "number", "text"]):
            return "helper"
        
        # Default to automation if unclear
        return "automation"
    
    def _build_context_from_chat(self, chat_log: Any) -> Dict[str, Any]:
        """Build context from chat history."""
        context = {
            "chat_history": [],
            "previous_configs": [],
        }
        
        # Extract relevant information from chat history
        for message in chat_log.messages[-5:]:  # Last 5 messages for context
            context["chat_history"].append({
                "role": message.role,
                "content": message.content[:500],  # Limit content length
            })
            
            # Check if message contains configuration
            if "config" in message.content.lower():
                context["previous_configs"].append(message.content)
        
        return context
    
    async def _extract_relevant_entities(self, instruction: str) -> list[str]:
        """Extract relevant entity IDs from the instruction."""
        # Get entity suggestions based on the instruction
        entities = []
        
        # Common entity keywords to search for
        keywords = [
            "light", "switch", "sensor", "climate", "cover",
            "fan", "lock", "camera", "media_player", "vacuum"
        ]
        
        instruction_lower = instruction.lower()
        for keyword in keywords:
            if keyword in instruction_lower:
                # Get entity suggestions for this keyword
                suggestions = await self._entity_manager.get_entity_suggestions(
                    query=keyword,
                    limit=5
                )
                entities.extend([s.entity_id for s in suggestions])
        
        # Also check for room/area mentions
        areas = ["living room", "bedroom", "kitchen", "bathroom", "office", "garage"]
        for area in areas:
            if area in instruction_lower:
                area_entities = await self._entity_manager.get_entities_by_area(area)
                entities.extend([e.entity_id for e in area_entities[:3]])
        
        return list(set(entities))  # Remove duplicates
    
    def _validate_against_schema(
        self,
        config_data: Dict[str, Any],
        output_schema: Dict[str, Any],
        config_type: str
    ) -> Dict[str, Any]:
        """Validate configuration against provided schema."""
        try:
            # Get the appropriate schema for the config type
            type_schemas = {
                "automation": AUTOMATION_SCHEMA,
                "script": SCRIPT_SCHEMA,
                "dashboard": DASHBOARD_SCHEMA,
                "scene": SCENE_SCHEMA,
            }
            
            expected_schema = type_schemas.get(config_type)
            if not expected_schema:
                return {"data": config_data}
            
            # Basic validation - check required fields
            required_fields = expected_schema.get("required", [])
            for field in required_fields:
                if field not in config_data:
                    return {
                        "error": f"Missing required field: {field}",
                        "data": None
                    }
            
            # Validate field types
            properties = expected_schema.get("properties", {})
            for field, value in config_data.items():
                if field in properties:
                    expected_type = properties[field].get("type")
                    if expected_type:
                        if not self._check_type(value, expected_type):
                            return {
                                "error": f"Invalid type for field {field}: expected {expected_type}",
                                "data": None
                            }
            
            return {"data": config_data}
            
        except Exception as e:
            _LOGGER.error("Schema validation error: %s", e)
            return {"data": config_data}  # Return original data if validation fails
    
    def _check_type(self, value: Any, expected_type: str) -> bool:
        """Check if a value matches the expected type."""
        type_map = {
            "string": str,
            "number": (int, float),
            "boolean": bool,
            "array": list,
            "object": dict,
        }
        
        expected_python_type = type_map.get(expected_type)
        if expected_python_type:
            return isinstance(value, expected_python_type)
        return True
    
    @property
    def available(self) -> bool:
        """Return if entity is available."""
        return self._config_generator is not None and self._entity_manager is not None


async def async_setup_entry(
    hass: HomeAssistant,
    entry: ConfigEntry,
    async_add_entities: AddEntitiesCallback,
) -> None:
    """Set up AI Task entity from a config entry."""
    # Check if AI Task component is available
    if not AI_TASK_AVAILABLE:
        _LOGGER.info("AI Task component not available, skipping entity setup")
        return
    
    # Get the config generator and entity manager from hass.data
    config_generator = hass.data[DOMAIN].get("config_generator")
    entity_manager = hass.data[DOMAIN].get("entity_manager")
    
    if not config_generator or not entity_manager:
        _LOGGER.error("Required components not initialized for AI Task entity")
        return
    
    # Create and add the AI Task entity
    entity = ConfigGeneratorAITask(
        hass,
        config_generator,
        entity_manager,
        entry,
    )
    
    async_add_entities([entity], update_before_add=True)
    
    # Store reference in hass.data
    hass.data[DOMAIN]["ai_task_entity"] = entity
    
    _LOGGER.info("AI Configuration Generator task entity setup complete")