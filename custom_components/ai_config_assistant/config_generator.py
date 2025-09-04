"""Configuration generator for AI Configuration Assistant."""
import logging
from typing import Any, Dict, List, Optional, Set
from dataclasses import dataclass
import yaml
import json
from datetime import datetime

from homeassistant.core import HomeAssistant
from homeassistant.helpers import config_validation as cv
from homeassistant.helpers.template import Template
from homeassistant.util import dt as dt_util

from .const import (
    AUTOMATION_PROMPT,
    DASHBOARD_PROMPT,
    SCRIPT_PROMPT,
    CONFIG_TYPES,
)
from .llm_client import LLMClientManager, LLMMessage
from .entity_manager import EntityManager
from .prompt_manager import PromptManager

_LOGGER = logging.getLogger(__name__)

@dataclass
class GenerationResult:
    """Result of configuration generation."""
    config: str
    explanation: str
    entities_used: List[str]
    warnings: List[str]
    success: bool

@dataclass
class ValidationResult:
    """Result of configuration validation."""
    valid: bool
    errors: List[str]
    warnings: List[str]
    suggestions: List[str]

class ConfigGenerator:
    """Generate Home Assistant configurations using AI."""

    def __init__(self, hass: HomeAssistant) -> None:
        """Initialize the configuration generator."""
        self.hass = hass
        self._llm_client: Optional[LLMClientManager] = None
        self._entity_manager: Optional[EntityManager] = None
        self._prompt_manager: Optional[PromptManager] = None

    def setup(
        self, 
        llm_client: LLMClientManager, 
        entity_manager: EntityManager,
        prompt_manager: Optional[PromptManager] = None
    ) -> None:
        """Set up the configuration generator."""
        self._llm_client = llm_client
        self._entity_manager = entity_manager
        self._prompt_manager = prompt_manager

    async def generate_config(
        self,
        prompt: str,
        config_type: str,
        context: Optional[Dict[str, Any]] = None,
        include_entities: Optional[List[str]] = None,
        **kwargs
    ) -> GenerationResult:
        """Generate a configuration based on a natural language prompt."""
        try:
            if not self._llm_client or not self._llm_client.is_configured:
                raise RuntimeError("LLM client not configured")

            if not self._entity_manager:
                raise RuntimeError("Entity manager not initialized")

            # Get entity suggestions if entities are mentioned in the prompt
            suggested_entities = await self._extract_entities_from_prompt(prompt)
            if include_entities:
                suggested_entities.extend(include_entities)

            # Build context with entity information
            generation_context = await self._build_generation_context(
                prompt, config_type, suggested_entities, context
            )

            # Select appropriate prompt template
            system_prompt = await self._get_system_prompt(config_type, generation_context)

            # Generate the configuration
            response = await self._llm_client.generate_config(
                prompt=prompt,
                system_prompt=system_prompt,
                **kwargs
            )

            # Post-process the generated configuration
            processed_result = await self._post_process_config(
                response.content, config_type, suggested_entities
            )

            return GenerationResult(
                config=processed_result["config"],
                explanation=processed_result["explanation"],
                entities_used=processed_result["entities_used"],
                warnings=processed_result["warnings"],
                success=True
            )

        except Exception as err:
            error_msg = str(err)
            _LOGGER.error("Error generating configuration: %s", err)
            
            # Check for specific LLM errors and provide better messages
            if "RateLimitError" in error_msg or "quota" in error_msg.lower():
                user_friendly_error = "⚠️ OpenAI API quota exceeded. Please check your billing details at https://platform.openai.com/account/billing"
            elif "AuthenticationError" in error_msg or "api_key" in error_msg.lower():
                user_friendly_error = "🔑 API key invalid or missing. Please reconfigure your LLM provider in the integration settings."
            elif "TimeoutError" in error_msg or "timeout" in error_msg.lower():
                user_friendly_error = "⏱️ Request timed out. The AI service may be overloaded. Please try again."
            elif "NetworkError" in error_msg or "connection" in error_msg.lower():
                user_friendly_error = "🌐 Network connection failed. Please check your internet connection."
            else:
                user_friendly_error = f"❌ AI service error: {error_msg}"
            
            return GenerationResult(
                config="",
                explanation="",
                entities_used=[],
                warnings=[user_friendly_error],
                success=False
            )

    async def _extract_entities_from_prompt(self, prompt: str) -> List[str]:
        """Extract potential entity references from the user prompt."""
        entities = []
        words = prompt.lower().split()
        
        # Look for common entity-related terms
        entity_terms = {
            "light", "lights", "lamp", "lamps",
            "switch", "switches",
            "sensor", "sensors", "temperature", "humidity",
            "door", "doors", "window", "windows",
            "motion", "occupancy",
            "camera", "cameras",
            "fan", "fans",
            "thermostat", "climate",
            "lock", "locks",
            "garage", "gate",
            "vacuum", "robot",
            "media", "tv", "television", "speaker",
        }

        # Room/area terms
        area_terms = {
            "living room", "bedroom", "kitchen", "bathroom", "garage",
            "office", "dining room", "basement", "attic", "hallway",
            "patio", "deck", "yard", "garden",
        }

        # Get entity suggestions based on terms found
        for term in entity_terms:
            if term in prompt.lower():
                suggestions = await self._entity_manager.get_entity_suggestions(
                    query=term, limit=3
                )
                entities.extend([s.entity_id for s in suggestions])

        # Get entities from areas mentioned
        for area_term in area_terms:
            if area_term in prompt.lower():
                area_entities = await self._entity_manager.get_entities_by_area(area_term)
                entities.extend([e.entity_id for e in area_entities[:5]])

        return list(set(entities))  # Remove duplicates

    async def _build_generation_context(
        self,
        prompt: str,
        config_type: str,
        entity_ids: List[str],
        user_context: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """Build context information for configuration generation."""
        context = {
            "current_time": dt_util.now().isoformat(),
            "entities": {},
            "current_states": {},
            "areas": [],
            "domains": set(),
        }

        # Get entity context
        if entity_ids:
            entity_context = await self._entity_manager.get_entity_context(entity_ids)
            context.update(entity_context)

        # Add user context
        if user_context:
            context.update(user_context)

        # Get available services for certain config types
        if config_type in ["automation", "script"]:
            context["services"] = self._get_available_services()

        return context

    async def _get_system_prompt(self, config_type: str, context: Dict[str, Any]) -> str:
        """Get the appropriate system prompt for the configuration type."""
        # Try to get custom prompt first
        template = None
        if self._prompt_manager and self._prompt_manager.is_setup:
            try:
                custom_prompt = await self._prompt_manager.get_active_prompt(config_type)
                if custom_prompt:
                    template = custom_prompt.template
                    _LOGGER.debug("Using custom prompt for %s: %s", config_type, custom_prompt.name)
            except Exception as err:
                _LOGGER.warning("Failed to get custom prompt for %s: %s", config_type, err)
        
        # Fallback to hardcoded defaults
        if template is None:
            if config_type == "automation":
                template = AUTOMATION_PROMPT
            elif config_type == "dashboard":
                template = DASHBOARD_PROMPT
            elif config_type == "script":
                template = SCRIPT_PROMPT
            else:
                # Generic template
                template = f"""
Create a Home Assistant {config_type} configuration based on this request: {{prompt}}

Available entities:
{{entities}}

Current time: {{current_time}}
Current states: {{current_states}}

Generate a complete YAML {config_type} configuration.
Respond with valid YAML only.
"""
            _LOGGER.debug("Using default prompt for %s", config_type)
        
        # Format the template with context
        return self._format_prompt_template(template, context)
    
    def _format_prompt_template(self, template: str, context: Dict[str, Any]) -> str:
        """Format a prompt template with context data."""
        # Format entity information
        entities_info = []
        for entity_id, info in context.get("entities", {}).items():
            state_info = context.get("current_states", {}).get(entity_id, {})
            state = state_info.get("state", "unknown")
            entities_info.append(f"- {entity_id} ({info['name']}) - {info['domain']} in {info.get('area', 'No Area')} - Current state: {state}")

        entities_text = "\n".join(entities_info) if entities_info else "No specific entities identified"

        # Format current states
        states_info = []
        for entity_id, state_data in context.get("current_states", {}).items():
            states_info.append(f"- {entity_id}: {state_data['state']}")
        states_text = "\n".join(states_info) if states_info else "No current states available"

        # Format areas
        areas_text = ", ".join(context.get("areas", [])) if context.get("areas") else "No areas available"
        
        # Format domains
        domains_text = ", ".join(context.get("domains", [])) if context.get("domains") else "No domains available"

        return template.format(
            prompt="{prompt}",  # Keep placeholder for actual formatting
            entities=entities_text,
            current_time=context.get("current_time", ""),
            current_states=states_text,
            services=context.get("services", ""),
            areas=areas_text,
            domains=domains_text
        )

    def _get_available_services(self) -> str:
        """Get a summary of available services."""
        services = []
        for domain, domain_services in self.hass.services.async_services().items():
            for service_name in domain_services.keys():
                services.append(f"{domain}.{service_name}")
        
        # Return a subset of common services to avoid overwhelming the LLM
        common_services = [s for s in services if any(
            domain in s for domain in [
                "light", "switch", "climate", "cover", "fan", "media_player",
                "notify", "automation", "script", "scene", "input_boolean"
            ]
        )]
        
        return "\n".join(f"- {service}" for service in common_services[:20])

    async def _post_process_config(
        self,
        generated_content: str,
        config_type: str,
        suggested_entities: List[str]
    ) -> Dict[str, Any]:
        """Post-process the generated configuration."""
        try:
            # Extract YAML from the response (remove markdown formatting if present)
            yaml_content = self._extract_yaml_from_response(generated_content)
            
            # Parse and validate YAML
            try:
                parsed_config = yaml.safe_load(yaml_content)
            except yaml.YAMLError as err:
                # Try to fix common YAML issues
                yaml_content = self._fix_common_yaml_issues(yaml_content)
                parsed_config = yaml.safe_load(yaml_content)

            # Extract entities actually used in the config
            entities_used = self._extract_entities_from_config(yaml_content)
            
            # Generate explanation
            explanation = await self._generate_explanation(
                yaml_content, config_type, entities_used
            )

            # Check for warnings
            warnings = []
            for entity_id in entities_used:
                if entity_id not in self._entity_manager._entities_cache:
                    warnings.append(f"Entity '{entity_id}' not found in Home Assistant")

            return {
                "config": yaml_content,
                "explanation": explanation,
                "entities_used": entities_used,
                "warnings": warnings,
            }

        except Exception as err:
            _LOGGER.error("Error post-processing config: %s", err)
            return {
                "config": generated_content,
                "explanation": "Configuration generated but may need manual review",
                "entities_used": [],
                "warnings": [f"Post-processing error: {err}"],
            }

    def _extract_yaml_from_response(self, response: str) -> str:
        """Extract YAML content from LLM response."""
        # Remove markdown code blocks if present
        lines = response.split('\n')
        start_idx = 0
        end_idx = len(lines)

        for i, line in enumerate(lines):
            if line.strip().startswith('```'):
                if start_idx == 0:
                    start_idx = i + 1
                else:
                    end_idx = i
                    break

        yaml_lines = lines[start_idx:end_idx]
        return '\n'.join(yaml_lines).strip()

    def _fix_common_yaml_issues(self, yaml_content: str) -> str:
        """Fix common YAML formatting issues."""
        # Fix missing quotes around strings that look like numbers or booleans
        lines = yaml_content.split('\n')
        fixed_lines = []
        
        for line in lines:
            # Fix entity_id values that might not be properly quoted
            if 'entity_id:' in line and not line.strip().endswith(('|', '>')):
                parts = line.split('entity_id:', 1)
                if len(parts) == 2:
                    value = parts[1].strip()
                    if not (value.startswith('"') or value.startswith("'")):
                        line = f"{parts[0]}entity_id: '{value}'"
            
            fixed_lines.append(line)
        
        return '\n'.join(fixed_lines)

    def _extract_entities_from_config(self, config_content: str) -> List[str]:
        """Extract entity IDs from configuration content."""
        import re
        # Pattern to match entity IDs
        entity_pattern = r'\b[a-zA-Z_]+\.[a-zA-Z0-9_]+\b'
        matches = re.findall(entity_pattern, config_content)
        
        # Filter to only valid entity IDs
        valid_entities = []
        for match in matches:
            if '.' in match and len(match.split('.')) == 2:
                domain, entity = match.split('.')
                if len(domain) > 0 and len(entity) > 0:
                    valid_entities.append(match)
        
        return list(set(valid_entities))

    async def _generate_explanation(
        self,
        config_yaml: str,
        config_type: str,
        entities_used: List[str]
    ) -> str:
        """Generate an explanation of what the configuration does."""
        try:
            if self._llm_client and self._llm_client.is_configured:
                response = await self._llm_client.explain_config(
                    config_yaml=config_yaml,
                    config_type=config_type,
                    max_tokens=200,
                    temperature=0.3
                )
                return response.content
        except Exception as err:
            _LOGGER.debug("Could not generate explanation: %s", err)

        # Fallback to simple explanation
        entity_names = []
        for entity_id in entities_used:
            if entity_id in self._entity_manager._entities_cache:
                entity_info = self._entity_manager._entities_cache[entity_id]
                entity_names.append(entity_info.name)

        if entity_names:
            return f"This {config_type} works with: {', '.join(entity_names)}"
        else:
            return f"This {config_type} configuration has been generated based on your request."

    async def validate_config(
        self,
        config_yaml: str,
        config_type: str,
        **kwargs
    ) -> ValidationResult:
        """Validate a configuration."""
        try:
            errors = []
            warnings = []
            suggestions = []

            # Basic YAML validation
            try:
                yaml.safe_load(config_yaml)
            except yaml.YAMLError as err:
                errors.append(f"Invalid YAML syntax: {err}")
                return ValidationResult(
                    valid=False,
                    errors=errors,
                    warnings=warnings,
                    suggestions=suggestions
                )

            # Extract and validate entity references
            entities_used = self._extract_entities_from_config(config_yaml)
            for entity_id in entities_used:
                if entity_id not in self._entity_manager._entities_cache:
                    warnings.append(f"Entity '{entity_id}' not found")

            # Configuration-specific validation
            if config_type == "automation":
                errors.extend(self._validate_automation_config(config_yaml))
            elif config_type == "script":
                errors.extend(self._validate_script_config(config_yaml))

            # Use LLM for additional validation if available
            if self._llm_client and self._llm_client.is_configured:
                try:
                    response = await self._llm_client.validate_config(
                        config_yaml=config_yaml,
                        config_type=config_type,
                        **kwargs
                    )
                    
                    # Parse LLM response
                    llm_result = json.loads(response.content)
                    errors.extend(llm_result.get("errors", []))
                    warnings.extend(llm_result.get("warnings", []))
                    suggestions.extend(llm_result.get("suggestions", []))
                    
                except Exception as err:
                    _LOGGER.debug("LLM validation failed: %s", err)

            return ValidationResult(
                valid=len(errors) == 0,
                errors=errors,
                warnings=warnings,
                suggestions=suggestions
            )

        except Exception as err:
            _LOGGER.error("Error validating configuration: %s", err)
            return ValidationResult(
                valid=False,
                errors=[f"Validation error: {err}"],
                warnings=[],
                suggestions=[]
            )

    def _validate_automation_config(self, config_yaml: str) -> List[str]:
        """Validate automation-specific configuration."""
        errors = []
        try:
            config = yaml.safe_load(config_yaml)
            
            # Check for required fields
            if not isinstance(config, dict):
                errors.append("Automation must be a dictionary")
                return errors
            
            if "trigger" not in config:
                errors.append("Automation must have at least one trigger")
            
            if "action" not in config:
                errors.append("Automation must have at least one action")
                
        except Exception as err:
            errors.append(f"Automation validation error: {err}")
            
        return errors

    def _validate_script_config(self, config_yaml: str) -> List[str]:
        """Validate script-specific configuration."""
        errors = []
        try:
            config = yaml.safe_load(config_yaml)
            
            # Check for required fields
            if not isinstance(config, dict):
                errors.append("Script must be a dictionary")
                return errors
            
            if "sequence" not in config:
                errors.append("Script must have a sequence of actions")
                
        except Exception as err:
            errors.append(f"Script validation error: {err}")
            
        return errors