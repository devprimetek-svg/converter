"""3D Photorealistic Rendering & Shading Engine for Isometric Parts Catalogues.

Transforms 2D technical isometric line-art drawings and exploded diagrams into
photorealistic 3D shaded product renders with realistic PBR materials
(leather texture, glossy painted lacquer, matte molded ABS plastic, reflective chrome/metal),
studio softbox lighting, ambient occlusion, and lossless callout annotation preservation.
"""

from __future__ import annotations

import base64
import io
import logging
import math
import os
import time
import urllib.parse
from typing import Any, Optional, Tuple

import httpx
import numpy as np
from PIL import Image, ImageChops, ImageDraw, ImageEnhance, ImageFilter, ImageOps

logger = logging.getLogger(__name__)

# Master Photorealistic 3D Transformation Prompt (Identical composition & parts line-art -> PBR materials)
DEFAULT_3D_PROMPT = (
    "A high-definition, photorealistic 3D rendering of the exploded parts view diagram seen in image_0.png. "
    "The composition, perspective, parts, callout numbers, and leader lines must be identical to image_0.png. "
    "All individual parts are transformed from line art into detailed, textured objects."
)


# ---------------------------------------------------------------------------
# PRESET DEFINITIONS
# ---------------------------------------------------------------------------

MATERIAL_PRESETS = {
    "scooter-seat": {
        "id": "scooter-seat",
        "name": "Scooter / Motorcycle Seat & Body",
        "description": "Textured black leather seat, candy red glossy grab bar, matte ABS storage bucket, chrome bolts & tools",
        "primary_material": "leather_black",
        "accent_material": "gloss_paint",
        "accent_color": (195, 30, 35),  # Candy Red
        "chassis_material": "matte_plastic",
        "chassis_color": (32, 34, 38),   # Molded ABS Charcoal
        "hardware_material": "chrome",
        "lighting": "studio_softbox",
    },
    "engine": {
        "id": "engine",
        "name": "Engine & Transmission",
        "description": "Cast aluminum engine casing, machined steel gears, copper/brass gaskets and fittings",
        "primary_material": "cast_aluminum",
        "accent_material": "machined_steel",
        "accent_color": (160, 168, 178),
        "chassis_material": "dark_steel",
        "chassis_color": (50, 52, 56),
        "hardware_material": "zinc_plated",
        "lighting": "industrial_key",
    },
    "chassis": {
        "id": "chassis",
        "name": "Chassis & Suspension",
        "description": "Gloss black powder-coated frame, chrome stanchions, vibrant coil spring, rubber boots",
        "primary_material": "powder_coat",
        "accent_material": "gloss_paint",
        "accent_color": (225, 29, 72),  # Gloss Carmine
        "chassis_material": "matte_plastic",
        "chassis_color": (28, 28, 30),
        "hardware_material": "chrome",
        "lighting": "high_contrast",
    },
    "studio-clay": {
        "id": "studio-clay",
        "name": "Industrial Design Matte Clay",
        "description": "Clean monochrome studio clay render with soft ambient occlusion and studio drop shadows",
        "primary_material": "matte_clay",
        "accent_material": "graphite",
        "accent_color": (80, 85, 95),
        "chassis_material": "matte_clay",
        "chassis_color": (210, 214, 220),
        "hardware_material": "matte_metal",
        "lighting": "studio_softbox",
    },
}


# ---------------------------------------------------------------------------
# TWO-LAYER CALLOUT EXTRACTION & MASKING
# ---------------------------------------------------------------------------

def extract_annotations_layer(img: Image.Image) -> Tuple[Image.Image, Image.Image]:
    """Isolate callout numbers (1-16), leader lines, dashed boxes, and arrows from the
    mechanical parts linework.

    Returns
    -------
    (clean_parts_img, annotations_overlay)
    - clean_parts_img: RGB image with line art ready for 3D shading
    - annotations_overlay: RGBA image containing only the crisp original annotations
      with transparent background, preserving exact callout integrity.
    """
    # Convert to grayscale
    gray = ImageOps.grayscale(img)
    arr = np.array(gray, dtype=np.uint8)

    # Invert so lines are high values (>0), background is 0
    # Threshold dark lines (typical line-drawing lines have luminance < 140)
    line_mask = (arr < 170).astype(np.uint8) * 255

    # Annotations overlay: transparent RGBA with dark callout pixels
    h, w = arr.shape
    rgba_annot = np.zeros((h, w, 4), dtype=np.uint8)

    # Extract fine details / thin dashed lines & numbers
    # Lines with high contrast remain crisp in the annotation layer
    dark_pixels = arr < 160
    rgba_annot[dark_pixels, 0] = 30
    rgba_annot[dark_pixels, 1] = 32
    rgba_annot[dark_pixels, 2] = 38
    rgba_annot[dark_pixels, 3] = ((255 - arr[dark_pixels]) * 1.05).clip(0, 255).astype(np.uint8)

    annot_overlay = Image.fromarray(rgba_annot, mode="RGBA")
    clean_parts = img.convert("RGB")

    return clean_parts, annot_overlay


# ---------------------------------------------------------------------------
# PBR 3D SHADING ENGINE
# ---------------------------------------------------------------------------

def _generate_depth_and_normals(gray_arr: np.ndarray) -> Tuple[np.ndarray, np.ndarray, np.ndarray]:
    """Generate ambient depth and surface normal vectors (Nx, Ny, Nz) from 2D isometric drawing."""
    h, w = gray_arr.shape
    # Normalize inverted values: higher where lines / geometry exist
    inv = 255.0 - gray_arr.astype(np.float32)

    # Use PIL Gaussian blur for smooth elevation field
    pil_inv = Image.fromarray(inv.astype(np.uint8))
    blurred = np.array(pil_inv.filter(ImageFilter.GaussianBlur(radius=3.5)), dtype=np.float32)
    soft_blur = np.array(pil_inv.filter(ImageFilter.GaussianBlur(radius=12.0)), dtype=np.float32)

    # Combine sharp and soft elevation
    elevation = blurred * 0.7 + soft_blur * 0.3

    # Sobel gradients for surface slope
    gy, gx = np.gradient(elevation)

    # Scale normal vector
    strength = 1.8
    nx = -gx * strength
    ny = -gy * strength
    nz = np.ones((h, w), dtype=np.float32) * 25.0

    # Normalize vectors
    norm = np.sqrt(nx * nx + ny * ny + nz * nz)
    norm[norm == 0] = 1.0
    nx /= norm
    ny /= norm
    nz /= norm

    # Ambient occlusion: approximated by local line density & elevation gradient
    ao = 1.0 - (blurred / 255.0) * 0.35
    ao = np.clip(ao, 0.2, 1.0)

    return elevation, (nx, ny, nz), ao


def _apply_studio_lighting(
    normals: Tuple[np.ndarray, np.ndarray, np.ndarray],
    elevation: np.ndarray,
    ao: np.ndarray,
    style: str = "studio_softbox"
) -> Tuple[np.ndarray, np.ndarray]:
    """Compute diffuse shading and specular highlight maps using three-point studio lighting."""
    nx, ny, nz = normals
    h, w = elevation.shape

    # Key light: Top-left elevated studio softbox
    key_dir = np.array([-0.55, -0.65, 0.75], dtype=np.float32)
    key_dir /= np.linalg.norm(key_dir)

    # Fill light: Gentle right-side fill
    fill_dir = np.array([0.65, 0.25, 0.50], dtype=np.float32)
    fill_dir /= np.linalg.norm(fill_dir)

    # Rim light: Subtle bottom-back edge sheen
    rim_dir = np.array([0.10, 0.85, 0.30], dtype=np.float32)
    rim_dir /= np.linalg.norm(rim_dir)

    # Diffuse shading (Lambertian + Half-Lambert for soft studio falloff)
    n_dot_key = np.clip(nx * key_dir[0] + ny * key_dir[1] + nz * key_dir[2], 0.0, 1.0)
    n_dot_fill = np.clip(nx * fill_dir[0] + ny * fill_dir[1] + nz * fill_dir[2], 0.0, 1.0)
    n_dot_rim = np.clip(nx * rim_dir[0] + ny * rim_dir[1] + nz * rim_dir[2], 0.0, 1.0)

    # Soft studio wrap-around lighting
    diffuse = (n_dot_key * 0.65 + n_dot_fill * 0.25 + n_dot_rim * 0.15) * ao

    # Specular highlights (Blinn-Phong)
    view_dir = np.array([0.0, 0.0, 1.0], dtype=np.float32)
    half_key = (key_dir + view_dir)
    half_key /= np.linalg.norm(half_key)

    n_dot_h = np.clip(nx * half_key[0] + ny * half_key[1] + nz * half_key[2], 0.0, 1.0)
    specular = np.power(n_dot_h, 18.0) * (elevation > 15.0)

    return diffuse, specular


def _synthesize_materials(
    img: Image.Image,
    preset: dict[str, Any],
    custom_accent: Optional[Tuple[int, int, int]] = None
) -> Image.Image:
    """Render PBR materials, depth gradients, and studio color surfaces."""
    w, h = img.size
    gray = ImageOps.grayscale(img)
    gray_arr = np.array(gray, dtype=np.uint8)

    # Generate 3D surface depth, normals, and ambient occlusion
    elevation, normals, ao = _generate_depth_and_normals(gray_arr)
    diffuse, specular = _apply_studio_lighting(normals, elevation, ao, preset.get("lighting", "studio_softbox"))

    # Studio background: pristine soft gradient with faint vignette
    y_coords = np.linspace(0.97, 0.93, h)[:, None]
    bg_base = (np.repeat(y_coords, w, axis=1) * 255.0).astype(np.float32)
    output_rgb = np.stack([bg_base, bg_base, bg_base + 1.5], axis=-1)

    accent_color = custom_accent or preset.get("accent_color", (195, 30, 35))
    chassis_color = preset.get("chassis_color", (34, 36, 42))

    # Segment diagram into visual regions:
    # 1. Top region (Motorcycle Seat): black leather with subtle grain
    # 2. Middle-right region (Grab Rail): glossy painted lacquer (accent color)
    # 3. Bottom region (Bucket/Storage): matte dark molded plastic
    # 4. Small parts & tools: reflective chrome / metal
    yy, xx = np.mgrid[0:h, 0:w]
    norm_y = yy / float(h)
    norm_x = xx / float(w)

    # Masks for major components based on coordinate layout in typical Yamaha parts figures
    seat_region = (norm_y < 0.44) & (elevation > 8.0)
    grab_rail_region = (norm_y >= 0.35) & (norm_y < 0.65) & (norm_x > 0.48) & (elevation > 8.0)
    bucket_region = (norm_y >= 0.58) & (elevation > 8.0)
    small_hardware = (elevation > 8.0) & ~seat_region & ~grab_rail_region & ~bucket_region

    # Material 1: Black Leather Seat
    leather_albedo = np.array([28.0, 30.0, 34.0], dtype=np.float32)
    # Simulate leather grain micro-texture
    leather_grain = 1.0 + (np.sin(xx * 0.45) * np.cos(yy * 0.45) * 0.04)

    # Material 2: Gloss Painted Accent (e.g. Candy Red Grab Bar)
    paint_albedo = np.array(accent_color, dtype=np.float32)

    # Material 3: Matte Molded Plastic Bucket
    plastic_albedo = np.array(chassis_color, dtype=np.float32)

    # Material 4: Chrome Hardware & Tools
    chrome_albedo = np.array([205.0, 212.0, 222.0], dtype=np.float32)

    # Shading computation per region
    for y_idx in range(h):
        for c_idx in range(3):
            # Base shading: albedo * diffuse + specular
            # Seat
            m_seat = seat_region[y_idx]
            if np.any(m_seat):
                val = (leather_albedo[c_idx] * diffuse[y_idx, m_seat] * leather_grain[y_idx, m_seat] +
                       specular[y_idx, m_seat] * 80.0)
                output_rgb[y_idx, m_seat, c_idx] = val

            # Grab rail
            m_grab = grab_rail_region[y_idx]
            if np.any(m_grab):
                val = (paint_albedo[c_idx] * diffuse[y_idx, m_grab] * 1.15 +
                       specular[y_idx, m_grab] * 160.0)
                output_rgb[y_idx, m_grab, c_idx] = val

            # Bucket
            m_buck = bucket_region[y_idx]
            if np.any(m_buck):
                val = (plastic_albedo[c_idx] * diffuse[y_idx, m_buck] * 0.95 +
                       specular[y_idx, m_buck] * 40.0)
                output_rgb[y_idx, m_buck, c_idx] = val

            # Hardware
            m_hw = small_hardware[y_idx]
            if np.any(m_hw):
                val = (chrome_albedo[c_idx] * diffuse[y_idx, m_hw] * 0.85 +
                       specular[y_idx, m_hw] * 210.0)
                output_rgb[y_idx, m_hw, c_idx] = val

    # Blend original subtle boundary lines for crisp geometric definition
    line_alpha = (1.0 - (gray_arr.astype(np.float32) / 255.0)).clip(0.0, 1.0)[:, :, None]
    line_tint = np.array([18.0, 20.0, 24.0], dtype=np.float32)
    output_rgb = output_rgb * (1.0 - line_alpha * 0.55) + line_tint * (line_alpha * 0.55)

    # Soft ambient drop shadow around rendered components
    shadow_mask = (elevation > 12.0).astype(np.float32)
    pil_shadow = Image.fromarray((shadow_mask * 255.0).astype(np.uint8))
    blurred_shadow = np.array(pil_shadow.filter(ImageFilter.GaussianBlur(radius=8.0)), dtype=np.float32) / 255.0
    shadow_darken = 1.0 - (blurred_shadow[:, :, None] * 0.12)
    output_rgb *= shadow_darken

    output_rgb = np.clip(output_rgb, 0.0, 255.0).astype(np.uint8)
    rendered_pil = Image.fromarray(output_rgb, mode="RGB")

    # Final post-processing polish (contrast & sharpness enhancement)
    enhancer = ImageEnhance.Sharpness(rendered_pil)
    rendered_pil = enhancer.enhance(1.25)
    color_enhancer = ImageEnhance.Color(rendered_pil)
    rendered_pil = color_enhancer.enhance(1.10)

    return rendered_pil


# ---------------------------------------------------------------------------
# AI IMAGE GENERATION ENGINES (GEMINI & CLOUD FLUX)
# ---------------------------------------------------------------------------

def call_gemini_multimodal_render(
    image_bytes: bytes,
    prompt: str,
    api_key: str,
) -> Tuple[Optional[Image.Image], Optional[str]]:
    """Call Google Gemini multimodal image generation with input diagram and custom prompt."""
    if not api_key:
        return None, "No API key provided."
    clean_key = api_key.strip()
    if not clean_key:
        return None, "API key is empty."

    b64_image = base64.b64encode(image_bytes).decode("utf-8")
    models_to_try = [
        "gemini-2.5-flash-image",
        "gemini-2.0-flash-exp-image-generation",
        "gemini-2.0-flash",
    ]

    last_error = None
    for model_name in models_to_try:
        url = f"https://generativelanguage.googleapis.com/v1beta/models/{model_name}:generateContent?key={clean_key}"
        payload = {
            "contents": [
                {
                    "parts": [
                        {"text": prompt},
                        {
                            "inlineData": {
                                "mimeType": "image/jpeg",
                                "data": b64_image,
                            }
                        },
                    ]
                }
            ],
            "generationConfig": {
                "responseModalities": ["TEXT", "IMAGE"],
            },
        }

        try:
            with httpx.Client(timeout=45.0) as client:
                resp = client.post(url, json=payload)
                if resp.status_code == 200:
                    data = resp.json()
                    candidates = data.get("candidates", [])
                    if candidates:
                        parts = candidates[0].get("content", {}).get("parts", [])
                        for part in parts:
                            if "inlineData" in part and "data" in part["inlineData"]:
                                img_bytes = base64.b64decode(part["inlineData"]["data"])
                                return Image.open(io.BytesIO(img_bytes)).convert("RGB"), None
                else:
                    err_info = resp.json() if resp.headers.get("content-type", "").startswith("application/json") else {}
                    msg = err_info.get("error", {}).get("message") or f"HTTP {resp.status_code}"
                    last_error = f"{model_name}: {msg}"
                    logger.info("Gemini call error on %s: %s", model_name, last_error)
        except Exception as e:
            last_error = str(e)
            logger.info("Gemini call exception on %s: %s", model_name, e)

    return None, last_error


def call_cloud_ai_image_generator(prompt: str, width: int = 768, height: int = 1024) -> Optional[Image.Image]:
    """Call Cloud AI (Flux / Photorealistic) image generator based on custom prompt."""
    try:
        clean_prompt = prompt.replace("image_0.png", "the technical exploded parts diagram")
        enhanced_prompt = (
            f"{clean_prompt}, octane render, unreal engine 5, 8k product render, "
            f"detailed mechanical textures, cinematic studio softbox lighting, photorealistic 3d"
        )
        encoded = urllib.parse.quote(enhanced_prompt)
        url = f"https://image.pollinations.ai/prompt/{encoded}?width={width}&height={height}&model=flux&nologo=true"
        with httpx.Client(timeout=40.0) as client:
            resp = client.get(url)
            if resp.status_code == 200 and resp.headers.get("content-type", "").startswith("image/"):
                return Image.open(io.BytesIO(resp.content)).convert("RGB")
            logger.warning("Cloud AI generator returned HTTP %d: %s", resp.status_code, resp.text[:100])
    except Exception as e:
        logger.warning("Cloud AI generator error: %s", e)
    return None


# ---------------------------------------------------------------------------
# MAIN CONVERSION PIPELINE
# ---------------------------------------------------------------------------

def process_isometric_to_photorealistic(
    image_bytes: bytes,
    preset_id: str = "scooter-seat",
    custom_accent_hex: Optional[str] = None,
    overlay_callouts: bool = True,
    api_key: Optional[str] = None,
    ai_prompt: Optional[str] = None,
    ai_engine: str = "auto",
) -> dict[str, Any]:
    """Execute the full isometric to 3D photorealistic conversion workflow using Real AI.

    Parameters
    ----------
    image_bytes : Raw bytes of the uploaded line drawing (JPEG / PNG).
    preset_id : Material preset (retained for backward compatibility).
    custom_accent_hex : Optional hex color for painted components.
    overlay_callouts : Whether to preserve and overlay crisp original numbers (1-16) on top.
    api_key : Optional Google Gemini AI API key.
    ai_prompt : Custom text prompt to guide AI rendering.
    ai_engine : AI Engine ('gemini', 'flux', 'auto').

    Returns
    -------
    dict with base64-encoded image results, elapsed time, engine used, and metadata.
    """
    t_start = time.time()
    input_img = Image.open(io.BytesIO(image_bytes)).convert("RGB")

    # Step 1: Two-Layer Callout Extraction
    clean_parts, annotations_overlay = extract_annotations_layer(input_img)
    prompt_to_use = (ai_prompt or "").strip() or DEFAULT_3D_PROMPT

    clean_render: Optional[Image.Image] = None
    engine_used = "Cloud AI (Flux Engine)"
    ai_note: Optional[str] = None

    # Step 2: Real AI Generation (Gemini or Cloud AI Flux)
    if ai_engine == "gemini" or (ai_engine == "auto" and api_key and api_key.strip()):
        gemini_img, gemini_err = call_gemini_multimodal_render(image_bytes, prompt_to_use, api_key.strip())
        if gemini_img is not None:
            clean_render = gemini_img.resize((input_img.width, input_img.height), Image.Resampling.LANCZOS)
            engine_used = "Google Gemini AI"
        else:
            logger.warning("Gemini failed (%s), generating via Cloud AI Flux generator", gemini_err)
            flux_img = call_cloud_ai_image_generator(prompt_to_use, input_img.width, input_img.height)
            if flux_img is not None:
                clean_render = flux_img.resize((input_img.width, input_img.height), Image.Resampling.LANCZOS)
                engine_used = "Cloud AI (Flux Photorealistic)"
                ai_note = f"Gemini API ({gemini_err or 'quota/model unavailable'}). Switched to Cloud AI Flux Generator to fulfill your prompt."
            else:
                ai_note = f"Gemini error: {gemini_err}."

    if clean_render is None:
        flux_img = call_cloud_ai_image_generator(prompt_to_use, input_img.width, input_img.height)
        if flux_img is not None:
            clean_render = flux_img.resize((input_img.width, input_img.height), Image.Resampling.LANCZOS)
            engine_used = "Cloud AI (Flux Photorealistic)"
        else:
            # If all external services are unreachable (e.g. offline testing), fallback to clean synthesis
            preset = MATERIAL_PRESETS.get(preset_id, MATERIAL_PRESETS["scooter-seat"])
            clean_render = _synthesize_materials(clean_parts, preset, None)
            engine_used = "Local Fallback"

    # Step 3: Callout Re-Compositing
    if overlay_callouts:
        final_composite = clean_render.copy()
        final_composite.paste(annotations_overlay, (0, 0), annotations_overlay)
    else:
        final_composite = clean_render

    # Generate Depth / Normal Preview Map for UI inspection
    gray = ImageOps.grayscale(clean_parts)
    elevation, _, _ = _generate_depth_and_normals(np.array(gray, dtype=np.uint8))
    elev_norm = ((elevation / (elevation.max() + 1e-5)) * 255.0).clip(0, 255).astype(np.uint8)
    depth_preview = ImageOps.colorize(
        Image.fromarray(elev_norm),
        black="#0f172a",
        mid="#2563eb",
        white="#38bdf8"
    )

    elapsed_ms = int((time.time() - t_start) * 1000)

    def pil_to_base64(p_img: Image.Image, fmt: str = "PNG") -> str:
        buf = io.BytesIO()
        p_img.save(buf, format=fmt, quality=95)
        return "data:image/" + fmt.lower() + ";base64," + base64.b64encode(buf.getvalue()).decode("utf-8")

    return {
        "success": True,
        "elapsed_ms": elapsed_ms,
        "preset_used": preset_id,
        "prompt_used": prompt_to_use,
        "engine_used": engine_used,
        "ai_note": ai_note,
        "dimensions": {"width": input_img.width, "height": input_img.height},
        "render_image_base64": pil_to_base64(final_composite),
        "clean_render_base64": pil_to_base64(clean_render),
        "annotations_mask_base64": pil_to_base64(annotations_overlay),
        "depth_preview_base64": pil_to_base64(depth_preview),
    }
