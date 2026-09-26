"""Google AI Studio (Gemini) Integration for Product & SEO Metadata Generation.

Generates unique, high-converting eCommerce meta descriptions and product descriptions
using Gemini 2.5 Flash / Gemini 2.0 Flash via Google AI Studio API, with automated
post-processing to enforce strict character and word count boundaries:
- Meta Description: strictly 151-158 characters, no commas, 'India Spare' properly cased.
- Product Description: strictly 120-140 words, no commas, 'India Spare' properly cased.
- Short Description & Meta Title: preserve Brand, Model, Series after Model, and Model Code.
"""

import concurrent.futures
import json
import logging
import os
import random
import re
import time
from typing import Any, Optional

import httpx

from app.meta_generator import (
    build_meta_description,
    build_product_description,
    clean_no_commas,
    enforce_meta_desc_length,
    format_india_spare,
    preserve_caps,
    prompt_references_child_cells,
)
from app.parts_extractor import clean_part_number

logger = logging.getLogger(__name__)

# Primary & fallback Gemini models on Google AI Studio
GEMINI_MODELS = [
    "gemini-2.5-flash",
    "gemini-2.0-flash",
    "gemini-1.5-flash",
]

DEFAULT_AI_PROMPT = (
    "Analyze both the Extracted Parts Catalogue Excel record and SEO Metadata record for each component. "
    "Evaluate OEM part numbers, clean part numbers, assembly diagram context, model quantities, and remarks alongside vehicle branding. "
    "Generate authentic eCommerce descriptions emphasizing OEM factory specifications, precision dimensional fitment, "
    "high heat and stress resistance, long-term road safety, and IndiaSpare verified quality guarantee."
)


def enforce_product_desc_words(
    text: str,
    brand: str = "YAMAHA",
    model_str: str = "MODEL",
    part_name: str = "PART",
    seed: Optional[int] = None,
    model: str = "",
    model_code: str = "",
    user_prompt: str = "",
) -> str:
    """Ensure product description is strictly bounded between 120 and 140 words without commas,
    strictly preserving 'IndiaSpare' proper casing, user prompt themes, and model in ALL CAPS per user mandate.
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

    # Engaging, storytelling automotive sentences focused on rider experience and peace of mind (0 commas)
    addon_paragraphs = [
        f"This authentic {brand} {model_str} {part_name} is an original OEM factory specification component designed specifically for your vehicle assembly.",
        "Starting your two wheeler effortlessly every morning brings pure confidence and joy to your daily journey.",
        "Navigating busy city streets and highway stretches feels smooth comfortable and relaxing on every ride.",
        "This genuine replacement part keeps your vehicle running with original showroom smoothness and quiet efficiency.",
        "Riding on rough roads and potholes is safer when your two wheeler has authentic factory parts installed.",
        "Enjoy crisp throttle response and dependable power delivery whenever you accelerate on city roads or open highways.",
        "Every weekend road trip and daily office commute becomes more enjoyable and worry free with authentic spares.",
        "Protect your two wheeler against unexpected breakdowns by choosing verified genuine factory components.",
        f"Order your authentic {brand} {model_str} {part_name} diagram spare from IndiaSpare today.",
        "We deliver 100% genuine factory spares with verified vehicle fitment secure protective packaging and dependable courier delivery right to your doorstep across India.",
        "Ride with absolute peace of mind knowing your vehicle is equipped with verified genuine factory spares.",
        "Keep your motorcycle feeling as smooth responsive and fun to ride as the day you brought it home.",
        "Upgrade your motorcycle with confidence using certified factory parts built for durability and road safety.",
        "Each genuine component undergoes careful factory inspection to ensure dependable operating performance.",
        "Trust IndiaSpare for authentic OEM replacement parts backed by verified vehicle fitment and rapid delivery.",
        "Professional installation following standard manufacturer guidelines guarantees maximum vehicle longevity.",
        "Keep your motorcycle performing at peak efficiency under all demanding road and weather conditions.",
        "Count on IndiaSpare for certified genuine OEM diagram replacement components dispatched quickly with secure protective transit.",
    ]

    # If user prompt has custom directives, prioritize prompt-tailored padding sentences
    clean_p = clean_no_commas(user_prompt or "").strip()
    if clean_p:
        skip_words = {
            "generate", "descriptions", "for", "the", "and", "with",
            "please", "each", "both", "excel", "pdf", "record", "parts",
            "catalogue", "extracted", "metadata", "component", "components", "oem"
        }
        p_terms = [w for w in clean_p.split() if w.lower() not in skip_words and len(w) > 2]
        if len(p_terms) >= 3:
            theme = " ".join(p_terms[:6])
            addon_paragraphs.insert(
                0,
                f"Engineered specifically to satisfy rider requirements for {theme} across challenging terrain.",
            )
            addon_paragraphs.insert(
                1,
                f"Delivers dependable OEM factory performance tailored for {theme} and long lasting mechanical endurance.",
            )

    rng = random.Random(seed) if seed is not None else random.Random()
    shuffled_addons = list(addon_paragraphs)
    rng.shuffle(shuffled_addons)

    for s in shuffled_addons:
        if len(words) < 120:
            clean_s = clean_no_commas(s)
            if clean_s.lower() not in clean_text.lower():
                clean_text = clean_text.rstrip(".") + ". " + clean_s
                words = clean_text.split()
        else:
            break

    # Final padding words loop if still slightly under 120 (rotated with offset)
    filler_pool = [
        "All", "parts", "meet", "strict", "factory", "quality", "standards",
        "and", "provide", "uncompromised", "safety", "on", "every", "journey", "across",
        "all", "road", "conditions", "without", "exception", "delivering", "smooth",
        "rides", "and", "lasting", "peace", "of", "mind", "for", "your", "motorcycle",
        "riding", "needs", "every", "single", "day", "with", "verified", "reliability",
        "and", "superb", "daily", "endurance", "on", "every", "highway", "stretch",
    ]
    offset = rng.randint(0, len(filler_pool) - 12) if len(filler_pool) > 15 else 0
    rotated_filler = filler_pool[offset:] + filler_pool[:offset]

    while len(words) < 120:
        needed = 120 - len(words)
        chunk = rotated_filler[:needed] if needed <= len(rotated_filler) else rotated_filler
        clean_text = clean_text.rstrip(".") + ". " + " ".join(chunk) + "."
        words = clean_text.split()

    # Ensure IndiaSpare is guaranteed to be present
    if "indiaspare" not in clean_text.lower() and "india spare" not in clean_text.lower():
        words = clean_text.rstrip(".").split()
        if len(words) >= 137:
            words = words[:134]
        clean_text = " ".join(words) + " from IndiaSpare."
        words = clean_text.split()

    if len(words) > 140:
        words = words[:135]
        clean_text = " ".join(words).rstrip(".") + "."

    return preserve_caps(clean_text, model=model, model_code=model_code)


def _build_gemini_payload(
    items: list[dict[str, Any]],
    user_prompt: str,
    brand: str,
    model_code: str,
    model: str,
    series: str,
    generation_cycle: Optional[str] = None,
    seed: Optional[int] = None,
) -> dict[str, Any]:
    """Build the JSON request payload for Google AI Studio generateContent endpoint,
    bundling both the Extracted Parts Catalogue Record and SEO Metadata Record for dual-record analysis.
    Guarantees unique generation on every click and prompt input via dynamic cycle token, random seed,
    high temperature (0.95), top_p (0.95), and explicit freshness directives.
    """
    cycle_token = generation_cycle or f"RUN-{int(time.time() * 1000) % 1000000}-{random.randint(1000, 9999)}"
    run_seed = seed if seed is not None else random.randint(1, 2147483647)

    system_instruction = (
        "You are an expert automotive parts specialist and storytelling eCommerce copywriter for 'IndiaSpare', "
        "an authentic OEM motorcycle and scooter spare parts supplier in India.\n\n"
        "=== SUPREME PRIORITY DIRECTIVE: USER'S PROMPT IS LAW ===\n"
        "Whenever the user enters custom prompt directives, instructions, keywords, or focus areas, you MUST prioritize "
        "them above all else! Incorporate the user's specific tone, keywords, warranty terms, themes (e.g. smooth ride, "
        "morning commute, highway touring, monsoon safety, rough roads, durable packaging), and value propositions directly "
        "into the analysis, meta description, and product description. Never produce generic canned boilerplate that ignores the user prompt.\n\n"
        "=== STORYTELLING & SIMPLE ACCESSIBLE ENGLISH (MANDATORY) ===\n"
        "Do NOT use complex, dense academic English or engineering jargon (avoid words like 'metallurgical alloys', "
        "'operational clearances', 'harmonic vibrations', 'dimensional tolerances', 'premature wear', 'abrasive contaminants'). "
        "Instead, write EASY-TO-READ, ENGAGING, STORYTELLING English that connects the part to the rider's real-world experience: "
        "effortless morning starts, smooth acceleration, peaceful city commuting, confident highway cruising, peace of mind on rough roads "
        "and potholes, and trusted factory reliability from IndiaSpare.\n\n"
        "=== UNIVERSAL COVERAGE: GENERATE FOR ALL PARENT AND CHILD RECORDS ===\n"
        "You must generate relevant, unique descriptions for EVERY item in the batch: both parent assemblies (e.g. CYLINDER HEAD) "
        "and individual child component parts (e.g. VALVE STEM SEAL, GASKET, BOLT). Ground child part descriptions in their specific part name "
        "and parent assembly context.\n\n"
        "DUAL-RECORD ARCHITECTURE:\n"
        "For each part assembly, you are provided with TWO distinct Excel records:\n"
        "1. 'extracted_parts_catalogue_record': Contains raw extracted engineering catalogue data from the PDF "
        "(item_id, is_parent, parent_assembly, page, fig_no, catalog_name, ref_no, OEM part_no, clean_part_no, model_quantities, remarks, and "
        "the complete list of extracted child components under 'extracted_components_list').\n"
        "2. 'seo_metadata_record': Contains customer-facing SEO & vehicle metadata "
        "(brand, model_code, model, series, pic image filename, short_description title in CAPS, and meta_title).\n\n"
        "MANDATORY TWO-STEP PROCEDURE:\n"
        "STEP 1 - DUAL-RECORD ANALYSIS:\n"
        "Before generating descriptions, you MUST systematically analyze BOTH Excel records together. "
        "Examine the figure assembly, the OEM part number, clean part number format, and components. "
        "Provide a concise, grounded technical analysis in the 'analysis' field reflecting both records and the user prompt.\n\n"
        "STEP 2 - GENERATE DESCRIPTIONS GROUNDED IN ANALYSIS & USER PROMPT:\n"
        "Using your Step 1 analysis as direct grounding, generate:\n"
        "- 'meta_description': strictly 151 to 158 characters, zero commas, exact proper casing 'IndiaSpare'. "
        "Must be a high-converting eCommerce SEO summary with vehicle fitment and IndiaSpare genuine guarantee.\n"
        "- 'product_description': strictly 120 to 140 words, zero commas, exact proper casing 'IndiaSpare'. "
        "Must detail genuine OEM factory specifications, easy replacement, rider confidence, and IndiaSpare verified reliability, thoroughly reflecting the user prompt.\n\n"
        "MANDATORY FRESHNESS & UNIQUENESS ON EVERY SINGLE GENERATION RUN:\n"
        "- On EVERY SINGLE generation run, you MUST produce completely original, unique, and fresh copywriting. "
        "NEVER repeat identical sentence structures, cliches, or openers across clicks or runs. Changing prompts must produce completely distinct outputs.\n\n"
        "CRITICAL RULES:\n"
        "1. ZERO COMMAS: Do NOT include ANY commas (,) in any field (analysis, meta_description, product_description).\n"
        "2. EXACT CASING: Strictly use 'IndiaSpare' (no spaces, never 'indiaspare' or 'INDIA SPARE').\n"
        "3. WORD & CHAR LIMITS: Meta description must be 151-158 characters; product description must be 120-140 words.\n"
        "4. OUTPUT FORMAT: Return a valid JSON object matching the requested schema with 'item_id', 'fig_no', 'part_name', 'analysis', 'meta_description', and 'product_description'."
    )

    parts_catalog_data = []
    for idx, it in enumerate(items):
        # Collect dynamic model quantities from item (e.g. BGPJ: 1, BGPL: 1, etc.)
        model_quantities: dict[str, Any] = {}
        for k, v in it.items():
            if re.match(r"^[A-Z0-9]{3,6}$", str(k).upper()) and str(k).upper() not in {
                "ID", "PAGE", "FIG_NO", "REF_NO", "PART_NO", "CLEAN_PART_NO",
                "BRAND", "MODEL_CODE", "MODEL", "SERIES"
            }:
                if v is not None and str(v).strip() != "":
                    model_quantities[str(k)] = str(v)

        is_parent = bool(it.get("is_parent", True))
        p_no = str(it.get("part_no") or "")
        c_p_no = str(it.get("clean_part_no") or (clean_part_number(p_no) if p_no else ""))
        p_name = str(it.get("description") or it.get("part_name") or it.get("fig_name") or "")
        parent_assembly_name = str(it.get("parent_fig_name") or it.get("part_name") or "")
        b_val = brand or str(it.get("brand", "YAMAHA"))
        mc_val = model_code or str(it.get("model_code", "MODEL"))
        m_val = model or str(it.get("model", ""))
        s_val = series or str(it.get("series", "series"))

        components_list = it.get("assembly_components") or []
        extracted_cat_record: dict[str, Any] = {
            "item_id": f"item_{idx}",
            "is_parent": is_parent,
            "parent_assembly": parent_assembly_name,
            "page": it.get("page", 1),
            "fig_no": str(it.get("parent_fig_no") or it.get("fig_no", "")),
            "catalog_name": parent_assembly_name or p_name,
            "ref_no": str(it.get("ref_no", "1")),
            "part_no": p_no,
            "clean_part_no": c_p_no,
            "model_quantities": model_quantities if model_quantities else {mc_val: "1"},
            "remarks": str(it.get("remarks", "")),
        }
        if components_list:
            extracted_cat_record["total_extracted_assembly_components"] = len(components_list)
            extracted_cat_record["extracted_components_list"] = [
                {
                    "ref_no": str(c.get("ref_no", "")),
                    "part_no": str(c.get("part_no", "")),
                    "clean_part_no": str(c.get("clean_part_no", "")),
                    "description": str(c.get("description", "")),
                    "remarks": str(c.get("remarks", "")),
                }
                for c in components_list[:25]
            ]

        parts_catalog_data.append({
            "item_id": f"item_{idx}",
            "is_parent": is_parent,
            "fig_no": str(it.get("parent_fig_no") or it.get("fig_no", "")),
            "part_name": p_name,
            "parent_assembly": parent_assembly_name,
            # Record 1: Extracted Parts Catalogue Excel Record
            "extracted_parts_catalogue_record": extracted_cat_record,
            # Record 2: SEO & Vehicle Metadata Excel Record
            "seo_metadata_record": {
                "brand": b_val,
                "model_code": mc_val,
                "model": m_val,
                "series": s_val,
                "pic": str(it.get("image_filename", "")),
                "short_description": str(it.get("product_title", "")),
                "meta_title": str(it.get("meta_title", "")),
            },
        })

    clean_prompt = user_prompt.strip() or DEFAULT_AI_PROMPT
    prompt_content = (
        f"=== GENERATION RUN CYCLE TOKEN: [{cycle_token}] (FRESH CREATIVE RUN) ===\n"
        f"=== USER'S CUSTOM COPYWRITING DIRECTIVES (HIGHEST PRIORITY) ===\n"
        f"{clean_prompt}\n\n"
        f"MANDATORY INSTRUCTION: You must analyze BOTH Excel records ('extracted_parts_catalogue_record' and 'seo_metadata_record') "
        f"for each of the {len(parts_catalog_data)} parts listed below before generating the descriptions.\n"
        f"IMPORTANT: Deeply integrate the user's custom directives above into your analysis and storytelling descriptions. "
        f"Every single run must produce unique, non-repetitive copywriting with varied sentence structures and fresh vocabulary.\n\n"
        f"PARTS DUAL-RECORD DATA (INCLUDING EXTRACTED COMPONENTS):\n"
        f"{json.dumps(parts_catalog_data, indent=2)}\n\n"
        "Return a valid JSON object in this exact structure:\n"
        "{\n"
        '  "items": [\n'
        '    {\n'
        '      "item_id": "item_0",\n'
        '      "fig_no": "1",\n'
        '      "part_name": "CYLINDER HEAD",\n'
        '      "analysis": "Analyzed Record 1 and Record 2 for CYLINDER HEAD BGP-E1111-00 YAMAHA BGPK RAY ZR. Factory OEM casting ensuring smooth engine performance and rider safety.",\n'
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
            "temperature": 0.95,
            "top_p": 0.95,
            "seed": run_seed,
        },
    }


# Global cache of discovered working models per API key: api_key -> list of (api_version, model_path)
_DISCOVERED_MODELS_CACHE: dict[str, list[tuple[str, str]]] = {}

# Substrings identifying models unsuitable for text copywriting (e.g. image generation, embeddings, audio)
NON_TEXT_SUBSTRINGS = (
    "-image",
    "preview-image",
    "imagen",
    "embedding",
    "embed",
    "audio",
    "tts",
    "voice",
    "realtime",
    "learnlm",
    "aqa",
    "computer-use",
    "robotics",
)


def _parse_retry_delay(resp_text: str) -> Optional[float]:
    """Extract retry delay seconds from Google AI Studio 429 response if present."""
    try:
        data = json.loads(resp_text)
        details = data.get("error", {}).get("details", [])
        for d in details:
            if d.get("@type", "").endswith("RetryInfo"):
                delay_str = d.get("retryDelay", "")
                if delay_str.endswith("s"):
                    return float(delay_str[:-1])
    except Exception:
        pass
    m = re.search(r"retry in ([\d\.]+)s", resp_text, re.IGNORECASE)
    if m:
        try:
            return float(m.group(1))
        except ValueError:
            pass
    return None


def discover_supported_models(api_key: str, client: httpx.Client) -> list[tuple[str, str]]:
    """Query Google AI Studio ModelService.ListModels to get the exact text models available for this API key."""
    if api_key in _DISCOVERED_MODELS_CACHE and _DISCOVERED_MODELS_CACHE[api_key]:
        return _DISCOVERED_MODELS_CACHE[api_key]

    discovered: list[tuple[str, str]] = []

    for api_version in ("v1beta", "v1"):
        try:
            list_url = f"https://generativelanguage.googleapis.com/{api_version}/models?key={api_key}"
            resp = client.get(list_url, timeout=8.0)
            if resp.status_code == 200:
                data = resp.json()
                for m in data.get("models", []):
                    methods = m.get("supportedGenerationMethods", [])
                    if "generateContent" in methods:
                        m_name = m.get("name", "")
                        if m_name:
                            n_lower = m_name.lower()
                            # Exclude image/audio/embedding models that fail with 0 quota on free tier
                            if any(sub in n_lower for sub in NON_TEXT_SUBSTRINGS):
                                continue
                            discovered.append((api_version, m_name))
            elif resp.status_code == 403:
                err_text = resp.text
                raise ValueError(
                    "Google AI Studio permission denied (HTTP 403). Your Google Cloud project has been denied access or the key is unauthorized. "
                    "Please create a new API key under an active project at https://aistudio.google.com/app/apikey or switch to Rule-Based Mode."
                )
            elif resp.status_code == 400:
                err_text = resp.text
                if (
                    "API_KEY_INVALID" in err_text
                    or "not valid" in err_text.lower()
                    or "key expired" in err_text.lower()
                ):
                    raise ValueError(
                        "Google AI Studio API key is invalid or unauthorized (HTTP 400). Please verify your API key at https://aistudio.google.com/app/apikey or switch to Rule-Based Mode."
                    )
        except ValueError:
            raise
        except Exception as e:
            logger.info("ListModels on %s returned: %s", api_version, e)

    if discovered:
        # Score and rank available text models
        def score_model(item: tuple[str, str]) -> int:
            ver, name = item
            n = name.lower()
            s = 0
            # Gemini 2.0 Flash and Flash-Lite are Google AI Studio's fastest production text models
            if "2.0-flash" in n and "lite" not in n:
                s += 120
            elif "2.0-flash-lite" in n or "flash-lite" in n:
                s += 118
            elif "2.5-flash" in n:
                s += 115
            elif "1.5-flash" in n and ("latest" in n or "002" in n or "001" in n):
                s += 95
            elif "1.5-flash" in n:
                s += 90
            elif "1.5-flash-8b" in n:
                s += 85
            elif "2.0-pro" in n or "2.5-pro" in n:
                s += 60
            elif "1.5-pro" in n:
                s += 50
            elif "gemini" in n:
                s += 30

            if ver == "v1beta":
                s += 2
            return s

        sorted_models = sorted(discovered, key=score_model, reverse=True)
        _DISCOVERED_MODELS_CACHE[api_key] = sorted_models
        logger.info("Discovered %d models for API key: best is %s", len(sorted_models), sorted_models[0])
        return sorted_models

    # Fallback static candidates if ListModels was not reachable (prioritizing stable, fast flash models)
    fallbacks = [
        ("v1beta", "models/gemini-2.0-flash"),
        ("v1beta", "models/gemini-2.0-flash-lite"),
        ("v1beta", "models/gemini-flash-lite-latest"),
        ("v1beta", "models/gemini-2.5-flash"),
        ("v1beta", "models/gemini-1.5-flash-latest"),
        ("v1beta", "models/gemini-1.5-flash-002"),
        ("v1beta", "models/gemini-1.5-flash"),
        ("v1", "models/gemini-2.0-flash"),
        ("v1", "models/gemini-1.5-flash"),
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
    generation_cycle: Optional[str] = None,
    seed: Optional[int] = None,
) -> dict[str, dict[str, str]]:
    """Call Google AI Studio REST API for a batch of parts and return a mapping of fig_no -> {meta_description, product_description}."""
    payload = _build_gemini_payload(
        items=items,
        user_prompt=user_prompt,
        brand=brand,
        model_code=model_code,
        model=model,
        series=series,
        generation_cycle=generation_cycle,
        seed=seed,
    )

    last_error = None
    with httpx.Client(timeout=25.0) as client:
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
                                item_id = str(res_it.get("item_id", "")).strip()
                                f_no = str(res_it.get("fig_no", "")).strip()
                                p_name = str(res_it.get("part_name", "")).strip()
                                p_no = str(res_it.get("part_no", "")).strip()
                                ref = str(res_it.get("ref_no", "")).strip()
                                entry = {
                                    "analysis": res_it.get("analysis", ""),
                                    "meta_description": res_it.get("meta_description", ""),
                                    "product_description": res_it.get("product_description", ""),
                                }
                                if item_id:
                                    results_map[item_id] = entry
                                if f_no and ref:
                                    results_map[f"{f_no}_{ref}"] = entry
                                if p_no:
                                    results_map[p_no] = entry
                                if f_no and f_no not in results_map:
                                    results_map[f_no] = entry
                                if p_name and p_name not in results_map:
                                    results_map[p_name] = entry

                            # Remember this successful model at top of cache
                            _DISCOVERED_MODELS_CACHE[api_key] = [(api_version, model_identifier)] + [
                                m for m in models_to_try if m != (api_version, model_identifier)
                            ]
                            return results_map
                elif resp.status_code == 403:
                    err_text = resp.text
                    raise ValueError(
                        "Google AI Studio permission denied (HTTP 403). Your Google Cloud project has been denied access or the key is unauthorized. "
                        "Please create a new API key under an active project at https://aistudio.google.com/app/apikey or switch to Rule-Based Mode."
                    )
                elif resp.status_code in (404, 400):
                    err_text = resp.text
                    if "API_KEY_INVALID" in err_text or "not valid" in err_text.lower():
                        raise ValueError(
                            "Google AI Studio API key is invalid or unauthorized. Please verify your API key at https://aistudio.google.com/app/apikey or switch to Rule-Based Mode."
                        )
                    last_error = f"{clean_path} ({api_version}) HTTP {resp.status_code}: {resp.text}"
                    logger.info("Model %s returned %s, trying next...", clean_path, resp.status_code)
                    continue
                elif resp.status_code == 429:
                    last_error = f"{clean_path} ({api_version}) HTTP 429: {resp.text}"
                    logger.warning(
                        "Model %s returned HTTP 429 (quota or rate-limit). Purging from cache and trying next candidate model...",
                        clean_path,
                    )
                    # Quotas in Google AI Studio Free Tier are tracked per model. If this model has 0 quota or is exhausted,
                    # purge it from the key's discovered cache so subsequent calls don't waste time on it.
                    if api_key in _DISCOVERED_MODELS_CACHE:
                        _DISCOVERED_MODELS_CACHE[api_key] = [
                            m for m in _DISCOVERED_MODELS_CACHE[api_key] if m != (api_version, model_identifier)
                        ]
                    continue
                else:
                    last_error = f"{clean_path} ({api_version}) HTTP {resp.status_code}: {resp.text}"
                    logger.warning("Gemini API call failed (%s): %s", resp.status_code, resp.text)
                    continue
            except ValueError:
                raise
            except Exception as e:
                last_error = str(e)
                logger.warning("Gemini request exception with %s: %s", clean_path, e)
                continue

    if last_error and "429" in last_error:
        delay = _parse_retry_delay(last_error)
        retry_msg = f"Please retry in {int(delay)} seconds." if delay else "Please retry shortly or verify your Google AI Studio quota."
        raise RuntimeError(f"Google AI Studio rate limit or quota exceeded across models. {retry_msg} ({last_error})")

    raise RuntimeError(f"Google AI Studio API error: {last_error or 'No supported model response generated'}")


def enhance_metadata_with_gemini(
    metadata_items: list[dict[str, Any]],
    user_prompt: str = "",
    brand: str = "YAMAHA",
    model_code: str = "MODEL",
    model: str = "",
    series: str = "series",
    api_key: Optional[str] = None,
    batch_size: int = 8,
    generation_id: Optional[str] = None,
    fallback_on_error: bool = True,
) -> list[dict[str, Any]]:
    """Process a list of metadata items through Gemini AI Studio, then enforce all strict constraints:
    - 151-158 characters for meta description
    - 120-140 words for product description
    - Zero commas
    - 'IndiaSpare' proper casing
    - Fallback gracefully to existing descriptions if an item fails
    - Guarantees completely unique output on every click and prompt change
    - Universal parent and child generation: every assembly and child record receives
      grounded storytelling metadata. Child product_title & meta_title remain strictly blank.
    """
    key = (api_key or os.getenv("GEMINI_API_KEY") or "").strip()
    if not key:
        raise ValueError("Google AI Studio API key not found. Please provide an API key or set GEMINI_API_KEY environment variable.")

    prompt_to_use = user_prompt.strip() or DEFAULT_AI_PROMPT
    m_disp = f"{model_code} {model}".strip() if model else model_code
    base_gen_id = generation_id or f"gen_{int(time.time() * 1000)}_{random.randint(1000, 9999)}"

    enhanced_items = [dict(it) for it in metadata_items]
    for it in enhanced_items:
        if it.get("is_parent") is False:
            it["product_title"] = ""
            it["meta_title"] = ""

    # Universal generation: All items (parent assemblies and child parts) receive
    # unique storytelling SEO descriptions. Child product_title & meta_title remain strictly blank.
    target_items = enhanced_items

    if not target_items:
        return enhanced_items

    batches = [target_items[i : i + batch_size] for i in range(0, len(target_items), batch_size)]

    for idx, batch in enumerate(batches):
        batch_cycle = f"{base_gen_id}_batch_{idx}"
        batch_seed = random.randint(1, 2147483647)
        if idx > 0:
            time.sleep(1.5)
        try:
            ai_results = call_gemini_batch(
                items=batch,
                user_prompt=prompt_to_use,
                brand=brand,
                model_code=model_code,
                model=model,
                series=series,
                api_key=key,
                generation_cycle=batch_cycle,
                seed=batch_seed,
            )
        except Exception as e:
            err_str = str(e)
            logger.error("Failed to generate AI batch %d: %s.", idx, err_str)
            if not fallback_on_error:
                raise e
            if (
                "API key not valid" in err_str
                or "API_KEY_INVALID" in err_str
                or "not found" in err_str.lower()
                or "invalid or unauthorized" in err_str.lower()
                or "permission denied" in err_str.lower()
                or "permission_denied" in err_str.lower()
            ):
                raise RuntimeError(err_str)
            # Graceful fallback: for items in this batch, populate rule-based descriptions
            # so the user is never stuck with blank descriptions or failed screen!
            logger.warning("Using rule-based fallback for batch %d: %s", idx, err_str)
            for it_idx, it in enumerate(batch):
                item_seed = (batch_seed + it_idx * 7919) % 2147483647
                is_parent = bool(it.get("is_parent", True))
                parent_asm = str(it.get("parent_fig_name") or it.get("fig_name") or "").strip()
                if is_parent:
                    p_name = str(it.get("parent_fig_name") or it.get("fig_name") or it.get("part_name") or it.get("description") or "PARTS ASSEMBLY").strip()
                else:
                    p_name = str(it.get("part_name") or it.get("description") or it.get("parent_fig_name") or "SPARE PART").strip()
                comps = it.get("assembly_components") or []
                r_meta = build_meta_description(
                    brand=brand,
                    model_code=model_code,
                    part_name=p_name,
                    model=model,
                    series=series,
                    seed=item_seed,
                    user_prompt=prompt_to_use,
                    parent_assembly=parent_asm if not is_parent else "",
                )
                r_prod = build_product_description(
                    brand=brand,
                    model_code=model_code,
                    part_name=p_name,
                    model=model,
                    series=series,
                    user_prompt=prompt_to_use,
                    assembly_components=comps,
                    parent_assembly=parent_asm if not is_parent else "",
                )
                it["meta_description"] = r_meta
                it["meta_long_description"] = r_meta
                it["meta_desc_chars"] = len(r_meta)
                it["long_desc_length"] = len(r_meta)
                it["product_description"] = r_prod
                it["product_desc_words"] = len(r_prod.split())
                it["ai_analysis"] = f"Analyzed {p_name} ({len(comps)} components) with user prompt directives applied."
                it["ai_generated"] = False
                it["ai_notice"] = f"Generated via rule-based fallback ({err_str[:120]})"
            continue

        # Post-process every item in this batch with strict mathematical validation
        for it_idx, it in enumerate(batch):
            item_seed = (batch_seed + it_idx * 7919) % 2147483647
            item_id = str(it.get("item_id") or it.get("id") or "").strip()
            is_parent = bool(it.get("is_parent", True))
            f_no = str(it.get("parent_fig_no") or it.get("fig_no", "")).strip()
            parent_asm = str(it.get("parent_fig_name") or it.get("fig_name") or "").strip()
            if is_parent:
                p_name = str(it.get("parent_fig_name") or it.get("fig_name") or it.get("part_name") or it.get("description") or "PARTS ASSEMBLY").strip()
            else:
                p_name = str(it.get("part_name") or it.get("description") or it.get("parent_fig_name") or "SPARE PART").strip()
            ref = str(it.get("ref_no", "")).strip()
            p_no = str(it.get("part_no", "")).strip()

            ai_data = (
                (ai_results.get(item_id) if item_id else None)
                or (ai_results.get(f"{f_no}_{ref}") if f_no and ref else None)
                or (ai_results.get(p_no) if p_no else None)
                or (ai_results.get(f_no) if is_parent else None)
                or ai_results.get(p_name)
                or {}
            )

            raw_analysis = ai_data.get("analysis")
            raw_meta = ai_data.get("meta_description")
            raw_prod = ai_data.get("product_description")

            if raw_analysis:
                cleaned_analysis = clean_no_commas(str(raw_analysis))
                it["ai_analysis"] = preserve_caps(cleaned_analysis, model=model, model_code=model_code)

            if raw_meta:
                cleaned_meta = clean_no_commas(raw_meta)
                cased_meta = format_india_spare(cleaned_meta)
                valid_meta = enforce_meta_desc_length(cased_meta, seed=item_seed, model=model, model_code=model_code)
                it["meta_description"] = valid_meta
                it["meta_long_description"] = valid_meta
                it["meta_desc_chars"] = len(valid_meta)
                it["long_desc_length"] = len(valid_meta)
            else:
                fallback_meta = build_meta_description(
                    brand=brand,
                    model_code=model_code,
                    part_name=p_name,
                    model=model,
                    series=series,
                    seed=item_seed,
                    user_prompt=prompt_to_use,
                    parent_assembly=parent_asm if not is_parent else "",
                )
                it["meta_description"] = fallback_meta
                it["meta_long_description"] = fallback_meta
                it["meta_desc_chars"] = len(fallback_meta)
                it["long_desc_length"] = len(fallback_meta)

            if raw_prod:
                valid_prod = enforce_product_desc_words(
                    text=raw_prod,
                    brand=brand,
                    model_str=m_disp,
                    part_name=p_name or "PARTS ASSEMBLY",
                    seed=item_seed,
                    model=model,
                    model_code=model_code,
                    user_prompt=prompt_to_use,
                )
                it["product_description"] = valid_prod
                it["product_desc_words"] = len(valid_prod.split())
            else:
                comps = it.get("assembly_components") or []
                fallback_prod = build_product_description(
                    brand=brand,
                    model_code=model_code,
                    part_name=p_name,
                    model=model,
                    series=series,
                    user_prompt=prompt_to_use,
                    assembly_components=comps,
                    parent_assembly=parent_asm if not is_parent else "",
                )
                it["product_description"] = fallback_prod
                it["product_desc_words"] = len(fallback_prod.split())

            it["ai_generated"] = bool(raw_meta or raw_prod or raw_analysis)

    return enhanced_items
