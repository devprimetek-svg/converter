"""Google AI Studio (Gemini) Integration for Product & SEO Metadata Generation.

Generates unique, high-converting eCommerce meta descriptions and product descriptions
using Gemini 2.5 Flash / Gemini 2.0 Flash via Google AI Studio API, with automated
post-processing to enforce strict character and word count boundaries:
- Meta Description: strictly 151-158 characters, no commas, 'India Spare' properly cased.
- Product Description: strictly 120-140 words, no commas, 'India Spare' properly cased.
- Short Description & Meta Title: preserve Brand, Model, Series after Model, and Model Code.
"""

import json
import logging
import os
import re
from typing import Any, Optional

import httpx

from app.meta_generator import (
    clean_no_commas,
    enforce_meta_desc_length,
    format_india_spare,
)

logger = logging.getLogger(__name__)

# Primary & fallback Gemini models on Google AI Studio
GEMINI_MODELS = [
    "gemini-2.5-flash",
    "gemini-2.0-flash",
    "gemini-1.5-flash",
]

DEFAULT_AI_PROMPT = (
    "Generate authentic eCommerce descriptions for India Spare parts catalogue. "
    "Emphasize genuine OEM factory specifications, precision dimensional fitment, "
    "high heat and stress resistance, long-term road safety, and India Spare verified quality guarantee."
)


def enforce_product_desc_words(
    text: str,
    brand: str = "YAMAHA",
    model_str: str = "MODEL",
    part_name: str = "PART",
) -> str:
    """Ensure product description is strictly bounded between 120 and 140 words without commas,
    strictly preserving 'India Spare' proper casing.
    """
    clean_text = clean_no_commas(text)
    words = clean_text.split()

    # Trim down if over 140 words
    if len(words) > 140:
        words = words[:132]
        trimmed = " ".join(words)
        last_dot = trimmed.rfind(".")
        if last_dot > 0 and len(trimmed[: last_dot + 1].split()) >= 120:
            clean_text = trimmed[: last_dot + 1]
            words = clean_text.split()
        else:
            words = words[:130]
            clean_text = " ".join(words).rstrip(".") + "."

    # Pad up if under 120 words with authentic paragraph blocks
    addon_paragraphs = [
        f"This authentic {brand} {model_str} {part_name} is an original OEM factory specification component designed specifically for your vehicle assembly.",
        "Manufactured under strict automotive quality standards this genuine replacement part provides exact dimensional accuracy and long term mechanical reliability.",
        "It directly replaces worn or damaged factory components to restore optimum operating performance across all riding conditions.",
        f"Order your authentic {brand} {model_str} {part_name} diagram spare from India Spare today.",
        "We provide verified authentic OEM components with guaranteed fitment secure protective packaging and dependable delivery across India.",
        "Upgrade your motorcycle with confidence using certified factory parts built for durability and road safety.",
        "Each genuine component undergoes rigorous factory inspection to ensure optimum operating performance.",
        "Trust India Spare for authentic OEM replacement parts backed by verified vehicle fitment and rapid delivery.",
        "Professional installation following standard manufacturer guidelines guarantees maximum vehicle longevity.",
        "Keep your motorcycle performing at peak efficiency under all demanding road conditions.",
    ]
    for s in addon_paragraphs:
        if len(words) < 120:
            clean_text = clean_text.rstrip(".") + ". " + clean_no_commas(s)
            words = clean_text.split()
        else:
            break

    # Final padding words loop if still slightly under 120
    filler_pool = [
        "All", "components", "meet", "stringent", "automotive", "quality", "standards",
        "and", "provide", "uncompromised", "safety", "on", "every", "journey", "across",
        "all", "road", "conditions", "without", "exception", "delivering", "flawless",
        "precision", "and", "unmatched", "durability", "for", "your", "motorcycle", "riding",
        "needs", "every", "single", "day",
    ]
    while len(words) < 120:
        needed = 120 - len(words)
        chunk = filler_pool[:needed] if needed <= len(filler_pool) else filler_pool
        clean_text = clean_text.rstrip(".") + ". " + " ".join(chunk) + "."
        words = clean_text.split()

    # Ensure India Spare is guaranteed to be present
    if "india spare" not in clean_text.lower():
        words = clean_text.rstrip(".").split()
        if len(words) >= 137:
            words = words[:134]
        clean_text = " ".join(words) + " from India Spare."
        words = clean_text.split()

    if len(words) > 140:
        words = words[:135]
        clean_text = " ".join(words).rstrip(".") + "."

    return format_india_spare(clean_text)


def _build_gemini_payload(
    items: list[dict[str, Any]],
    user_prompt: str,
    brand: str,
    model_code: str,
    model: str,
    series: str,
) -> dict[str, Any]:
    """Build the JSON request payload for Google AI Studio generateContent endpoint."""
    system_instruction = (
        "You are an expert automotive parts copywriter for 'India Spare', an authentic OEM spare parts supplier in India. "
        "Your task is to generate unique, high-quality, professional eCommerce descriptions for motorcycle and scooter parts. "
        "CRITICAL RULES:\n"
        "1. Do NOT include ANY commas in the text (zero commas).\n"
        "2. Always reference 'India Spare' (exact proper casing).\n"
        "3. For 'meta_description': produce a concise, compelling eCommerce SEO sentence between 145 and 155 characters. "
        "Include the brand, model, series, part name, and 'from India Spare'.\n"
        "4. For 'product_description': produce a detailed, authoritative product description of about 125 to 135 words. "
        "Highlight OEM factory precision, material durability, direct fitment, and India Spare reliability.\n"
        "5. Respond STRICTLY with a valid JSON object matching the requested schema."
    )

    parts_catalog_data = []
    for it in items:
        parts_catalog_data.append({
            "fig_no": str(it.get("fig_no", "")),
            "part_name": str(it.get("part_name") or it.get("description") or ""),
            "brand": brand,
            "model_code": model_code,
            "model": model,
            "series": series,
            "product_title": it.get("product_title", ""),
            "meta_title": it.get("meta_title", ""),
        })

    prompt_content = (
        f"Custom Instructions: {user_prompt.strip() or DEFAULT_AI_PROMPT}\n\n"
        f"Generate descriptions for the following {len(parts_catalog_data)} parts:\n"
        f"{json.dumps(parts_catalog_data, indent=2)}\n\n"
        "Return a JSON object in this exact structure:\n"
        "{\n"
        '  "items": [\n'
        '    {\n'
        '      "fig_no": "1",\n'
        '      "part_name": "CYLINDER HEAD",\n'
        '      "meta_description": "...",\n'
        '      "product_description": "..."\n'
        '    }\n'
        '  ]\n'
        "}"
    )

    return {
        "system_instruction": {
            "parts": [{"text": system_instruction}]
        },
        "contents": [
            {
                "parts": [{"text": prompt_content}]
            }
        ],
        "generationConfig": {
            "response_mime_type": "application/json",
            "temperature": 0.7,
        },
    }


# Global cache of discovered working models per API key: api_key -> list of (api_version, model_path)
_DISCOVERED_MODELS_CACHE: dict[str, list[tuple[str, str]]] = {}


def discover_supported_models(api_key: str, client: httpx.Client) -> list[tuple[str, str]]:
    """Query Google AI Studio ModelService.ListModels to get the exact models available for this API key."""
    if api_key in _DISCOVERED_MODELS_CACHE and _DISCOVERED_MODELS_CACHE[api_key]:
        return _DISCOVERED_MODELS_CACHE[api_key]

    discovered: list[tuple[str, str]] = []

    for api_version in ("v1beta", "v1"):
        try:
            list_url = f"https://generativelanguage.googleapis.com/{api_version}/models?key={api_key}"
            resp = client.get(list_url, timeout=12.0)
            if resp.status_code == 200:
                data = resp.json()
                for m in data.get("models", []):
                    methods = m.get("supportedGenerationMethods", [])
                    if "generateContent" in methods:
                        m_name = m.get("name", "")
                        if m_name:
                            discovered.append((api_version, m_name))
        except Exception as e:
            logger.info("ListModels on %s returned: %s", api_version, e)

    if discovered:
        # Score and rank available models
        def score_model(item: tuple[str, str]) -> int:
            ver, name = item
            n = name.lower()
            s = 0
            if "2.5-flash" in n:
                s += 100
            elif "2.0-flash" in n:
                s += 90
            elif "flash" in n and ("latest" in n or "002" in n or "001" in n):
                s += 80
            elif "flash" in n:
                s += 70
            elif "pro" in n:
                s += 50
            elif "gemini" in n:
                s += 40
            if ver == "v1beta":
                s += 5
            return s

        sorted_models = sorted(discovered, key=score_model, reverse=True)
        _DISCOVERED_MODELS_CACHE[api_key] = sorted_models
        logger.info("Discovered %d models for API key: best is %s", len(sorted_models), sorted_models[0])
        return sorted_models

    # Fallback static candidates if ListModels was not reachable
    fallbacks = [
        ("v1beta", "models/gemini-2.5-flash"),
        ("v1beta", "models/gemini-2.0-flash"),
        ("v1beta", "models/gemini-2.0-flash-exp"),
        ("v1beta", "models/gemini-1.5-flash-latest"),
        ("v1beta", "models/gemini-1.5-flash-002"),
        ("v1beta", "models/gemini-1.5-flash-001"),
        ("v1beta", "models/gemini-1.5-flash"),
        ("v1", "models/gemini-1.5-flash"),
        ("v1beta", "models/gemini-1.5-pro"),
        ("v1", "models/gemini-pro"),
    ]
    return fallbacks


def call_gemini_batch(
    items: list[dict[str, Any]],
    user_prompt: str,
    brand: str,
    model_code: str,
    model: str,
    series: str,
    api_key: str,
) -> dict[str, dict[str, str]]:
    """Call Google AI Studio REST API for a batch of parts and return a mapping of fig_no -> {meta_description, product_description}."""
    payload = _build_gemini_payload(
        items=items,
        user_prompt=user_prompt,
        brand=brand,
        model_code=model_code,
        model=model,
        series=series,
    )

    last_error = None
    with httpx.Client(timeout=45.0) as client:
        models_to_try = discover_supported_models(api_key, client)

        for api_version, model_identifier in models_to_try:
            clean_path = model_identifier if model_identifier.startswith("models/") else f"models/{model_identifier}"
            url = f"https://generativelanguage.googleapis.com/{api_version}/{clean_path}:generateContent?key={api_key}"
            try:
                resp = client.post(url, json=payload)
                if resp.status_code == 200:
                    resp_json = resp.json()
                    candidates = resp_json.get("candidates", [])
                    if candidates:
                        text_content = candidates[0].get("content", {}).get("parts", [{}])[0].get("text", "")
                        if text_content:
                            # Strip markdown code blocks if Gemini returns ```json ... ```
                            text_content = text_content.strip()
                            if text_content.startswith("```"):
                                text_content = re.sub(r"^```(?:json)?\s*", "", text_content)
                                text_content = re.sub(r"\s*```$", "", text_content)

                            parsed = json.loads(text_content)
                            results_map = {}
                            for res_it in parsed.get("items", []):
                                f_no = str(res_it.get("fig_no", "")).strip()
                                p_name = str(res_it.get("part_name", "")).strip()
                                key = f_no or p_name
                                results_map[key] = {
                                    "meta_description": res_it.get("meta_description", ""),
                                    "product_description": res_it.get("product_description", ""),
                                }

                            # Remember this successful model at top of cache
                            _DISCOVERED_MODELS_CACHE[api_key] = [(api_version, model_identifier)] + [
                                m for m in models_to_try if m != (api_version, model_identifier)
                            ]
                            return results_map
                elif resp.status_code in (404, 400):
                    last_error = f"{clean_path} ({api_version}) HTTP {resp.status_code}: {resp.text}"
                    logger.info("Model %s returned %s, trying next...", clean_path, resp.status_code)
                    continue
                else:
                    last_error = f"HTTP {resp.status_code}: {resp.text}"
                    logger.warning("Gemini API call failed (%s): %s", resp.status_code, resp.text)
                    break
            except Exception as e:
                last_error = str(e)
                logger.warning("Gemini request exception with %s: %s", clean_path, e)
                continue

    raise RuntimeError(f"Google AI Studio API error: {last_error or 'No supported model response generated'}")


def enhance_metadata_with_gemini(
    metadata_items: list[dict[str, Any]],
    user_prompt: str = "",
    brand: str = "YAMAHA",
    model_code: str = "MODEL",
    model: str = "",
    series: str = "series",
    api_key: Optional[str] = None,
    batch_size: int = 15,
) -> list[dict[str, Any]]:
    """Process a list of metadata items through Gemini AI Studio, then enforce all strict constraints:
    - 151-158 characters for meta description
    - 120-140 words for product description
    - Zero commas
    - 'India Spare' proper casing
    - Fallback gracefully to existing descriptions if an item fails
    """
    key = (api_key or os.getenv("GEMINI_API_KEY") or "").strip()
    if not key:
        raise ValueError("Google AI Studio API key not found. Please provide an API key or set GEMINI_API_KEY environment variable.")

    prompt_to_use = user_prompt.strip() or DEFAULT_AI_PROMPT
    m_disp = f"{model_code} {model}".strip() if model else model_code

    # Process items in batches of `batch_size` to avoid token/output truncation
    enhanced_items = [dict(it) for it in metadata_items]
    batches = [enhanced_items[i : i + batch_size] for i in range(0, len(enhanced_items), batch_size)]

    for batch in batches:
        try:
            ai_results = call_gemini_batch(
                items=batch,
                user_prompt=prompt_to_use,
                brand=brand,
                model_code=model_code,
                model=model,
                series=series,
                api_key=key,
            )
        except Exception as e:
            logger.error("Failed to generate AI batch: %s. Preserving rule-based metadata.", e)
            raise e

        # Post-process every item in this batch with strict mathematical validation
        for it in batch:
            f_no = str(it.get("fig_no", "")).strip()
            p_name = str(it.get("part_name", "")).strip()
            ai_data = ai_results.get(f_no) or ai_results.get(p_name) or {}

            raw_meta = ai_data.get("meta_description")
            raw_prod = ai_data.get("product_description")

            if raw_meta:
                cleaned_meta = clean_no_commas(raw_meta)
                cased_meta = format_india_spare(cleaned_meta)
                valid_meta = enforce_meta_desc_length(cased_meta)
                it["meta_description"] = valid_meta
                it["meta_long_description"] = valid_meta
                it["meta_desc_chars"] = len(valid_meta)
                it["long_desc_length"] = len(valid_meta)

            if raw_prod:
                valid_prod = enforce_product_desc_words(
                    text=raw_prod,
                    brand=brand,
                    model_str=m_disp,
                    part_name=p_name or "PARTS ASSEMBLY",
                )
                it["product_description"] = valid_prod
                it["product_desc_words"] = len(valid_prod.split())

            it["ai_generated"] = bool(raw_meta or raw_prod)

    return enhanced_items
