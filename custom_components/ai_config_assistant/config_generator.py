"""Configuration generator for AI Configuration Assistant."""
import logging
from typing import Any, Dict, List, Optional, Set
from dataclasses import dataclass
import os
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
    SENSOR_PROMPT,
    HELPER_PROMPT,
    CONFIG_TYPES,
)
from .llm_client import LLMClientManager, LLMMessage
from .entity_manager import EntityManager
from .conversation_agent import ConversationAgentManager
from .config_analyzer import ConfigAnalyzer, AnalysisResult

_LOGGER = logging.getLogger(__name__)

LAST_SYSTEM_PROMPT = None

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
        self._conversation_agent_manager: Optional[ConversationAgentManager] = None
        self._use_conversation_agent: bool = False
        self._conversation_agent_id: Optional[str] = None
        self._config_analyzer: Optional[ConfigAnalyzer] = None

    def setup(
        self, 
        llm_client: LLMClientManager, 
        entity_manager: EntityManager,
        use_conversation_agent: bool = False,
        conversation_agent_id: Optional[str] = None
    ) -> None:
        """Set up the configuration generator."""
        self._llm_client = llm_client
        self._entity_manager = entity_manager
        self._use_conversation_agent = use_conversation_agent
        self._conversation_agent_id = conversation_agent_id
        self._config_analyzer = ConfigAnalyzer(entity_manager)
        
        if use_conversation_agent:
            self._conversation_agent_manager = ConversationAgentManager(self.hass)
            _LOGGER.info("Conversation agent manager initialized for agent: %s", conversation_agent_id)

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
            # Check if we have the required components for the chosen method
            if self._use_conversation_agent and self._conversation_agent_id:
                # Using conversation agent - need conversation agent manager and entity manager
                if not self._conversation_agent_manager:
                    raise RuntimeError("Conversation agent manager not initialized")
                if not self._entity_manager:
                    raise RuntimeError("Entity manager not initialized")
            else:
                # Using direct LLM - need LLM client and entity manager
                if not self._llm_client or not self._llm_client.is_configured:
                    raise RuntimeError("LLM client not configured")
                if not self._entity_manager:
                    raise RuntimeError("Entity manager not initialized")

            # The old entity extraction logic is removed to allow the LLM to use the full context.
            suggested_entities = []
            if include_entities:
                suggested_entities.extend(include_entities)
            
            # Analyze the request to understand requirements
            if self._config_analyzer:
                all_entities = list(self._entity_manager._entities_cache.keys())
                analysis = await self._config_analyzer.analyze_request(
                    prompt, config_type, all_entities
                )
                
                _LOGGER.info("=" * 60)
                _LOGGER.info("REQUEST ANALYSIS")
                _LOGGER.info("=" * 60)
                _LOGGER.info("Config type: %s", config_type)
                _LOGGER.info("Can complete: %s", analysis.can_complete)
                _LOGGER.info("Missing entities: %s", analysis.missing_entities)
                _LOGGER.info("Workflow steps: %s", analysis.workflow_steps)
                _LOGGER.info("Explanation: %s", analysis.explanation)
                _LOGGER.info("=" * 60)
                
                # Only check for missing entities if we have NO entities at all of the required types
                # This prevents false positives while still catching cases where entity types are completely missing
                if config_type in ['automation', 'script']:
                    # Look for entities that would be needed based on the prompt
                    required_check = await self._check_required_entities(prompt, all_entities)
                    # Only show clarification if we have missing entity TYPES (not just specific entities)
                    if required_check['missing_types']:
                        return await self._generate_clarification_response(
                            prompt, config_type, required_check, all_entities
                        )
                
                # If we need to create sensors first, return guidance
                if not analysis.can_complete and config_type in ['dashboard', 'lovelace', 'card']:
                    return await self._generate_guided_response(analysis, prompt, config_type)
            
            _LOGGER.info("=" * 60)
            _LOGGER.info("ENTITY SELECTION DEBUG")
            _LOGGER.info("=" * 60)
            _LOGGER.info("Config type: %s", config_type)
            _LOGGER.info("Prompt: %s", prompt)
            _LOGGER.info("Entities from prompt extraction: %d", len(suggested_entities))
            _LOGGER.info("Entities from include_entities: %d", len(include_entities) if include_entities else 0)
            _LOGGER.info("Total entity IDs to use: %d", len(suggested_entities))
            if suggested_entities:
                _LOGGER.info("First 10 entity IDs: %s", suggested_entities[:10])
            _LOGGER.info("=" * 60)

            # Build context with entity information
            generation_context = await self._build_generation_context(
                prompt, config_type, suggested_entities, context
            )

            # Select appropriate prompt template
            system_prompt = self._get_system_prompt(config_type, generation_context)
            
            _LOGGER.info("Config type for prompt selection: %s", config_type)
            _LOGGER.info("System prompt length: %d characters", len(system_prompt))
            _LOGGER.info("System prompt preview: %s", system_prompt)

            # Generate the configuration
            if self._use_conversation_agent and self._conversation_agent_id:
                # Use conversation agent instead of direct LLM
                _LOGGER.info("Using conversation agent for generation: %s", self._conversation_agent_id)
                agent_result = await self._conversation_agent_manager.generate_config_with_agent(
                    agent_id=self._conversation_agent_id,
                    prompt=prompt,
                    config_type=config_type,
                    entities=suggested_entities,
                )
                
                if agent_result["success"]:
                    response_content = agent_result["config"]
                    explanation = agent_result.get("explanation", "")
                else:
                    raise RuntimeError(agent_result.get("error", "Conversation agent failed"))
            else:
                # Use direct LLM client
                response = await self._llm_client.generate_config(
                    prompt=prompt,
                    system_prompt=system_prompt,
                    **kwargs
                )
                response_content = response.content
                explanation = None

            # Post-process the generated configuration
            processed_result = await self._post_process_config(
                response_content, config_type, suggested_entities
            )
            
            # Use provided explanation if available
            if explanation:
                processed_result["explanation"] = explanation

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
            "areas": [],
            "existing_config": "",
        }

        # Smart entity filtering based on installation size
        all_entities = self._entity_manager.get_all_entities()
        total_entities = len(all_entities)
        
        _LOGGER.info("Total entities in system: %d", total_entities)
        
        # Determine filtering strategy
        if total_entities <= 100:
            # Small installation - include all entities
            context["entities"] = all_entities
            _LOGGER.info("Small installation - including all %d entities", total_entities)
            
        elif total_entities <= 500:
            # Medium installation - smart filtering based on request
            filtered_entities = await self._smart_filter_entities(
                prompt, config_type, all_entities, max_entities=150
            )
            context["entities"] = filtered_entities
            _LOGGER.info("Medium installation - filtered to %d relevant entities", len(filtered_entities))
            
        else:
            # Large installation - aggressive filtering
            filtered_entities = await self._smart_filter_entities(
                prompt, config_type, all_entities, max_entities=75
            )
            context["entities"] = filtered_entities
            _LOGGER.info("Large installation - filtered to %d most relevant entities", len(filtered_entities))

        # Get all areas (usually not too many)
        context["areas"] = self._entity_manager.get_all_areas()

        # Get existing automations and scripts for context (only for relevant types)
        if config_type in ["automation", "script"]:
            existing = await self._get_existing_config()
            # Limit existing config size for large installations
            if len(existing) > 5000:
                existing = existing[:5000] + "\n... (truncated for context limit)"
            context["existing_config"] = existing

        # Add user context
        if user_context:
            context.update(user_context)

        # Get available services for certain config types
        if config_type in ["automation", "script"]:
            context["services"] = self._get_available_services()

        return context
    
    async def _smart_filter_entities(
        self,
        prompt: str,
        config_type: str,
        all_entities: Dict[str, Any],
        max_entities: int = 100
    ) -> Dict[str, Any]:
        """Smart filter entities based on the request context."""
        
        prompt_lower = prompt.lower()
        filtered = {}
        
        # Priority 1: Entities explicitly mentioned or suggested
        suggested_entities = await self._extract_entities_from_prompt(prompt)
        for entity_id in suggested_entities:
            if entity_id in all_entities:
                filtered[entity_id] = all_entities[entity_id]
        
        # Priority 2: Entities matching request keywords
        keywords = self._extract_keywords(prompt_lower)
        for entity_id, entity_info in all_entities.items():
            if len(filtered) >= max_entities:
                break
            
            if entity_id in filtered:
                continue
                
            # Check if entity matches keywords
            entity_str = f"{entity_id} {entity_info.name}".lower()
            if any(keyword in entity_str for keyword in keywords):
                filtered[entity_id] = entity_info
        
        # Priority 3: Entities from relevant domains
        relevant_domains = self._get_relevant_domains(prompt_lower, config_type)
        for entity_id, entity_info in all_entities.items():
            if len(filtered) >= max_entities:
                break
                
            if entity_id in filtered:
                continue
                
            domain = entity_id.split('.')[0]
            if domain in relevant_domains:
                filtered[entity_id] = entity_info
        
        # Priority 4: Recently changed entities (likely to be active/important)
        if len(filtered) < max_entities // 2:
            # Sort by last_changed if available
            sorted_entities = sorted(
                all_entities.items(),
                key=lambda x: x[1].last_changed if hasattr(x[1], 'last_changed') else '',
                reverse=True
            )
            
            for entity_id, entity_info in sorted_entities:
                if len(filtered) >= max_entities:
                    break
                    
                if entity_id not in filtered:
                    # Skip certain domains that are rarely useful
                    domain = entity_id.split('.')[0]
                    if domain not in ['zone', 'persistent_notification', 'person', 'device_tracker']:
                        filtered[entity_id] = entity_info
        
        return filtered
    
    def _extract_keywords(self, prompt_lower: str) -> List[str]:
        """Extract relevant keywords from the prompt."""
        # Remove common words
        stop_words = {'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
                     'of', 'with', 'by', 'from', 'when', 'if', 'then', 'create', 'make',
                     'turn', 'set', 'get', 'show', 'display', 'add'}
        
        words = prompt_lower.split()
        keywords = [w for w in words if len(w) > 2 and w not in stop_words]
        
        return keywords
    
    def _get_relevant_domains(self, prompt_lower: str, config_type: str) -> List[str]:
        """Get relevant entity domains based on the request."""
        domains = []
        
        # Config type specific domains
        if config_type == 'automation':
            domains.extend(['binary_sensor', 'sensor', 'switch', 'light', 'input_boolean'])
        elif config_type in ['dashboard', 'lovelace', 'card']:
            domains.extend(['sensor', 'binary_sensor', 'switch', 'light', 'climate', 'weather'])
        elif config_type == 'script':
            domains.extend(['switch', 'light', 'media_player', 'climate', 'cover'])
        
        # Add domains based on keywords
        if 'light' in prompt_lower:
            domains.append('light')
        if 'switch' in prompt_lower or 'plug' in prompt_lower:
            domains.append('switch')
        if 'sensor' in prompt_lower or 'temperature' in prompt_lower or 'humidity' in prompt_lower:
            domains.append('sensor')
        if 'motion' in prompt_lower or 'door' in prompt_lower or 'window' in prompt_lower:
            domains.append('binary_sensor')
        if 'climate' in prompt_lower or 'thermostat' in prompt_lower:
            domains.append('climate')
        if 'camera' in prompt_lower:
            domains.append('camera')
        if 'media' in prompt_lower or 'tv' in prompt_lower or 'speaker' in prompt_lower:
            domains.append('media_player')
        
        return list(set(domains))  # Remove duplicates
    
    async def _extract_entities_from_prompt(self, prompt: str) -> List[str]:
        """Extract potential entity references from the user prompt."""
        entities = []
        words = prompt.lower().split()
        
        # Look for common entity-related terms
        entity_terms = {
            "light", "lights", "lamp", "lamps",
            "switch", "switches", "outlet", "plug",
            "sensor", "sensors", "temperature", "humidity", "motion",
            "door", "doors", "window", "windows",
            "camera", "cameras",
            "fan", "fans",
            "thermostat", "climate", "hvac",
            "lock", "locks",
            "garage", "gate",
            "vacuum", "robot",
            "media", "tv", "television", "speaker",
        }

        # Room/area terms
        area_terms = {
            "living room", "bedroom", "kitchen", "bathroom", "garage",
            "office", "dining room", "basement", "attic", "hallway",
            "patio", "deck", "yard", "garden", "master", "guest"
        }

        # Get entity suggestions based on terms found
        for term in entity_terms:
            if term in prompt.lower():
                suggestions = await self._entity_manager.get_entity_suggestions(
                    query=term, limit=5
                )
                entities.extend([s.entity_id for s in suggestions])

        # Get entities from areas mentioned
        for area_term in area_terms:
            if area_term in prompt.lower():
                area_entities = await self._entity_manager.get_entities_by_area(area_term)
                entities.extend([e.entity_id for e in area_entities[:5]])

        return list(set(entities))  # Remove duplicates

    def _get_system_prompt(self, config_type: str, context: Dict[str, Any]) -> str:
        """Get the appropriate system prompt for the configuration type."""
        # Format entity information
        entities_info = []
        for entity_id, info in context.get("entities", {}).items():
            state = info.state
            attributes = info.attributes
            entities_info.append(f"- {entity_id}:")
            entities_info.append(f"    name: {info.name}")
            entities_info.append(f"    state: {state}")
            if attributes:
                entities_info.append(f"    attributes: {attributes}")

        entities_text = "\n".join(entities_info) if entities_info else "No entities found."

        # Format areas
        areas_text = "\n".join(f"- {area}" for area in context.get("areas", [])) if context.get("areas") else "No areas found."

        # Select prompt template
        if config_type == "automation":
            template = AUTOMATION_PROMPT
        elif config_type in ["dashboard", "lovelace", "card"]:
            template = DASHBOARD_PROMPT
        elif config_type == "script":
            template = SCRIPT_PROMPT
        elif config_type in ["sensor", "binary_sensor", "template"]:
            template = SENSOR_PROMPT
        elif config_type in ["helper", "input_boolean", "input_number", "input_text", "input_select", "input_datetime", "input_button"]:
            template = HELPER_PROMPT
        else:
            # Generic template
            template = f"""
Create a Home Assistant {config_type} configuration based on this request: {{prompt}}

Available entities:
{{entities}}

Current time: {{current_time}}
Areas: {{areas}}
Existing Config: {{existing_config}}

Generate a complete YAML {config_type} configuration.
Respond with valid YAML only.
"""

        # Remove the {prompt} placeholder from the template since the prompt
        # is passed separately as the user message
        formatted_template = template.replace("{prompt}", "[USER REQUEST WILL BE PROVIDED SEPARATELY]")

        final_prompt = formatted_template.format(
            entities=entities_text,
            areas=areas_text,
            existing_config=context.get("existing_config", ""),
            current_time=context.get("current_time", ""),
            services=context.get("services", "")
        )

        # Remove debug file writing - use logging instead
        _LOGGER.debug("Generated system prompt (length: %d chars)", len(final_prompt))
        
        global LAST_SYSTEM_PROMPT
        LAST_SYSTEM_PROMPT = final_prompt

        return final_prompt

    async def _get_existing_config(self) -> str:
        """Get existing automations and scripts to provide as context."""

        def read_file(path):
            if not os.path.exists(path):
                return None
            with open(path, 'r') as f:
                return f.read()

        config_dir = self.hass.config.path()
        automations_path = self.hass.config.path("automations.yaml")
        scripts_path = self.hass.config.path("scripts.yaml")

        config_parts = []

        try:
            automations = await self.hass.async_add_executor_job(read_file, automations_path)
            if automations:
                config_parts.append("## Automations")
                config_parts.append(automations)
        except Exception as e:
            _LOGGER.warning(f"Could not read automations.yaml: {e}")

        try:
            scripts = await self.hass.async_add_executor_job(read_file, scripts_path)
            if scripts:
                config_parts.append("## Scripts")
                config_parts.append(scripts)
        except Exception as e:
            _LOGGER.warning(f"Could not read scripts.yaml: {e}")

        if not config_parts:
            return "No existing automations or scripts found."

        return "\n".join(config_parts)

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
    
    async def _generate_guided_response(
        self,
        analysis: AnalysisResult,
        prompt: str,
        config_type: str
    ) -> GenerationResult:
        """Generate a guided response when entities are missing."""
        
        # Build YAML response with guidance
        yaml_parts = []
        
        # Add a markdown card explaining what's needed
        yaml_parts.append("# Dashboard configuration with guidance")
        yaml_parts.append("cards:")
        yaml_parts.append("  - type: markdown")
        yaml_parts.append("    content: |")
        yaml_parts.append("      ## ⚠️ Configuration Requirements")
        yaml_parts.append("      ")
        yaml_parts.append(f"      Your request: \"{prompt}\"")
        yaml_parts.append("      ")
        
        if analysis.missing_entities:
            yaml_parts.append("      ### Missing Required Entities")
            yaml_parts.append("      The following entities need to be created first:")
            for entity in analysis.missing_entities:
                yaml_parts.append(f"      - `{entity}`")
            yaml_parts.append("      ")
        
        if analysis.workflow_steps:
            yaml_parts.append("      ### Recommended Steps")
            for i, step in enumerate(analysis.workflow_steps, 1):
                yaml_parts.append(f"      {i}. {step}")
            yaml_parts.append("      ")
        
        # If we have requirements for sensors, generate example configs
        sensor_reqs = [r for r in analysis.requirements if r.config_type == 'sensor']
        if sensor_reqs:
            yaml_parts.append("      ### Example Template Sensor")
            yaml_parts.append("      ```yaml")
            yaml_parts.append("      # Add this to your configuration.yaml")
            yaml_parts.append("      template:")
            yaml_parts.append("        - sensor:")
            
            for req in sensor_reqs:
                if req.suggested_name:
                    yaml_parts.append(f"            - name: {req.suggested_name}")
                    yaml_parts.append(f"              unique_id: {req.suggested_name}")
                    yaml_parts.append("              state: >")
                    
                    # Provide example based on request type
                    if 'energy' in prompt.lower() or 'usage' in prompt.lower():
                        yaml_parts.append("                # Example: Calculate daily energy usage")
                        if req.required_entities:
                            yaml_parts.append(f"                {{{{ states('{req.required_entities[0]}') | float(0) }}}}")
                        else:
                            yaml_parts.append("                {{ states('sensor.your_power_meter') | float(0) }}")
                        yaml_parts.append("              unit_of_measurement: 'kWh'")
                        yaml_parts.append("              device_class: energy")
                        yaml_parts.append("              state_class: total_increasing")
                    elif 'average' in prompt.lower():
                        yaml_parts.append("                # Example: Calculate average")
                        yaml_parts.append("                {% set sensors = ['sensor.sensor1', 'sensor.sensor2'] %}")
                        yaml_parts.append("                {{ (sensors | map('states') | map('float', 0) | sum) / sensors | length }}")
                    else:
                        yaml_parts.append("                # Add your calculation here")
                        yaml_parts.append("                {{ 0 }}")
            
            yaml_parts.append("      ```")
            yaml_parts.append("      ")
            yaml_parts.append("      After creating the sensor, restart Home Assistant and regenerate this dashboard.")
        
        # Add available entities section if any exist
        if analysis.available_entities:
            yaml_parts.append("")
            yaml_parts.append("  - type: entities")
            yaml_parts.append("    title: Available Related Entities")
            yaml_parts.append("    entities:")
            for entity in analysis.available_entities[:5]:  # Show up to 5
                yaml_parts.append(f"      - {entity}")
        
        yaml_content = "\n".join(yaml_parts)
        
        explanation = (
            f"{analysis.explanation}\n\n"
            "I've created a dashboard with guidance on how to set up the required "
            "sensors. Once you've created the necessary template sensors and restarted "
            "Home Assistant, you can regenerate this configuration with all the data available."
        )
        
        return GenerationResult(
            config=yaml_content,
            explanation=explanation,
            entities_used=analysis.available_entities,
            warnings=["Missing entities detected - see guidance in the dashboard"],
            success=True
        )
    
    async def _check_required_entities(
        self,
        prompt: str,
        all_entities: List[str]
    ) -> Dict[str, Any]:
        """Check if required entities exist for the given prompt."""
        
        prompt_lower = prompt.lower()
        result = {
            'found_entities': [],
            'missing_types': [],
            'suggestions': {}
        }
        
        # Get all entity info for better matching
        entity_cache = self._entity_manager._entities_cache
        
        # Check for lights - be more flexible with matching
        if any(word in prompt_lower for word in ['light', 'lights', 'lamp', 'lamps', 'bulb']):
            lights = [e for e in all_entities if e.startswith('light.')]
            
            if lights:
                # We have lights, let the LLM figure out which ones based on context
                # Look for specific room mentions
                room_keywords = ['kitchen', 'bedroom', 'living', 'bathroom', 'basement', 
                               'office', 'dining', 'hallway', 'garage', 'patio', 'deck']
                
                for room in room_keywords:
                    if room in prompt_lower:
                        # Find lights that match the room
                        room_lights = [e for e in lights if room in e.lower() or 
                                     (e in entity_cache and room in entity_cache[e].name.lower())]
                        if room_lights:
                            result['found_entities'].extend(room_lights)
                        else:
                            # We have lights but not for this specific room - still OK, LLM can work with what's available
                            result['found_entities'].extend(lights[:3])
                        break
                else:
                    # No specific room mentioned, include some lights for context
                    result['found_entities'].extend(lights[:5])
            else:
                # No lights at all in the system
                result['missing_types'].append('any light entities')
        
        # Check for motion/occupancy sensors - only flag if really needed AND missing
        if any(word in prompt_lower for word in ['walk', 'motion', 'movement', 'someone', 'person', 'occupancy', 'presence']):
            motion_sensors = [e for e in all_entities if e.startswith('binary_sensor.') and 
                            any(term in e.lower() for term in ['motion', 'occupancy', 'presence', 'movement'])]
            
            if motion_sensors:
                # We have motion sensors, let LLM work with them
                # Check for specific location mentions
                locations = ['bathroom', 'kitchen', 'bedroom', 'living', 'hallway', 'basement', 'garage']
                for location in locations:
                    if location in prompt_lower:
                        location_sensors = [e for e in motion_sensors if location in e.lower() or
                                          (e in entity_cache and location in entity_cache[e].name.lower())]
                        if location_sensors:
                            result['found_entities'].extend(location_sensors)
                        else:
                            # Have sensors but not for this location - still provide what we have
                            result['found_entities'].extend(motion_sensors[:2])
                        break
                else:
                    # No specific location, include available sensors
                    result['found_entities'].extend(motion_sensors[:3])
            else:
                # No motion sensors at all - this is a real problem
                result['missing_types'].append('any motion/occupancy sensors')
                
        # Only return missing if we have NO entities of the required type at all
        # If we have some entities, even if not exact matches, let the LLM work with them
        
        return result
    
    async def _generate_clarification_response(
        self,
        prompt: str,
        config_type: str,
        required_check: Dict[str, Any],
        all_entities: List[str]
    ) -> GenerationResult:
        """Generate a response asking for clarification when entities are missing."""
        
        # Build YAML response asking for clarification
        yaml_parts = []
        yaml_parts.append("# ⚠️ Clarification Needed")
        yaml_parts.append("")
        yaml_parts.append("# I couldn't find the specific entities needed for your request:")
        yaml_parts.append(f"# \"{prompt}\"")
        yaml_parts.append("")
        
        if required_check['missing_types']:
            yaml_parts.append("# Missing entity types:")
            for missing_type in required_check['missing_types']:
                yaml_parts.append(f"#   - {missing_type}")
            yaml_parts.append("")
        
        # Show available alternatives
        if required_check['suggestions']:
            yaml_parts.append("# Available entities you might want to use instead:")
            yaml_parts.append("")
            
            for category, entities in required_check['suggestions'].items():
                if entities:
                    yaml_parts.append(f"# {category.replace('_', ' ').title()}:")
                    for entity in entities:
                        entity_obj = self._entity_manager._entities_cache.get(entity)
                        if entity_obj:
                            yaml_parts.append(f"#   - {entity} ({entity_obj.name})")
                        else:
                            yaml_parts.append(f"#   - {entity}")
                    yaml_parts.append("")
        
        # Provide guidance
        yaml_parts.append("# To proceed, you have several options:")
        yaml_parts.append("#")
        yaml_parts.append("# 1. Set up the missing devices in Home Assistant first")
        yaml_parts.append("# 2. If you have similar devices, try rephrasing with their names")
        yaml_parts.append("#")
        yaml_parts.append("# Example rephrased request:")
        
        # Generate example based on available entities
        if required_check['suggestions']:
            if 'lights' in required_check['suggestions'] and required_check['suggestions']['lights']:
                light_example = required_check['suggestions']['lights'][0]
                light_name = self._entity_manager._entities_cache.get(light_example, {}).name or light_example
            else:
                light_name = "your_light_name"
                
            if 'motion_sensors' in required_check['suggestions'] and required_check['suggestions']['motion_sensors']:
                motion_example = required_check['suggestions']['motion_sensors'][0]
                motion_name = self._entity_manager._entities_cache.get(motion_example, {}).name or motion_example
            else:
                motion_name = "your_motion_sensor"
            
            yaml_parts.append(f"# \"Turn on {light_name} when {motion_name} detects motion\"")
        else:
            yaml_parts.append("# \"Turn on [specific light entity] when [specific sensor] detects motion\"")
        
        yaml_content = "\n".join(yaml_parts)
        
        # Count available entities by type
        lights_count = len([e for e in all_entities if e.startswith('light.')])
        motion_count = len([e for e in all_entities if e.startswith('binary_sensor.') and 'motion' in e.lower()])
        
        explanation = (
            f"I need clarification to create this {config_type}.\n\n"
            f"Your request requires {', '.join(required_check['missing_types'])} which don't appear to exist in your Home Assistant.\n\n"
            f"You currently have {lights_count} lights and {motion_count} motion sensors configured.\n"
            "Please either:\n"
            "• Set up the missing devices in Home Assistant first\n"
            "• Rephrase your request using existing entity names"
        )
        
        return GenerationResult(
            config=yaml_content,
            explanation=explanation,
            entities_used=required_check.get('found_entities', []),
            warnings=["Please select or specify which entities to use"],
            success=True
        )