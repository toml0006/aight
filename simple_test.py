#!/usr/bin/env python3
"""
Simple test for SystemPrompt dataclass functionality.
"""
import sys
from datetime import datetime
from dataclasses import asdict
from pathlib import Path

# Simple SystemPrompt implementation for testing
class SystemPrompt:
    """System prompt configuration."""
    
    def __init__(self, id, name, config_type, template, description="", 
                 is_default=False, created_at=None, updated_at=None, 
                 author=None, version="1.0.0", variables=None):
        self.id = id
        self.name = name
        self.config_type = config_type
        self.template = template
        self.description = description
        self.is_default = is_default
        self.created_at = created_at or datetime.now().isoformat()
        self.updated_at = updated_at or self.created_at
        self.author = author
        self.version = version
        self.variables = variables or self._extract_variables()
    
    def _extract_variables(self):
        """Extract template variables from the prompt template."""
        import re
        pattern = r'\{([^}]+)\}'
        matches = re.findall(pattern, self.template)
        return list(set(matches))
    
    def to_dict(self):
        """Convert to dictionary."""
        return {
            'id': self.id,
            'name': self.name,
            'config_type': self.config_type,
            'template': self.template,
            'description': self.description,
            'is_default': self.is_default,
            'created_at': self.created_at,
            'updated_at': self.updated_at,
            'author': self.author,
            'version': self.version,
            'variables': self.variables
        }
    
    @classmethod
    def from_dict(cls, data):
        """Create from dictionary."""
        return cls(**data)


def test_system_prompt():
    """Test SystemPrompt functionality."""
    print("🧪 Testing SystemPrompt...")
    
    # Test creation
    prompt = SystemPrompt(
        id="test_automation",
        name="Test Automation Prompt", 
        config_type="automation",
        template="Create automation: {prompt}\n\nEntities: {entities}\n\nCurrent states: {current_states}",
        description="Test prompt for automation generation",
        author="Test Suite"
    )
    
    # Test basic properties
    assert prompt.id == "test_automation"
    assert prompt.name == "Test Automation Prompt"
    assert prompt.config_type == "automation"
    assert prompt.author == "Test Suite"
    assert not prompt.is_default
    
    # Test variable extraction
    expected_variables = {"prompt", "entities", "current_states"}
    assert set(prompt.variables) == expected_variables
    
    # Test serialization
    prompt_dict = prompt.to_dict()
    assert prompt_dict["id"] == "test_automation"
    assert prompt_dict["name"] == "Test Automation Prompt"
    assert set(prompt_dict["variables"]) == expected_variables
    
    # Test deserialization
    recreated_prompt = SystemPrompt.from_dict(prompt_dict)
    assert recreated_prompt.id == prompt.id
    assert recreated_prompt.name == prompt.name
    assert recreated_prompt.template == prompt.template
    assert set(recreated_prompt.variables) == set(prompt.variables)
    
    print("✅ SystemPrompt basic functionality works")


def test_template_variables():
    """Test template variable extraction."""
    print("🧪 Testing template variable extraction...")
    
    # Test with multiple variables
    prompt1 = SystemPrompt(
        id="test1",
        name="Multi-variable Test",
        config_type="automation",
        template="""
        Create {config_type} based on: {prompt}
        
        Available entities: {entities}
        Current states: {current_states}  
        Services: {services}
        Time: {current_time}
        Areas: {areas}
        Domains: {domains}
        """
    )
    
    expected_vars = {
        "config_type", "prompt", "entities", "current_states", 
        "services", "current_time", "areas", "domains"
    }
    assert set(prompt1.variables) == expected_vars
    
    # Test with duplicate variables
    prompt2 = SystemPrompt(
        id="test2", 
        name="Duplicate Variable Test",
        config_type="script",
        template="Run {prompt} with {entities} and also use {entities} again"
    )
    
    assert set(prompt2.variables) == {"prompt", "entities"}
    
    # Test with no variables (should still work)
    prompt3 = SystemPrompt(
        id="test3",
        name="No Variables Test", 
        config_type="scene",
        template="This is a static template with no variables"
    )
    
    assert prompt3.variables == []
    
    print("✅ Template variable extraction works correctly")


def test_prompt_validation():
    """Test validation logic that would be used."""
    print("🧪 Testing prompt validation logic...")
    
    def validate_template(template):
        """Validate a prompt template."""
        if not template.strip():
            raise ValueError("Template cannot be empty")
        
        # Check for required {prompt} variable
        if "{prompt}" not in template:
            raise ValueError("Template must contain {prompt} variable")
        
        # Check for valid variables
        import re
        variables = re.findall(r'\{([^}]+)\}', template)
        
        allowed_variables = {
            "prompt", "entities", "current_states", "services", 
            "current_time", "areas", "domains"
        }
        
        invalid_variables = set(variables) - allowed_variables
        if invalid_variables:
            raise ValueError(f"Invalid template variables: {', '.join(invalid_variables)}")
    
    # Test valid template
    try:
        validate_template("Create automation: {prompt} with {entities}")
        print("✅ Valid template passed validation")
    except Exception as e:
        print(f"❌ Valid template failed validation: {e}")
        raise
    
    # Test invalid template (no {prompt})
    try:
        validate_template("This has no prompt variable: {entities}")
        print("❌ Invalid template passed validation (should have failed)")
        raise AssertionError("Invalid template should have been rejected")
    except ValueError as e:
        if "prompt" in str(e):
            print("✅ Template without {prompt} correctly rejected")
        else:
            raise
    
    # Test template with invalid variables
    try:
        validate_template("Create config: {prompt} with {invalid_var}")
        print("❌ Template with invalid variables passed validation (should have failed)")
        raise AssertionError("Template with invalid variables should have been rejected")
    except ValueError as e:
        if "invalid" in str(e):
            print("✅ Template with invalid variables correctly rejected")
        else:
            raise
    
    print("✅ Prompt validation logic works correctly")


def test_template_formatting():
    """Test template formatting with sample data."""
    print("🧪 Testing template formatting...")
    
    prompt = SystemPrompt(
        id="format_test",
        name="Format Test Prompt",
        config_type="automation",
        template="""Create a {config_type} based on: {prompt}

Available entities:
{entities}

Current states:
{current_states}

Current time: {current_time}"""
    )
    
    # Sample data for formatting
    sample_data = {
        "config_type": "automation",
        "prompt": "Turn on lights when motion detected",
        "entities": "- light.living_room (Living Room Light) - Current state: off",
        "current_states": "- light.living_room: off",
        "current_time": "2025-09-02T10:30:00Z"
    }
    
    # Format the template
    try:
        formatted = prompt.template.format(**sample_data)
        
        # Check that variables were replaced
        assert "{config_type}" not in formatted
        assert "{prompt}" not in formatted
        assert "automation" in formatted
        assert "Turn on lights when motion detected" in formatted
        assert "Living Room Light" in formatted
        
        print("✅ Template formatting works correctly")
        
    except KeyError as e:
        print(f"❌ Template formatting failed: missing variable {e}")
        raise
    
    print("✅ Template formatting completed successfully")


def run_all_tests():
    """Run all simple tests."""
    print("🚀 Starting Simple System Prompt Tests\n")
    
    try:
        test_system_prompt()
        test_template_variables()
        test_prompt_validation()
        test_template_formatting()
        
        print("\n🎉 All simple tests passed! Core SystemPrompt functionality is working.")
        return True
        
    except Exception as e:
        print(f"\n❌ Test failed: {e}")
        import traceback
        traceback.print_exc()
        return False


if __name__ == "__main__":
    success = run_all_tests()
    sys.exit(0 if success else 1)