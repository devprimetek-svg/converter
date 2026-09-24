"""Unit tests for Google AI Studio (Gemini) metadata generator service."""

from unittest.mock import MagicMock, patch
import pytest

from app.gemini_service import (
    DEFAULT_AI_PROMPT,
    enforce_product_desc_words,
    enhance_metadata_with_gemini,
)
from app.meta_generator import clean_no_commas, format_india_spare


def test_enforce_product_desc_words_length_and_commas():
    """Verify enforce_product_desc_words produces text strictly between 120 and 140 words without commas."""
    # Test short input (under 120 words)
    short_input = "This is a genuine Yamaha spare part from India Spare designed for direct OEM fitment and reliability."
    result_short = enforce_product_desc_words(short_input, brand="YAMAHA", model_str="BGPK", part_name="CYLINDER HEAD")
    words_short = result_short.split()
    assert 120 <= len(words_short) <= 140, f"Word count {len(words_short)} out of range"
    assert "," not in result_short
    assert "India Spare" in result_short

    # Test long input (over 140 words)
    long_input = "Word " * 200 + "from India Spare."
    result_long = enforce_product_desc_words(long_input, brand="YAMAHA", model_str="BGPK", part_name="CYLINDER HEAD")
    words_long = result_long.split()
    assert 120 <= len(words_long) <= 140, f"Word count {len(words_long)} out of range"
    assert "," not in result_long
    assert "India Spare" in result_long


def test_enhance_metadata_missing_api_key():
    """Verify ValueError is raised if no API key is provided."""
    items = [{"fig_no": "1", "part_name": "CYLINDER HEAD"}]
    with patch.dict("os.environ", {}, clear=True):
        with pytest.raises(ValueError, match="Google AI Studio API key not found"):
            enhance_metadata_with_gemini(items, api_key="")


@patch("app.gemini_service.call_gemini_batch")
def test_enhance_metadata_with_gemini_mocked(mock_call):
    """Verify Gemini AI generated text is post-processed to satisfy all strict constraints."""
    mock_call.return_value = {
        "1": {
            "meta_description": "buy authentic yamaha bgpk ray zr cylinder head genuine oem spare parts diagram from india spare with verified vehicle fitment today.",
            "product_description": "This authentic Yamaha BGPK Ray ZR cylinder head is engineered to official factory specifications from India Spare. " * 6,
        }
    }

    raw_items = [
        {
            "fig_no": "1",
            "part_name": "CYLINDER HEAD",
            "brand": "YAMAHA",
            "model_code": "BGPK",
            "model": "RAY ZR",
            "series": "SERIES",
            "product_title": "YAMAHA BGPK RAY ZR SERIES CYLINDER HEAD",
            "meta_title": "Yamaha Ray Zr Series BGPK Cylinder Head | India Spare",
            "meta_description": "old template",
            "product_description": "old template",
        }
    ]

    enhanced = enhance_metadata_with_gemini(
        metadata_items=raw_items,
        user_prompt="Focus on high durability and performance",
        brand="YAMAHA",
        model_code="BGPK",
        model="RAY ZR",
        series="SERIES",
        api_key="fake-test-key",
    )

    assert len(enhanced) == 1
    item = enhanced[0]

    # Meta description constraints
    assert 151 <= len(item["meta_description"]) <= 158, f"Meta desc len {len(item['meta_description'])} out of bounds: {item['meta_description']}"
    assert "," not in item["meta_description"]
    assert "India Spare" in item["meta_description"]
    assert "india spare" not in item["meta_description"]
    assert item["meta_desc_chars"] == len(item["meta_description"])

    # Product description constraints
    p_words = len(item["product_description"].split())
    assert 120 <= p_words <= 140, f"Product desc words {p_words} out of bounds"
    assert "," not in item["product_description"]
    assert "India Spare" in item["product_description"]
    assert item["product_desc_words"] == p_words

    # Flag
    assert item["ai_generated"] is True


def test_discover_supported_models():
    """Verify discover_supported_models parses ListModels response and ranks them accurately."""
    from app.gemini_service import discover_supported_models

    mock_resp = MagicMock()
    mock_resp.status_code = 200
    mock_resp.json.return_value = {
        "models": [
            {"name": "models/gemini-1.0-pro", "supportedGenerationMethods": ["generateContent"]},
            {"name": "models/gemini-2.0-flash", "supportedGenerationMethods": ["generateContent"]},
            {"name": "models/gemini-2.5-flash", "supportedGenerationMethods": ["generateContent"]},
            {"name": "models/embedding-001", "supportedGenerationMethods": ["embedContent"]},
        ]
    }

    mock_client = MagicMock()
    mock_client.get.return_value = mock_resp

    models = discover_supported_models("test-dynamic-key-456", mock_client)
    assert len(models) >= 3
    # Top ranked model should be 2.5-flash
    assert "2.5-flash" in models[0][1]
    # embedding model must NOT be included (doesn't support generateContent)
    assert not any("embedding" in m[1] for m in models)

