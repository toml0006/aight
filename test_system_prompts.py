#!/usr/bin/env python3
"""
Basic test script for System Prompt Management feature.
This tests the core functionality without requiring a full Home Assistant setup.
"""
import asyncio
import json
import tempfile
import os
from datetime import datetime
from pathlib import Path
import sys

# Add the custom_components path to sys.path
sys.path.insert(0, str(Path(__file__).parent / "custom_components"))

from ai_config_assistant.prompt_manager import SystemPrompt, PromptManager


class MockHomeAssistant:
    """Mock Home Assistant instance for testing."""
    
    def __init__(self):
        self.data = {}


class MockStore:
    """Mock storage for testing."""
    
    def __init__(self):
        self.data = {}
    
    async def async_load(self):
        return self.data.copy() if self.data else None
    
    async def async_save(self, data):
        self.data = data.copy()


async def test_system_prompt_basic():
    """Test basic SystemPrompt functionality."""
    print("🧪 Testing SystemPrompt creation...")
    
    prompt = SystemPrompt(
        id="test_prompt",
        name="Test Automation Prompt",
        config_type="automation",
        template="Create automation: {prompt}\n\nEntities: {entities}",
        description="A test prompt for automation generation"
    )
    
    assert prompt.id == "test_prompt"
    assert prompt.name == "Test Automation Prompt"
    assert prompt.config_type == "automation"
    assert "prompt" in prompt.variables
    assert "entities" in prompt.variables
    assert len(prompt.variables) == 2
    
    print("✅ SystemPrompt basic functionality works")


async def test_prompt_manager_initialization():
    """Test PromptManager initialization."""
    print("🧪 Testing PromptManager initialization...")
    
    mock_hass = MockHomeAssistant()
    prompt_manager = PromptManager(mock_hass)
    
    # Mock the storage
    prompt_manager._store = MockStore()
    
    # Initialize default prompts manually (since we can't load const.py easily)
    await prompt_manager._init_default_prompts()
    
    # Check that default prompts were created
    assert len(prompt_manager._default_prompts) >= 3  # automation, script, dashboard
    
    print("✅ PromptManager initialization works")


async def test_prompt_crud_operations():
    """Test CRUD operations on prompts."""
    print("🧪 Testing CRUD operations...")
    
    mock_hass = MockHomeAssistant()
    prompt_manager = PromptManager(mock_hass)
    prompt_manager._store = MockStore()
    
    await prompt_manager._init_default_prompts()
    
    # Test CREATE
    custom_prompt = await prompt_manager.create_prompt(
        name="Custom Test Prompt",
        config_type="automation",
        template="Test template: {prompt}\n\nAvailable: {entities}",
        description="A custom test prompt"
    )
    
    assert custom_prompt.name == "Custom Test Prompt"
    assert custom_prompt.config_type == "automation"
    assert not custom_prompt.is_default
    
    # Test READ
    all_prompts = await prompt_manager.get_all_prompts()
    automation_prompts = await prompt_manager.get_prompts_by_type("automation")
    
    assert len(all_prompts) > 3  # defaults + custom
    assert len(automation_prompts) >= 2  # default + custom
    
    # Test UPDATE
    updated_prompt = await prompt_manager.update_prompt(
        custom_prompt.id,
        name="Updated Custom Prompt",
        description="Updated description"
    )
    
    assert updated_prompt.name == "Updated Custom Prompt"
    assert updated_prompt.description == "Updated description"
    
    # Test DELETE
    delete_success = await prompt_manager.delete_prompt(custom_prompt.id)
    assert delete_success == True
    
    # Verify deletion
    all_prompts_after_delete = await prompt_manager.get_all_prompts()
    assert len(all_prompts_after_delete) == len(all_prompts) - 1
    
    print("✅ CRUD operations work correctly")


async def test_template_validation():
    """Test template validation."""
    print("🧪 Testing template validation...")
    
    mock_hass = MockHomeAssistant()
    prompt_manager = PromptManager(mock_hass)
    prompt_manager._store = MockStore()
    
    await prompt_manager._init_default_prompts()
    
    # Test valid template
    try:
        await prompt_manager.create_prompt(
            name="Valid Template",
            config_type="automation", 
            template="Create automation: {prompt}",
            description="Valid template"
        )
        print("✅ Valid template accepted")
    except Exception as e:
        print(f"❌ Valid template rejected: {e}")
        raise
    
    # Test invalid template (missing {prompt})
    try:
        await prompt_manager.create_prompt(
            name="Invalid Template",
            config_type="automation",
            template="This template has no prompt variable",
            description="Invalid template"
        )
        print("❌ Invalid template was accepted (should have failed)")
        raise AssertionError("Invalid template should have been rejected")
    except ValueError:
        print("✅ Invalid template correctly rejected")
    
    # Test template with invalid variables
    try:
        await prompt_manager.create_prompt(
            name="Invalid Variables",
            config_type="automation",
            template="Create automation: {prompt} with {invalid_variable}",
            description="Template with invalid variables"
        )
        print("❌ Template with invalid variables was accepted (should have failed)")
        raise AssertionError("Template with invalid variables should have been rejected")
    except ValueError:
        print("✅ Template with invalid variables correctly rejected")


async def test_import_export():
    """Test import/export functionality."""
    print("🧪 Testing import/export functionality...")
    
    mock_hass = MockHomeAssistant()
    prompt_manager = PromptManager(mock_hass)
    prompt_manager._store = MockStore()
    
    await prompt_manager._init_default_prompts()
    
    # Create a test prompt
    test_prompt = await prompt_manager.create_prompt(
        name="Export Test Prompt",
        config_type="script",
        template="Run script: {prompt}\n\nServices: {services}",
        description="A prompt for testing export"
    )
    
    # Export the prompt
    exported_data = await prompt_manager.export_prompts([test_prompt.id])
    
    assert len(exported_data) == 1
    assert exported_data[0]["name"] == "Export Test Prompt"
    assert exported_data[0]["config_type"] == "script"
    
    # Delete the prompt
    await prompt_manager.delete_prompt(test_prompt.id)
    
    # Import the prompt back
    imported_ids = await prompt_manager.import_prompts(exported_data)
    
    assert len(imported_ids) == 1
    
    # Verify import worked
    imported_prompt = await prompt_manager.get_prompt(imported_ids[0])
    assert imported_prompt.name == "Export Test Prompt"
    assert imported_prompt.config_type == "script"
    
    print("✅ Import/export functionality works")


async def test_active_prompt_management():
    """Test active prompt management."""
    print("🧪 Testing active prompt management...")
    
    mock_hass = MockHomeAssistant()
    prompt_manager = PromptManager(mock_hass)
    prompt_manager._store = MockStore()
    
    await prompt_manager._init_default_prompts()
    
    # Create a custom prompt
    custom_prompt = await prompt_manager.create_prompt(
        name="Custom Active Test",
        config_type="automation",
        template="Custom automation: {prompt}",
        description="Custom prompt for testing active status"
    )
    
    # Set as active
    success = await prompt_manager.set_active_prompt("automation", custom_prompt.id)
    assert success == True
    
    # Verify it's active
    active_prompt = await prompt_manager.get_active_prompt("automation")
    assert active_prompt.id == custom_prompt.id
    
    # Reset to default
    reset_success = await prompt_manager.reset_to_default("automation")
    assert reset_success == True
    
    # Verify default is active
    active_prompt_after_reset = await prompt_manager.get_active_prompt("automation")
    assert active_prompt_after_reset.is_default == True
    
    print("✅ Active prompt management works")


async def run_all_tests():
    """Run all tests."""
    print("🚀 Starting System Prompt Management Tests\n")
    
    try:
        await test_system_prompt_basic()
        await test_prompt_manager_initialization()
        await test_prompt_crud_operations()
        await test_template_validation()
        await test_import_export()
        await test_active_prompt_management()
        
        print("\n🎉 All tests passed! System Prompt Management is working correctly.")
        return True
        
    except Exception as e:
        print(f"\n❌ Test failed: {e}")
        import traceback
        traceback.print_exc()
        return False


if __name__ == "__main__":
    success = asyncio.run(run_all_tests())
    sys.exit(0 if success else 1)