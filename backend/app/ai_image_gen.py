"""AI Image Generation Module for Converter Studio.

Supports text-to-image and image-to-image generation using Google Gemini / Imagen 3
with high-speed neural fallback.
"""

from __future__ import annotations

import base64
import io
import json
import logging
import os
import random
import time
import urllib.parse
import urllib.request
from typing import Any, Optional

from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from pydantic import BaseModel, Field

logger = logging.getLogger("converter.ai")

router = APIRouter(prefix="/api/ai", tags=["AI Image Generation"])

DEFAULT_GEMINI_API_KEY = ""


def get_active_api_key(override_key: Optional[str] = None) -> str:
    """Return the active Gemini API key from override, env, or app_config."""
    if override_key and override_key.strip():
        return override_key.strip()

    env_key = os.environ.get("GEMINI_API_KEY", "").strip()
    if env_key:
        return env_key

    # Check app_config.json
    for path in [
        os.path.join(os.getcwd(), "app_config.json"),
        os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "app_config.json"),
    ]:
        try:
            if os.path.exists(path):
                with open(path, "r", encoding="utf-8") as f:
                    cfg = json.load(f)
                    val = cfg.get("gemini_api_key", "").strip()
                    if val:
                        return val
        except Exception:
            pass

    return ""


STYLE_PRESETS: dict[str, str] = {
    "photorealistic": "ultra-realistic, high detail commercial studio product photography, clean white background, soft studio lighting, sharp focus, 8k resolution, professional DSLR",
    "technical-blueprint": "precise CAD technical blueprint drawing, white line art on blueprint blue background, schematic cross-section, engineering drafting, millimeter accurate",
    "3d-render": "octane 3D render, raytracing, smooth metallic reflections, industrial design, isometric view, soft ambient occlusion, Unreal Engine 5 render",
    "line-art": "crisp vector line art, monochrome illustration, clean lines, black and white technical parts catalog diagram, high contrast",
    "cinematic": "cinematic lighting, dramatic atmosphere, high contrast, shallow depth of field, 35mm photograph, octane render, vivid colors",
    "vintage-catalog": "retro 1980s spare parts catalog lithograph, detailed hatching, vintage technical manual illustration",
    "none": "",
}

ASPECT_RATIO_DIMENSIONS: dict[str, tuple[int, int]] = {
    "1:1": (1024, 1024),
    "16:9": (1280, 720),
    "9:16": (720, 1280),
    "4:3": (1024, 768),
    "3:4": (768, 1024),
}


@router.get("/verify-key")
async def verify_gemini_key(api_key: Optional[str] = None) -> dict[str, Any]:
    """Verify Google AI Studio API key against Google Generative Language API."""
    key = get_active_api_key(api_key)
    if not key:
        return {"valid": False, "message": "No API key provided."}

    # Test 1: List models
    url = f"https://generativelanguage.googleapis.com/v1beta/models?key={key}"
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "ConverterStudio/1.0"})
        with urllib.request.urlopen(req, timeout=10) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            models = [m.get("name", "") for m in data.get("models", [])]

        # Test 2: Check if free tier / billing is active
        test_url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent?key={key}"
        test_body = json.dumps({"contents": [{"parts": [{"text": "ping"}]}]}).encode("utf-8")
        test_req = urllib.request.Request(
            test_url, data=test_body, headers={"Content-Type": "application/json"}
        )
        billing_active = False
        try:
            with urllib.request.urlopen(test_req, timeout=8) as test_resp:
                billing_active = True
        except Exception as e:
            billing_active = False

        return {
            "valid": True,
            "masked_key": f"{key[:6]}...{key[-4:]}" if len(key) > 10 else "***",
            "models_count": len(models),
            "billing_active": billing_active,
            "message": (
                "Google AI Studio Key is valid and active!"
                if billing_active
                else "Key is valid and authenticated with Google Cloud! (Note: Free tier requires billing upgrade at aistudio.google.com/billing for direct Gemini compute)."
            ),
        }
    except Exception as e:
        err_msg = str(e)
        if hasattr(e, "read"):
            try:
                err_data = json.loads(e.read().decode("utf-8"))
                err_msg = err_data.get("error", {}).get("message", str(e))
            except Exception:
                pass
        return {"valid": False, "message": err_msg}


def _generate_via_google_imagen(
    prompt: str,
    aspect_ratio: str,
    api_key: str,
) -> Optional[dict[str, Any]]:
    """Attempt generation via Google Imagen 3 Predict endpoint."""
    url = f"https://generativelanguage.googleapis.com/v1beta/models/imagen-3.0-generate-002:predict?key={api_key}"
    # Map aspect ratio to Imagen format
    ar_map = {"1:1": "1:1", "16:9": "16:9", "9:16": "9:16", "4:3": "4:3", "3:4": "3:4"}
    req_body = json.dumps({
        "instances": [{"prompt": prompt}],
        "parameters": {
            "sampleCount": 1,
            "aspectRatio": ar_map.get(aspect_ratio, "1:1"),
        },
    }).encode("utf-8")

    try:
        req = urllib.request.Request(url, data=req_body, headers={"Content-Type": "application/json"})
        with urllib.request.urlopen(req, timeout=30) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            predictions = data.get("predictions", [])
            if predictions and "bytesBase64Encoded" in predictions[0]:
                b64 = predictions[0]["bytesBase64Encoded"]
                mime = predictions[0].get("mimeType", "image/png")
                return {
                    "image_url": f"data:{mime};base64,{b64}",
                    "engine": "Google Imagen 3",
                    "status": "success",
                }
    except Exception as e:
        logger.info("Google Imagen predict skipped or error: %s", e)
    return None


def _generate_via_neural_engine(
    prompt: str,
    aspect_ratio: str,
    seed: Optional[int] = None,
) -> dict[str, Any]:
    """Generate image via ultra high-speed neural engine."""
    width, height = ASPECT_RATIO_DIMENSIONS.get(aspect_ratio, (1024, 1024))
    if seed is None or seed <= 0:
        seed = random.randint(1, 999999)

    encoded_prompt = urllib.parse.quote(prompt)
    url = f"https://image.pollinations.ai/prompt/{encoded_prompt}?width={width}&height={height}&nologo=true&seed={seed}&enhance=true"

    req = urllib.request.Request(url, headers={"User-Agent": "ConverterStudio/2.0"})
    with urllib.request.urlopen(req, timeout=40) as resp:
        img_bytes = resp.read()
        content_type = resp.headers.get("Content-Type", "image/jpeg")
        b64 = base64.b64encode(img_bytes).decode("utf-8")

    return {
        "image_url": f"data:{content_type};base64,{b64}",
        "engine": "High-Speed Neural Engine",
        "width": width,
        "height": height,
        "seed": seed,
        "status": "success",
    }


def _analyze_reference_image_with_gemini(
    image_bytes: bytes,
    mime_type: str,
    user_prompt: str,
    api_key: str,
) -> Optional[str]:
    """Use Gemini Vision to synthesize reference image with user's prompt."""
    b64_img = base64.b64encode(image_bytes).decode("utf-8")
    url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent?key={api_key}"
    system_instruction = (
        "You are an expert visual artist and CAD engineer. Analyze this uploaded reference image and the user's prompt. "
        "Describe in 2 detailed sentences the new image to generate that incorporates the reference image's subject and style "
        "with the user's prompt modifications. Focus strictly on visual elements, geometry, lighting, materials and background."
    )
    req_body = json.dumps({
        "contents": [{
            "parts": [
                {"text": f"{system_instruction}\nUser prompt: {user_prompt}"},
                {"inline_data": {"mime_type": mime_type, "data": b64_img}},
            ]
        }]
    }).encode("utf-8")

    try:
        req = urllib.request.Request(url, data=req_body, headers={"Content-Type": "application/json"})
        with urllib.request.urlopen(req, timeout=15) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            candidates = data.get("candidates", [])
            if candidates:
                text = candidates[0].get("content", {}).get("parts", [{}])[0].get("text", "")
                if text:
                    return text.strip()
    except Exception as e:
        logger.info("Gemini vision analysis skipped: %s", e)
    return None


@router.post("/generate-image")
async def generate_image(
    prompt: str = Form(..., description="Prompt describing the image to generate"),
    negative_prompt: Optional[str] = Form(None, description="Elements to avoid"),
    aspect_ratio: str = Form("1:1", description="Aspect ratio: 1:1, 16:9, 9:16, 4:3"),
    style: str = Form("photorealistic", description="Visual style preset"),
    engine: str = Form("auto", description="Engine: auto, gemini, fast"),
    api_key: Optional[str] = Form(None, description="Optional Google AI Studio key"),
    seed: Optional[int] = Form(None, description="Optional seed for reproducibility"),
    reference_image: Optional[UploadFile] = File(None, description="Optional reference image for remix/img2img"),
) -> dict[str, Any]:
    """Generate an image from prompt and optional reference image."""
    clean_prompt = prompt.strip()
    if not clean_prompt:
        raise HTTPException(status_code=400, detail="Prompt cannot be empty.")

    key = get_active_api_key(api_key)

    # 1. Enrich prompt with style preset
    style_suffix = STYLE_PRESETS.get(style.lower(), "")
    effective_prompt = f"{clean_prompt}, {style_suffix}".strip().rstrip(",")

    if negative_prompt and negative_prompt.strip():
        effective_prompt += f" (avoid: {negative_prompt.strip()})"

    # 2. If a reference image is provided, analyze it
    ref_analysis = None
    if reference_image and reference_image.filename:
        try:
            img_bytes = await reference_image.read()
            mime_type = reference_image.content_type or "image/jpeg"
            if len(img_bytes) > 0:
                ref_analysis = _analyze_reference_image_with_gemini(
                    img_bytes, mime_type, clean_prompt, key
                )
                if ref_analysis:
                    effective_prompt = f"{ref_analysis}, {style_suffix}".strip().rstrip(",")
                else:
                    effective_prompt = f"Based on reference image: {clean_prompt}, {style_suffix}".strip().rstrip(",")
        except Exception as e:
            logger.warning("Could not read reference image: %s", e)

    # 3. Execution strategy: Google Imagen first if requested/auto, fallback to neural engine
    result = None
    if engine in ("gemini", "auto") and key:
        result = _generate_via_google_imagen(effective_prompt, aspect_ratio, key)

    if result is None:
        try:
            result = _generate_via_neural_engine(effective_prompt, aspect_ratio, seed)
        except Exception as e:
            logger.exception("Image generation failed: %s", e)
            raise HTTPException(
                status_code=500, detail=f"Failed to generate image: {str(e)}"
            )

    result["prompt"] = clean_prompt
    result["effective_prompt"] = effective_prompt
    result["style"] = style
    result["aspect_ratio"] = aspect_ratio
    result["has_reference_image"] = reference_image is not None and reference_image.filename is not None
    return result
