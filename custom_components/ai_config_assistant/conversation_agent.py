"""Conversation agent integration for AI Configuration Assistant."""
import logging
from typing import Any, Dict, List, Optional
import json

from homeassistant.core import HomeAssistant, Context
from homeassistant.components import conversation
from homeassistant.helpers import intent
from homeassistant.exceptions import HomeAssistantError

from .const import DOMAIN

_LOGGER = logging.getLogger(__name__)


class ConversationAgentManager:
    """Manager for interacting with Home Assistant conversation agents."""
    
    def __init__(self, hass: HomeAssistant) -> None:
        """Initialize the conversation agent manager."""
        self.hass = hass
        self._available_agents: Dict[str, Any] = {}
        
    async def get_available_agents(self) -> Dict[str, str]:
        """Get list of available conversation agents."""
        agents = {}
        
        # Check for configured conversation agents
        try:
            # Get all conversation agent entries
            for entry in self.hass.config_entries.async_entries():
                # Check for known conversation agent domains
                if entry.domain in ["openai_conversation", "google_generative_ai_conversation", 
                                   "anthropic", "ollama", "custom_conversation"]:
                    agents[entry.entry_id] = f"{entry.title} ({entry.domain})"
                    _LOGGER.info("Found conversation agent: %s", entry.title)
        except Exception as e:
            _LOGGER.error("Error getting conversation agents: %s", e)
            
        return agents
    
    async def process_with_agent(
        self,
        agent_id: str,
        text: str,
        conversation_id: Optional[str] = None,
        language: Optional[str] = None,
        context: Optional[Context] = None,
    ) -> Dict[str, Any]:
        """Process text using a specific conversation agent."""
        try:
            # Create a context if not provided
            if context is None:
                context = Context()
            
            # Use the conversation.process service
            result = await conversation.async_converse(
                self.hass,
                text,
                conversation_id=conversation_id,
                context=context,
                language=language,
                agent_id=agent_id,
            )
            
            return {
                "success": True,
                "response": result.response.speech.get("plain", {}).get("speech", ""),
                "conversation_id": result.conversation_id,
                "agent_id": agent_id,
            }
            
        except Exception as e:
            _LOGGER.error("Error processing with conversation agent: %s", e)
            return {
                "success": False,
                "error": str(e),
            }
    
    async def generate_config_with_agent(
        self,
        agent_id: str,
        prompt: str,
        config_type: str,
        entities: Optional[List[str]] = None,
    ) -> Dict[str, Any]:
        """Generate configuration using a conversation agent."""
        try:
            # Build a detailed prompt for the conversation agent
            system_context = self._build_system_context(config_type, entities)
            
            # Combine system context with user prompt
            full_prompt = f"""{system_context}

User request: {prompt}

Please generate a valid YAML configuration for this request."""
            
            # Process with the conversation agent
            result = await self.process_with_agent(
                agent_id=agent_id,
                text=full_prompt,
                context=Context(),
            )
            
            if not result["success"]:
                return {
                    "success": False,
                    "error": result.get("error", "Failed to generate configuration"),
                }
            
            # Extract YAML from response
            response_text = result["response"]
            config_yaml = self._extract_yaml_from_response(response_text)
            
            return {
                "success": True,
                "config": config_yaml,
                "explanation": response_text,
                "agent_used": agent_id,
            }
            
        except Exception as e:
            _LOGGER.error("Error generating config with conversation agent: %s", e)
            return {
                "success": False,
                "error": str(e),
            }
    
    def _build_system_context(self, config_type: str, entities: Optional[List[str]] = None) -> str:
        """Build system context for the conversation agent."""
        context = f"""You are helping to create a Home Assistant {config_type} configuration.

Generate a valid YAML configuration based on the user's request.
The configuration should be properly formatted and follow Home Assistant conventions."""
        
        if entities:
            entity_list = "\n".join(f"- {entity}" for entity in entities[:20])
            context += f"""

Available entities that might be relevant:
{entity_list}"""
        
        if config_type == "automation":
            context += """

The automation should have:
- alias: A descriptive name
- description: What the automation does
- trigger: One or more triggers
- condition: (optional) One or more conditions
- action: One or more actions
- mode: single, parallel, queued, or restart"""
        elif config_type == "script":
            context += """

The script should have:
- alias: A descriptive name
- description: What the script does
- sequence: List of actions to perform
- mode: (optional) single, parallel, queued, or restart"""
        elif config_type == "dashboard":
            context += """

The dashboard configuration should have:
- title: Dashboard title
- path: URL path for the dashboard
- cards: List of card configurations"""
        
        return context
    
    def _extract_yaml_from_response(self, response: str) -> str:
        """Extract YAML content from conversation agent response."""
        # Look for YAML code blocks
        lines = response.split('\n')
        yaml_lines = []
        in_yaml = False
        
        for line in lines:
            if line.strip().startswith('```yaml') or line.strip().startswith('```'):
                if not in_yaml:
                    in_yaml = True
                    continue
                else:
                    break
            elif in_yaml:
                yaml_lines.append(line)
        
        if yaml_lines:
            return '\n'.join(yaml_lines)
        
        # If no code block found, try to extract YAML-like content
        yaml_start = -1
        yaml_end = len(lines)
        
        for i, line in enumerate(lines):
            # Look for YAML-like structure
            if ':' in line and not line.strip().startswith('#'):
                if yaml_start == -1:
                    yaml_start = i
            elif yaml_start != -1 and line.strip() == '':
                # Empty line might indicate end of YAML
                continue
            elif yaml_start != -1 and not line.startswith(' ') and ':' not in line:
                # Non-indented line without colon might be end of YAML
                yaml_end = i
                break
        
        if yaml_start != -1:
            return '\n'.join(lines[yaml_start:yaml_end])
        
        # Return full response if no YAML found
        return response
    
    async def check_agent_capabilities(self, agent_id: str) -> Dict[str, bool]:
        """Check what capabilities a conversation agent has."""
        capabilities = {
            "can_control_home": False,
            "supports_tools": False,
            "supports_context": False,
        }
        
        try:
            # Get the config entry for the agent
            entry = self.hass.config_entries.async_get_entry(agent_id)
            if entry:
                # Check domain-specific capabilities
                if entry.domain in ["openai_conversation", "google_generative_ai_conversation"]:
                    capabilities["can_control_home"] = True
                    capabilities["supports_tools"] = True
                    capabilities["supports_context"] = True
                elif entry.domain == "anthropic":
                    capabilities["supports_context"] = True
                elif entry.domain == "ollama":
                    # Ollama support depends on the model
                    capabilities["supports_context"] = True
                    
        except Exception as e:
            _LOGGER.error("Error checking agent capabilities: %s", e)
            
        return capabilities