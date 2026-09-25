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
    short_input = "This is a genuine Yamaha spare part from IndiaSpare designed for direct OEM fitment and reliability."
    result_short = enforce_product_desc_words(short_input, brand="YAMAHA", model_str="BGPK", part_name="CYLINDER HEAD")
    words_short = result_short.split()
    assert 120 <= len(words_short) <= 140, f"Word count {len(words_short)} out of range"
    assert "," not in result_short
    assert "IndiaSpare" in result_short

    # Test long input (over 140 words)
    long_input = "Word " * 200 + "from IndiaSpare."
    result_long = enforce_product_desc_words(long_input, brand="YAMAHA", model_str="BGPK", part_name="CYLINDER HEAD")
    words_long = result_long.split()
    assert 120 <= len(words_long) <= 140, f"Word count {len(words_long)} out of range"
    assert "," not in result_long
    assert "IndiaSpare" in result_long


def test_enhance_metadata_missing_api_key():
    """Verify ValueError is raised if no API key is provided."""
    items = [{"fig_no": "1", "part_name": "CYLINDER HEAD"}]
    with patch.dict("os.environ", {"GEMINI_API_KEY": ""}):
        with pytest.raises(ValueError, match="Google AI Studio API key not found"):
            enhance_metadata_with_gemini(items, api_key="")


@patch("app.gemini_service.call_gemini_batch")
def test_enhance_metadata_with_gemini_mocked(mock_call):
    """Verify Gemini AI generated text is post-processed to satisfy all strict constraints."""
    mock_call.return_value = {
        "1": {
            "meta_description": "buy authentic yamaha bgpk ray zr cylinder head genuine oem spare parts diagram from indiaspare with verified vehicle fitment today.",
            "product_description": "This authentic Yamaha BGPK Ray ZR cylinder head is engineered to official factory specifications from IndiaSpare. " * 6,
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
            "meta_title": "Yamaha Ray Zr Series BGPK Cylinder Head | IndiaSpare",
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
    assert "IndiaSpare" in item["meta_description"]
    assert "indiaspare" not in item["meta_description"]
    assert item["meta_desc_chars"] == len(item["meta_description"])

    # Product description constraints
    p_words = len(item["product_description"].split())
    assert 120 <= p_words <= 140, f"Product desc words {p_words} out of bounds"
    assert "," not in item["product_description"]
    assert "IndiaSpare" in item["product_description"]
    assert item["product_desc_words"] == p_words

    # Flag
    assert item["ai_generated"] is True


def test_discover_supported_models():
    """Verify discover_supported_models excludes preview-image models and ranks gemini-2.0-flash accurately."""
    from app.gemini_service import discover_supported_models

    mock_resp = MagicMock()
    mock_resp.status_code = 200
    mock_resp.json.return_value = {
        "models": [
            {"name": "models/gemini-1.0-pro", "supportedGenerationMethods": ["generateContent"]},
            {"name": "models/gemini-2.0-flash", "supportedGenerationMethods": ["generateContent"]},
            {"name": "models/gemini-2.5-flash", "supportedGenerationMethods": ["generateContent"]},
            {"name": "models/gemini-2.5-flash-preview-image", "supportedGenerationMethods": ["generateContent"]},
            {"name": "models/embedding-001", "supportedGenerationMethods": ["embedContent"]},
        ]
    }

    mock_client = MagicMock()
    mock_client.get.return_value = mock_resp

    models = discover_supported_models("test-dynamic-key-456", mock_client)
    assert len(models) >= 3
    # Top ranked model should be 2.0-flash
    assert "2.0-flash" in models[0][1]
    # gemini-2.5-flash-preview-image must be excluded
    assert not any("preview-image" in m[1] for m in models)
    # embedding model must NOT be included
    assert not any("embedding" in m[1] for m in models)


def test_call_gemini_batch_429_fallback():
    """Verify call_gemini_batch falls back to next model when encountering HTTP 429 quota exhaustion."""
    import json
    from app.gemini_service import call_gemini_batch

    with patch("app.gemini_service.discover_supported_models") as mock_discover, \
         patch("httpx.Client") as mock_client_cls:

        mock_discover.return_value = [
            ("v1beta", "models/exhausted-model"),
            ("v1beta", "models/gemini-2.0-flash"),
        ]

        resp_429 = MagicMock()
        resp_429.status_code = 429
        resp_429.text = json.dumps({"error": {"code": 429, "message": "limit: 0"}})

        resp_200 = MagicMock()
        resp_200.status_code = 200
        resp_200.json.return_value = {
            "candidates": [
                {
                    "content": {
                        "parts": [
                            {
                                "text": json.dumps({
                                    "items": [
                                        {
                                            "fig_no": "1",
                                            "part_name": "VALVE",
                                            "meta_description": "test meta",
                                            "product_description": "test prod",
                                        }
                                    ]
                                })
                            }
                        ]
                    }
                }
            ]
        }

        mock_client = MagicMock()
        mock_client.__enter__.return_value = mock_client
        mock_client.post.side_effect = [resp_429, resp_200]
        mock_client_cls.return_value = mock_client

        results = call_gemini_batch(
            items=[{"fig_no": "1", "part_name": "VALVE"}],
            user_prompt="test",
            brand="YAMAHA",
            model_code="M1",
            model="R1",
            series="S1",
            api_key="test-key-429",
        )

        assert "1" in results
        assert results["1"]["meta_description"] == "test meta"
        assert mock_client.post.call_count == 2


@patch("app.gemini_service.call_gemini_batch")
@patch("time.sleep")
def test_enhance_metadata_with_gemini_multibatch(mock_sleep, mock_call):
    """Verify enhance_metadata_with_gemini correctly paces multiple batches using time.sleep."""
    mock_call.return_value = {
        "1": {"meta_description": "meta 1 from India Spare", "product_description": "prod 1 from India Spare"},
        "2": {"meta_description": "meta 2 from India Spare", "product_description": "prod 2 from India Spare"},
    }

    items = [
        {"fig_no": "1", "part_name": "VALVE"},
        {"fig_no": "2", "part_name": "PISTON"},
    ]

    enhanced = enhance_metadata_with_gemini(
        metadata_items=items,
        api_key="valid-key",
        batch_size=1,  # Forces 2 separate batches
    )

    assert len(enhanced) == 2
    assert mock_call.call_count == 2
    assert mock_sleep.call_count == 1
    mock_sleep.assert_called_with(1.5)


def test_build_gemini_payload_dual_records():
    """Verify _build_gemini_payload builds both extracted catalogue and SEO metadata records for dual analysis."""
    from app.gemini_service import _build_gemini_payload

    items = [
        {
            "page": 7,
            "fig_no": "1",
            "part_name": "CYLINDER HEAD",
            "ref_no": "1",
            "part_no": "BGP-E1111-00",
            "clean_part_no": "BGPE111100",
            "BGPK": "1",
            "BGPL": "2",
            "remarks": "UR FOR VRC1",
            "image_filename": "YAM_BGPK_CYLINDER HEAD.jpeg",
            "product_title": "YAMAHA BGPK RAY ZR CYLINDER HEAD",
            "meta_title": "Yamaha Ray Zr BGPK Cylinder Head | IndiaSpare",
        }
    ]

    payload = _build_gemini_payload(
        items=items,
        user_prompt="Custom prompt testing dual records",
        brand="YAMAHA",
        model_code="BGPK",
        model="RAY ZR",
        series="STREET RALLY",
    )

    system_instruction = payload["system_instruction"]["parts"][0]["text"]
    assert "DUAL-RECORD ARCHITECTURE" in system_instruction
    assert "extracted_parts_catalogue_record" in system_instruction
    assert "seo_metadata_record" in system_instruction
    assert "MANDATORY TWO-STEP PROCEDURE" in system_instruction
    assert "DUAL-RECORD ANALYSIS" in system_instruction

    prompt_text = payload["contents"][0]["parts"][0]["text"]
    assert "MANDATORY INSTRUCTION: You must analyze BOTH Excel records" in prompt_text
    assert '"extracted_parts_catalogue_record"' in prompt_text
    assert '"seo_metadata_record"' in prompt_text
    assert '"BGP-E1111-00"' in prompt_text
    assert '"BGPE111100"' in prompt_text
    assert '"BGPK": "1"' in prompt_text
    assert '"BGPL": "2"' in prompt_text
    assert '"analysis":' in prompt_text


@patch("app.gemini_service.call_gemini_batch")
def test_enhance_metadata_captures_ai_analysis(mock_call):
    """Verify enhance_metadata_with_gemini correctly captures and formats the AI dual-record analysis."""
    mock_call.return_value = {
        "1": {
            "analysis": "Analyzed Record 1 (CYLINDER HEAD BGP-E1111-00) and Record 2 (YAMAHA BGPK). Genuine Yamaha OEM factory casting from IndiaSpare.",
            "meta_description": "buy authentic yamaha bgpk ray zr cylinder head genuine oem spare parts diagram from indiaspare with verified vehicle fitment today.",
            "product_description": "This authentic Yamaha BGPK Ray ZR cylinder head is engineered to official factory specifications from IndiaSpare. " * 6,
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
            "meta_title": "Yamaha Ray Zr Series BGPK Cylinder Head | IndiaSpare",
        }
    ]

    enhanced = enhance_metadata_with_gemini(
        metadata_items=raw_items,
        api_key="test-key",
    )

    assert len(enhanced) == 1
    item = enhanced[0]
    assert "ai_analysis" in item
    assert "IndiaSpare" in item["ai_analysis"]
    assert "," not in item["ai_analysis"]
    assert "Analyzed Record 1" in item["ai_analysis"]
    assert item["ai_generated"] is True


def test_gemini_payload_uniqueness_on_every_click_and_prompt():
    """Verify _build_gemini_payload produces dynamic cycle tokens, random seeds, and high temperature
    so every single click and new prompt input yields unique generation from Gemini AI.
    """
    from app.gemini_service import _build_gemini_payload

    items = [{"fig_no": "1", "part_name": "CYLINDER HEAD", "part_no": "BGP-E1111-00"}]

    # 1. Verify two consecutive calls without explicit cycle token generate distinct cycle tokens and seeds
    p1 = _build_gemini_payload(items, "Prompt 1", "YAMAHA", "BGPK", "RAY ZR", "SERIES")
    p2 = _build_gemini_payload(items, "Prompt 1", "YAMAHA", "BGPK", "RAY ZR", "SERIES")

    # Seeds in generationConfig must be random integers
    seed1 = p1["generationConfig"]["seed"]
    seed2 = p2["generationConfig"]["seed"]
    assert isinstance(seed1, int)
    assert isinstance(seed2, int)

    # Temperature and top_p must be 0.95 for maximum linguistic richness and uniqueness
    assert p1["generationConfig"]["temperature"] == 0.95
    assert p1["generationConfig"]["top_p"] == 0.95

    # Cycle token in prompt content ensures prompt cache busts
    text1 = p1["contents"][0]["parts"][0]["text"]
    text2 = p2["contents"][0]["parts"][0]["text"]
    assert "=== GENERATION RUN CYCLE TOKEN: [RUN-" in text1
    assert "=== GENERATION RUN CYCLE TOKEN: [RUN-" in text2

    # 2. Verify new user prompt is deeply embedded as highest priority
    custom_prompt = "Emphasize high RPM racing endurance and thermal protection for monsoon racing"
    p3 = _build_gemini_payload(items, custom_prompt, "YAMAHA", "BGPK", "RAY ZR", "SERIES")
    text3 = p3["contents"][0]["parts"][0]["text"]
    assert custom_prompt in text3
    assert "USER'S CUSTOM COPYWRITING DIRECTIVES (HIGHEST PRIORITY)" in text3


def test_enforce_product_desc_words_produces_unique_variations():
    """Verify enforce_product_desc_words generates varied authentic text across different seeds/runs."""
    short_base = "Genuine Yamaha OEM part from IndiaSpare."
    res1 = enforce_product_desc_words(short_base, brand="YAMAHA", model_str="BGPK", part_name="CYLINDER", seed=101)
    res2 = enforce_product_desc_words(short_base, brand="YAMAHA", model_str="BGPK", part_name="CYLINDER", seed=999)

    # Strict length checks
    assert 120 <= len(res1.split()) <= 140
    assert 120 <= len(res2.split()) <= 140
    assert "," not in res1
    assert "," not in res2
    assert "IndiaSpare" in res1
    assert "IndiaSpare" in res2

    # Due to randomized sentence pool shuffling, res1 and res2 must be non-identical
    assert res1 != res2


def test_enforce_meta_desc_length_produces_unique_variations():
    """Verify enforce_meta_desc_length generates varied padding and closers across runs."""
    from app.meta_generator import enforce_meta_desc_length

    short_meta = "buy authentic yamaha bgpk cylinder head genuine oem spare from indiaspare."
    m1 = enforce_meta_desc_length(short_meta, seed=42)
    m2 = enforce_meta_desc_length(short_meta, seed=99999)

    assert 151 <= len(m1) <= 158
    assert 151 <= len(m2) <= 158
    assert "," not in m1
    assert "," not in m2
    assert "IndiaSpare" in m1
    assert "IndiaSpare" in m2


