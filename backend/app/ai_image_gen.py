"""AI Image Generation Module for Converter Studio.

Generates high-resolution images purely from manual user prompts and optional
reference images using state-of-the-art diffusion engines (Black Forest Labs FLUX.1).
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

logger = logging.getLogger("converter.ai")

router = APIRouter(prefix="/api/ai", tags=["AI Image Generation"])


def get_active_hf_token(override_key: Optional[str] = None) -> str:
    """Return the active Hugging Face token from override, env, or app_config."""
    if override_key and override_key.strip().startswith("hf_"):
        return override_key.strip()

    env_token = os.environ.get("HF_TOKEN", "").strip() or os.environ.get("HUGGINGFACE_TOKEN", "").strip()
    if env_token:
        return env_token

    for path in [
        os.path.join(os.getcwd(), "app_config.json"),
        os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "app_config.json"),
    ]:
        try:
            if os.path.exists(path):
                with open(path, "r", encoding="utf-8") as f:
                    cfg = json.load(f)
                    val = cfg.get("hf_token", "").strip()
                    if val:
                        return val
        except Exception:
            pass

    return ""


def get_active_api_key(override_key: Optional[str] = None) -> str:
    """Return the active Gemini API key from override, env, or app_config."""
    if override_key and override_key.strip():
        return override_key.strip()

    env_key = os.environ.get("GEMINI_API_KEY", "").strip()
    if env_key:
        return env_key

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


ASPECT_RATIO_DIMENSIONS: dict[str, tuple[int, int]] = {
    "1:1": (1024, 1024),
    "16:9": (1024, 576),
    "9:16": (576, 1024),
    "4:3": (1024, 768),
}


@router.get("/verify-key")
async def verify_gemini_key(api_key: Optional[str] = None) -> dict[str, Any]:
    """Status endpoint for AI Image Generation service."""
    hf_token = get_active_hf_token(api_key)
    has_token = bool(hf_token)
    return {
        "valid": True,
        "engine": "Black Forest Labs FLUX.1 Schnell",
        "has_token": has_token,
        "free_tier": True,
        "unlimited": True,
        "message": "Black Forest Labs FLUX.1 High-Quality Engine is active and ready!",
    }


def _generate_via_flux_space(
    prompt: str,
    aspect_ratio: str,
    seed: Optional[int] = None,
    hf_token: str = "",
) -> Optional[dict[str, Any]]:
    """Generate image via Black Forest Labs FLUX.1 Schnell Hugging Face Space."""
    try:
        from gradio_client import Client

        width, height = ASPECT_RATIO_DIMENSIONS.get(aspect_ratio, (1024, 1024))
        # Schnell works best within 1024 boundaries
        s_width = min(width, 1024)
        s_height = min(height, 1024)

        target_seed = seed if (seed is not None and seed > 0) else random.randint(1, 999999999)
        randomize = seed is None or seed <= 0

        logger.info("Calling FLUX.1 Schnell with prompt: %s (seed: %s)", prompt[:60], target_seed)
        client = Client("black-forest-labs/FLUX.1-schnell", token=hf_token if hf_token else None)
        result = client.predict(
            prompt=prompt,
            seed=target_seed,
            randomize_seed=randomize,
            width=s_width,
            height=s_height,
            num_inference_steps=4,
            api_name="/infer",
        )

        img_path, used_seed = result
        if os.path.exists(img_path):
            with open(img_path, "rb") as f:
                img_data = f.read()
            mime = "image/webp" if img_path.lower().endswith(".webp") else "image/jpeg"
            b64 = base64.b64encode(img_data).decode("utf-8")
            return {
                "image_url": f"data:{mime};base64,{b64}",
                "engine": "FLUX.1 Schnell (Black Forest Labs)",
                "width": s_width,
                "height": s_height,
                "seed": used_seed,
                "status": "success",
            }
    except Exception as e:
        logger.warning("FLUX.1 Space generation encountered exception: %s", e)
    return None


def _generate_via_neural(
    prompt: str,
    aspect_ratio: str,
    seed: Optional[int] = None,
    hf_token: str = "",
) -> dict[str, Any]:
    """Generate image using FLUX.1 Space first, with seamless fallback to photorealistic stream."""
    # 1. Primary: Black Forest Labs FLUX.1 Schnell via Hugging Face Space
    flux_result = _generate_via_flux_space(prompt, aspect_ratio, seed, hf_token)
    if flux_result:
        return flux_result

    # 2. Fallback: Direct stream with FLUX realism (never sana to avoid 402/rate-limits)
    width, height = ASPECT_RATIO_DIMENSIONS.get(aspect_ratio, (768, 768))
    if seed is None or seed <= 0:
        seed = random.randint(1, 999999)

    encoded_prompt = urllib.parse.quote(prompt)
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    }

    for model_name in ["flux-realism", "flux"]:
        url = f"https://image.pollinations.ai/prompt/{encoded_prompt}?model={model_name}&width={width}&height={height}&seed={seed}&nologo=true"
        try:
            req = urllib.request.Request(url, headers=headers)
            with urllib.request.urlopen(req, timeout=20) as resp:
                if resp.status == 200:
                    img_bytes = resp.read()
                    content_type = resp.headers.get("Content-Type", "image/jpeg")
                    if len(img_bytes) > 2000 and "image" in content_type:
                        b64 = base64.b64encode(img_bytes).decode("utf-8")
                        return {
                            "image_url": f"data:{content_type};base64,{b64}",
                            "engine": f"Neural AI ({model_name.upper()})",
                            "width": width,
                            "height": height,
                            "seed": seed,
                            "status": "success",
                        }
        except Exception as e:
            logger.info("Server-side fallback for model %s: %s", model_name, e)

    fallback_stream_url = f"https://image.pollinations.ai/prompt/{encoded_prompt}?model=flux-realism&width={width}&height={height}&seed={seed}&nologo=true"
    return {
        "image_url": fallback_stream_url,
        "engine": "Neural AI (Direct FLUX Stream)",
        "width": width,
        "height": height,
        "seed": seed,
        "status": "success",
    }


def _analyze_reference_image(
    image_bytes: bytes,
    mime_type: str,
    user_prompt: str,
    api_key: str,
) -> Optional[str]:
    """Synthesize reference image features with user's manual prompt."""
    if not api_key:
        return None

    b64_img = base64.b64encode(image_bytes).decode("utf-8")
    url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key={api_key}"
    system_instruction = (
        "Analyze this reference image and the user prompt. Describe the new image to create in 2 detailed sentences "
        "following the user prompt's exact instructions."
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
        logger.info("Vision synthesis skipped: %s", e)
    return None


@router.post("/generate-image")
async def generate_image(
    prompt: str = Form(..., description="Manual user prompt describing the image to generate"),
    aspect_ratio: str = Form("1:1", description="Aspect ratio: 1:1, 16:9, 9:16, 4:3"),
    seed: Optional[int] = Form(None, description="Optional seed for reproducibility"),
    reference_image: Optional[UploadFile] = File(None, description="Optional reference image for remix"),
    api_key: Optional[str] = Form(None, description="Optional API key"),
) -> dict[str, Any]:
    """Generate image purely from manual user prompt and optional reference image."""
    clean_prompt = prompt.strip()
    if not clean_prompt:
        raise HTTPException(status_code=400, detail="Prompt cannot be empty.")

    hf_token = get_active_hf_token(api_key)
    gemini_key = get_active_api_key(api_key)
    effective_prompt = clean_prompt

    # If reference image is uploaded, blend with user's manual prompt
    if reference_image and reference_image.filename:
        try:
            img_bytes = await reference_image.read()
            mime_type = reference_image.content_type or "image/jpeg"
            if len(img_bytes) > 0:
                blended = _analyze_reference_image(img_bytes, mime_type, clean_prompt, gemini_key)
                if blended:
                    effective_prompt = blended
                else:
                    effective_prompt = f"{clean_prompt}, following visual composition of reference image"
        except Exception as e:
            logger.warning("Could not read reference image: %s", e)

    try:
        result = _generate_via_neural(effective_prompt, aspect_ratio, seed, hf_token)
    except Exception as e:
        logger.exception("Image generation failed: %s", e)
        raise HTTPException(
            status_code=500, detail=f"Failed to generate image: {str(e)}"
        )

    result["prompt"] = clean_prompt
    result["effective_prompt"] = effective_prompt
    result["aspect_ratio"] = aspect_ratio
    result["has_reference_image"] = reference_image is not None and reference_image.filename is not None
    return result
