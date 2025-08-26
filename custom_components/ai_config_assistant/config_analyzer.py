"""Configuration request analyzer for AI Configuration Assistant."""
import logging
import re
from typing import Dict, List, Optional, Set, Tuple
from dataclasses import dataclass

_LOGGER = logging.getLogger(__name__)

@dataclass
class ConfigurationRequirement:
    """Represents a configuration requirement."""
    config_type: str
    description: str
    dependencies: List[str]
    required_entities: List[str]
    suggested_name: Optional[str] = None

@dataclass 
class AnalysisResult:
    """Result of configuration analysis."""
    requirements: List[ConfigurationRequirement]
    missing_entities: List[str]
    available_entities: List[str]
    workflow_steps: List[str]
    can_complete: bool
    explanation: str

class ConfigAnalyzer:
    """Analyzes configuration requests to determine requirements."""
    
    # Keywords that indicate need for calculated/derived values
    CALCULATION_KEYWORDS = {
        'total', 'sum', 'average', 'mean', 'combined', 'aggregate',
        'daily', 'weekly', 'monthly', 'yearly', 'hourly', 'today',
        'usage', 'consumption', 'cost', 'efficiency', 'spent',
        'difference', 'delta', 'change', 'increase', 'decrease',
        'percentage', 'ratio', 'rate', 'speed',
        'maximum', 'minimum', 'peak', 'lowest', 'highest',
        'calculate', 'compute', 'derive', 'track'
    }
    
    # Keywords that indicate need for specific sensor types
    SENSOR_TYPE_KEYWORDS = {
        'energy': ['energy', 'power', 'kwh', 'kilowatt', 'watts', 'watt', 'electricity', 'solar', 'consumption'],
        'temperature': ['temperature', 'temp', 'degrees', 'celsius', 'fahrenheit', 'thermal', 'heat', 'cold'],
        'humidity': ['humidity', 'moisture', 'wet', 'dry', 'humid'],
        'motion': ['motion', 'movement', 'occupancy', 'presence', 'detected', 'activity'],
        'door': ['door', 'entry', 'exit', 'entrance', 'doorway'],
        'window': ['window', 'opening'],
        'light': ['light', 'brightness', 'illumination', 'lux', 'lamp', 'bulb'],
        'water': ['water', 'flow', 'leak', 'usage', 'gallons', 'liters', 'consumption'],
        'gas': ['gas', 'natural gas', 'propane', 'usage'],
        'weather': ['weather', 'forecast', 'rain', 'snow', 'wind', 'storm', 'precipitation'],
        'switch': ['switch', 'toggle', 'outlet', 'plug'],
        'climate': ['climate', 'thermostat', 'hvac', 'heating', 'cooling', 'ac', 'air conditioning']
    }
    
    # Dashboard card types and their typical entity requirements
    CARD_ENTITY_REQUIREMENTS = {
        'gauge': ['sensor', 'number'],
        'statistics-graph': ['sensor'],
        'energy': ['sensor'],
        'thermostat': ['climate'],
        'light': ['light'],
        'weather-forecast': ['weather'],
        'picture-glance': ['camera'],
        'media-control': ['media_player'],
        'history-graph': ['sensor', 'binary_sensor']
    }

    def __init__(self, entity_manager):
        """Initialize the analyzer."""
        self.entity_manager = entity_manager
        
    async def analyze_request(
        self, 
        prompt: str, 
        config_type: str,
        available_entities: List[str]
    ) -> AnalysisResult:
        """Analyze a configuration request to determine requirements using keyword analysis."""
        
        prompt_lower = prompt.lower()
        requirements = []
        missing_entities = []
        workflow_steps = []
        
        # Check if this is a dashboard/card request that needs calculated values
        if config_type in ['dashboard', 'lovelace', 'card']:
            dashboard_analysis = await self._analyze_dashboard_request(
                prompt_lower, available_entities
            )
            requirements.extend(dashboard_analysis['requirements'])
            missing_entities.extend(dashboard_analysis['missing'])
            workflow_steps.extend(dashboard_analysis['steps'])
            
        # Check if calculation/aggregation is needed for any config type
        elif self._needs_calculation(prompt_lower):
            calc_analysis = await self._analyze_calculation_request(
                prompt_lower, config_type, available_entities
            )
            requirements.extend(calc_analysis['requirements'])
            missing_entities.extend(calc_analysis['missing'])
            workflow_steps.extend(calc_analysis['steps'])
            
        # Standard configuration request
        else:
            standard_analysis = await self._analyze_standard_request(
                prompt_lower, config_type, available_entities
            )
            requirements.extend(standard_analysis['requirements'])
            missing_entities.extend(standard_analysis['missing'])
            workflow_steps.extend(standard_analysis['steps'])
        
        # Determine if we can complete the request
        # Sensors and helpers can be created, so they're always completable
        can_complete = len(missing_entities) == 0 or config_type in ['sensor', 'template', 'helper', 'input_boolean', 'input_number']
        
        # Generate explanation
        explanation = self._generate_explanation(
            requirements, missing_entities, workflow_steps, can_complete
        )
        
        return AnalysisResult(
            requirements=requirements,
            missing_entities=missing_entities,
            available_entities=available_entities,
            workflow_steps=workflow_steps,
            can_complete=can_complete,
            explanation=explanation
        )
    
    def _needs_calculation(self, prompt_lower: str) -> bool:
        """Check if the request needs calculated/derived values."""
        # Check for explicit calculation keywords
        for keyword in self.CALCULATION_KEYWORDS:
            if keyword in prompt_lower:
                return True
        
        # Check for patterns that suggest calculation
        calculation_patterns = [
            r'\b\d+\s*(hours?|minutes?|days?|weeks?|months?)\b',  # Time periods
            r'\bhow\s+(much|many)\b',  # Quantity questions
            r'\btotal\s+\w+\b',  # Total anything
            r'\baverage\s+\w+\b',  # Average anything
            r'\bper\s+(day|hour|week|month)\b',  # Rate calculations
        ]
        
        for pattern in calculation_patterns:
            if re.search(pattern, prompt_lower):
                return True
                
        return False
    
    async def _analyze_dashboard_request(
        self, 
        prompt_lower: str,
        available_entities: List[str]
    ) -> Dict:
        """Analyze a dashboard/card configuration request."""
        
        requirements = []
        missing = []
        steps = []
        
        # Detect what type of data is being requested
        requested_types = self._detect_requested_entity_types(prompt_lower)
        
        # Special handling for energy dashboards
        if 'energy' in requested_types and self._needs_calculation(prompt_lower):
            # User wants energy calculations shown on dashboard
            sensor_names = []
            
            if 'today' in prompt_lower or 'daily' in prompt_lower:
                sensor_names.append('daily_energy_usage')
            if 'cost' in prompt_lower:
                sensor_names.append('energy_cost')
            if 'solar' in prompt_lower:
                sensor_names.append('solar_production')
            
            # Default to daily usage if no specific calculation detected
            if not sensor_names:
                sensor_names.append('energy_consumption')
            
            for sensor_name in sensor_names:
                requirements.append(ConfigurationRequirement(
                    config_type='sensor',
                    description=f'Template sensor to calculate {sensor_name}',
                    dependencies=[],
                    required_entities=self._find_related_entities(
                        ['energy', 'power'], available_entities
                    ),
                    suggested_name=sensor_name
                ))
                missing.append(f'sensor.{sensor_name}')
            
            requirements.append(ConfigurationRequirement(
                config_type='dashboard',
                description='Dashboard cards to display energy data',
                dependencies=[f'sensor.{name}' for name in sensor_names],
                required_entities=[f'sensor.{name}' for name in sensor_names]
            ))
            
            steps.append(f'1. Create template sensor(s): {", ".join(sensor_names)}')
            steps.append('2. Restart Home Assistant to load new sensors')
            steps.append('3. Create dashboard with energy cards')
            
        elif self._needs_calculation(prompt_lower):
            # General calculation needed
            sensor_name = self._suggest_sensor_name(prompt_lower)
            
            requirements.append(ConfigurationRequirement(
                config_type='sensor',
                description=f'Template sensor to calculate {sensor_name}',
                dependencies=[],
                required_entities=self._find_related_entities(
                    requested_types, available_entities
                ),
                suggested_name=sensor_name
            ))
            
            requirements.append(ConfigurationRequirement(
                config_type='dashboard',
                description='Dashboard card to display the calculated value',
                dependencies=[f'sensor.{sensor_name}'],
                required_entities=[f'sensor.{sensor_name}']
            ))
            
            missing.append(f'sensor.{sensor_name}')
            steps.append(f'1. Create template sensor: sensor.{sensor_name}')
            steps.append('2. Create dashboard card using the new sensor')
            
        else:
            # Check if required entities exist
            required_entities = self._find_related_entities(
                requested_types, available_entities
            )
            
            if not required_entities and requested_types:
                # No matching entities found
                for entity_type in requested_types:
                    example_entities = self._suggest_entity_examples(entity_type)
                    missing.extend(example_entities)
                
                steps.append('Configure the required entities in Home Assistant')
                steps.append('Then regenerate this dashboard configuration')
            else:
                requirements.append(ConfigurationRequirement(
                    config_type='dashboard',
                    description='Dashboard configuration with available entities',
                    dependencies=[],
                    required_entities=required_entities
                ))
                steps.append('Create dashboard with available entities')
        
        return {
            'requirements': requirements,
            'missing': missing,
            'steps': steps
        }
    
    async def _analyze_calculation_request(
        self,
        prompt_lower: str,
        config_type: str,
        available_entities: List[str]
    ) -> Dict:
        """Analyze a request that needs calculated values."""
        
        requirements = []
        missing = []
        steps = []
        
        # Suggest a sensor name based on the request
        sensor_name = self._suggest_sensor_name(prompt_lower)
        
        # Find entities that might be used in calculation
        requested_types = self._detect_requested_entity_types(prompt_lower)
        source_entities = self._find_related_entities(requested_types, available_entities)
        
        requirements.append(ConfigurationRequirement(
            config_type='sensor',
            description=f'Template sensor for calculation: {sensor_name}',
            dependencies=[],
            required_entities=source_entities,
            suggested_name=sensor_name
        ))
        
        if not source_entities:
            # Suggest what kind of source sensors might be needed
            for entity_type in requested_types:
                missing.extend(self._suggest_entity_examples(entity_type))
            
            if not requested_types:
                missing.append('sensor.source_data')
            
            steps.append('Configure source sensors for calculation')
        
        steps.append(f'Create template sensor: sensor.{sensor_name}')
        
        return {
            'requirements': requirements,
            'missing': missing,
            'steps': steps
        }
    
    async def _analyze_standard_request(
        self,
        prompt_lower: str,
        config_type: str,
        available_entities: List[str]
    ) -> Dict:
        """Analyze a standard configuration request."""
        
        requirements = []
        missing = []
        steps = []
        
        # Find entities mentioned or implied in the request
        requested_types = self._detect_requested_entity_types(prompt_lower)
        required_entities = self._find_related_entities(requested_types, available_entities)
        
        requirements.append(ConfigurationRequirement(
            config_type=config_type,
            description=f'{config_type} configuration',
            dependencies=[],
            required_entities=required_entities
        ))
        
        # Only report missing entities for configs that can't create them
        if not required_entities and requested_types and config_type not in ['sensor', 'template', 'helper']:
            for entity_type in requested_types:
                missing.extend(self._suggest_entity_examples(entity_type))
            steps.append(f'Ensure required {", ".join(requested_types)} entities exist')
        
        steps.append(f'Create {config_type} configuration')
        
        return {
            'requirements': requirements,
            'missing': missing,
            'steps': steps
        }
    
    def _detect_requested_entity_types(self, prompt_lower: str) -> List[str]:
        """Detect what types of entities are being requested."""
        
        detected_types = []
        
        # Check for sensor type keywords
        for sensor_type, keywords in self.SENSOR_TYPE_KEYWORDS.items():
            for keyword in keywords:
                if keyword in prompt_lower:
                    detected_types.append(sensor_type)
                    break
        
        # Also check for explicit entity domains
        entity_domains = ['light', 'switch', 'sensor', 'binary_sensor', 
                         'climate', 'cover', 'fan', 'lock', 'media_player',
                         'camera', 'vacuum', 'alarm_control_panel']
        
        for domain in entity_domains:
            if domain in prompt_lower and domain not in detected_types:
                detected_types.append(domain)
        
        return list(set(detected_types))  # Remove duplicates
    
    def _find_related_entities(
        self, 
        requested_types: List[str],
        available_entities: List[str]
    ) -> List[str]:
        """Find available entities that match the requested types."""
        
        related = []
        
        for entity_id in available_entities:
            entity_lower = entity_id.lower()
            
            # Check domain match
            domain = entity_id.split('.')[0]
            
            # Map sensor types to domains
            type_to_domain = {
                'energy': 'sensor',
                'temperature': 'sensor',
                'humidity': 'sensor', 
                'motion': 'binary_sensor',
                'door': 'binary_sensor',
                'window': 'binary_sensor',
                'water': 'sensor',
                'gas': 'sensor',
                'weather': 'weather'
            }
            
            for req_type in requested_types:
                # Direct domain match
                if domain == req_type:
                    related.append(entity_id)
                    break
                
                # Mapped domain match
                if req_type in type_to_domain and domain == type_to_domain[req_type]:
                    # Additional keyword check for sensors
                    if req_type in entity_lower:
                        related.append(entity_id)
                        break
        
        return list(set(related))[:20]  # Limit to 20 most relevant, remove duplicates
    
    def _suggest_sensor_name(self, prompt_lower: str) -> str:
        """Suggest a name for a new sensor based on the request."""
        
        # Extract key terms for naming
        name_parts = []
        
        # Time-based terms (order matters - check longer terms first)
        time_terms = ['daily', 'weekly', 'monthly', 'hourly', 'yearly', 'today']
        for term in time_terms:
            if term in prompt_lower:
                if term == 'today':
                    name_parts.append('daily')
                else:
                    name_parts.append(term)
                break
        
        # Measurement terms
        measurement_keywords = {
            'energy': ['energy', 'power', 'electricity', 'kwh'],
            'temperature': ['temperature', 'temp'],
            'humidity': ['humidity'],
            'water': ['water'],
            'gas': ['gas'],
            'cost': ['cost', 'price', 'expense'],
            'usage': ['usage', 'consumption', 'used'],
            'production': ['production', 'generated', 'solar'],
        }
        
        for name, keywords in measurement_keywords.items():
            if any(keyword in prompt_lower for keyword in keywords):
                if name not in name_parts:  # Avoid duplicates
                    name_parts.append(name)
        
        # Calculation terms
        if 'total' in prompt_lower or 'sum' in prompt_lower:
            if 'total' not in name_parts:
                name_parts.insert(0, 'total')
        elif 'average' in prompt_lower or 'mean' in prompt_lower:
            if 'average' not in name_parts:
                name_parts.insert(0, 'average')
        
        # Default if nothing specific found
        if not name_parts:
            name_parts = ['custom', 'sensor']
        
        # Clean up and join
        # Remove duplicates while preserving order
        seen = set()
        unique_parts = []
        for part in name_parts:
            if part not in seen:
                seen.add(part)
                unique_parts.append(part)
        
        return '_'.join(unique_parts)
    
    def _suggest_entity_examples(self, entity_type: str) -> List[str]:
        """Suggest example entity IDs for a given type."""
        
        examples = {
            'energy': ['sensor.energy_meter', 'sensor.power_consumption'],
            'temperature': ['sensor.room_temperature', 'sensor.thermostat_temperature'],
            'humidity': ['sensor.room_humidity'],
            'motion': ['binary_sensor.motion_sensor', 'binary_sensor.room_occupancy'],
            'door': ['binary_sensor.door_sensor', 'binary_sensor.front_door'],
            'window': ['binary_sensor.window_sensor'],
            'light': ['light.room_light', 'light.ceiling_light'],
            'switch': ['switch.outlet', 'switch.smart_plug'],
            'climate': ['climate.thermostat', 'climate.hvac'],
            'water': ['sensor.water_meter', 'sensor.water_flow'],
            'gas': ['sensor.gas_meter'],
            'weather': ['weather.home']
        }
        
        return examples.get(entity_type, [f'{entity_type}.example'])
    
    def _generate_explanation(
        self,
        requirements: List[ConfigurationRequirement],
        missing_entities: List[str],
        workflow_steps: List[str],
        can_complete: bool
    ) -> str:
        """Generate an explanation of the analysis."""
        
        if not requirements:
            return "Request analyzed. Ready to generate configuration."
        
        explanation_parts = []
        
        if missing_entities:
            explanation_parts.append(
                f"⚠️ This configuration requires entities that don't exist yet: "
                f"{', '.join(missing_entities)}"
            )
        
        if len(requirements) > 1:
            explanation_parts.append(
                f"📋 This requires {len(requirements)} steps: "
                f"{', '.join(r.config_type for r in requirements)}"
            )
        
        if workflow_steps:
            steps_text = '\n'.join(f"  {step}" for step in workflow_steps)
            explanation_parts.append(f"Recommended workflow:\n{steps_text}")
        
        if can_complete:
            explanation_parts.append("✅ Configuration can be generated.")
        else:
            explanation_parts.append(
                "❌ Cannot complete without creating required entities first."
            )
        
        return '\n'.join(explanation_parts)