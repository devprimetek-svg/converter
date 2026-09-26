"""Product & Parts SEO Metadata Generator Module

Generates e-commerce & SEO-optimized:
1. Product Title: arranged as [BRAND] [MODEL CODE] [MODEL] [PARTS NAME] (IN CAPS)
   Meta Title: arranged as [Brand] [Model] [MODEL CODE] [Parts Name] (Title Case, model typed before model code)
2. Meta Long Description: strictly 151-158 characters describing the genuine OEM part,
   diagram assembly, and INDIA SPARE replacement guarantee.

Features:
- Main parts only (diagram figures/assemblies e.g. CYLINDER HEAD) without child parts (bolts/nuts).
- Configurable text inputs: Brand (default YAMAHA), Model (blank by default), Series (default "series").
- Direct association with diagram images: YAM_{MODEL_CODE}_{CLEAN_FIG_NAME}.jpeg.
- Export to Excel (.xlsx) and CSV with BOM.
"""

from __future__ import annotations

import csv
import io
import random
import re
from typing import Any, Optional

import openpyxl
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from openpyxl.utils import get_column_letter

from app.excel_export import build_catalogue_code
from app.parts_extractor import clean_part_number


def sanitize_filename_segment(text: str) -> str:
    """Sanitize string for clean filenames matching image_tools conventions."""
    if not text:
        return ""
    clean = re.sub(r'[\\/*?:"<>|]', "", text)
    clean = re.sub(r"\s+", " ", clean).strip()
    return clean


def resolve_image_filename(fig_name: str, model_code: str = "") -> str:
    """Resolve the associated diagram image filename for a main part.
    Matches naming standard: YAM_{MODEL_CODE}_{CLEAN_FIG_NAME}.jpeg
    """
    clean_fig = sanitize_filename_segment(fig_name) or "DIAGRAM"
    model = sanitize_filename_segment(model_code).strip() or "MODEL"
    return f"YAM_{model}_{clean_fig}.jpeg"


def clean_no_commas(text: str) -> str:
    """Remove all commas and normalize whitespace without commas between words."""
    if not text:
        return ""
    cleaned = re.sub(r"[,]", "", text)
    return re.sub(r"\s+", " ", cleaned).strip()


def format_india_spare(text: str) -> str:
    """Ensure any occurrence of 'india spare' or 'indiaspare' is formatted strictly as 'IndiaSpare'."""
    if not text:
        return ""
    return re.sub(r"(?i)\bindia\s*spare\b|\bindiaspare\b", "IndiaSpare", text)


def preserve_caps(text: str, model: str = "", model_code: str = "") -> str:
    """Ensure 'IndiaSpare' and model name in ALL CAPS from model text box are preserved."""
    if not text:
        return ""
    formatted = format_india_spare(text)
    if model:
        m_clean = model.strip().upper()
        if m_clean:
            # Word boundary regex with case-insensitivity
            pattern = re.compile(rf"(?i)\b{re.escape(m_clean)}\b")
            formatted = pattern.sub(m_clean, formatted)
            if "-" in m_clean:
                parts = [re.escape(p.strip()) for p in m_clean.split("-") if p.strip()]
                dash_sep = r"\s*-\s*"
                dash_joined = dash_sep.join(parts)
                dash_pattern = re.compile(r"(?i)\b" + dash_joined + r"\b")
                formatted = dash_pattern.sub(m_clean, formatted)
    return formatted


def prompt_references_child_cells(prompt: Optional[str]) -> bool:
    """Return True if prompt explicitly references child cells, child parts, child rows, or all parts."""
    if not prompt:
        return False
    pattern = r"(?i)\bchild\b|\bchildren\b|\bchild\s*(?:cells?|parts?|rows?|items?|components?)\b|\ball\s*(?:parts?|cells?|rows?)\b"
    return bool(re.search(pattern, str(prompt)))



def build_product_title(
    brand: str,
    model_code: str,
    part_name: str,
    model: str = "",
    series: str = "",
) -> str:
    """Build product title (Short Description) in ALL CAPS without commas between words.
    Sequence: BRAND MODEL_CODE (MODEL if present) (SERIES if present after MODEL) PARTS_NAME
    """
    b = (brand or "YAMAHA").strip().upper()
    mc = (model_code or "MODEL").strip().upper()
    mn = (model or "").strip().upper()
    ser = (series or "").strip().upper()
    p = (part_name or "PARTS").strip().upper()

    parts = [b, mc]
    if mn:
        parts.append(mn)
        if ser:
            parts.append(ser)
    elif ser and ser != "SERIES":
        parts.append(ser)
    parts.append(p)

    title = clean_no_commas(" ".join(parts)).upper()
    return preserve_caps(title, model=mn, model_code=mc)


def build_meta_title(
    brand: str,
    model_code: str,
    part_name: str,
    model: str = "",
    series: str = "",
) -> str:
    """Build meta title separate from product title (Title Case, no commas between words).
    Model is typed before model code and output is in ALL CAPS per user mandate.
    Series is visible after Model:
    BRAND (MODEL in ALL CAPS) (SERIES if present after MODEL) MODEL_CODE PARTS_NAME | IndiaSpare.
    """
    b = (brand or "Yamaha").strip().title()
    mc = (model_code or "Model").strip().upper()
    mn = (model or "").strip().upper()  # User rule: model output should ALWAYS be in ALL CAPS even in meta title
    ser = (series or "").strip().title()
    p = (part_name or "Parts").strip().title()

    parts = [b]
    if mn:
        parts.append(mn)
        if ser:
            parts.append(ser)
    elif ser and ser.lower() != "series":
        parts.append(ser)
    parts.append(mc)
    parts.append(p)

    title = clean_no_commas(" ".join(parts)) + " | IndiaSpare"
    return preserve_caps(title, model=mn, model_code=mc)


def build_meta_short_description(
    brand: str,
    model_code: str,
    part_name: str,
    model: str = "",
) -> str:
    """Build meta short description ending with IndiaSpare without commas between words."""
    b = (brand or "YAMAHA").strip().upper()
    mc = (model_code or "MODEL").strip().upper()
    mn = (model or "").strip().upper()
    p = (part_name or "PARTS").strip().upper()

    if mn:
        desc = f"{b} {mc} {mn} {p} IndiaSpare"
    else:
        desc = f"{b} {mc} {p} IndiaSpare"
    return format_india_spare(clean_no_commas(desc))


def compute_prompt_seed(user_prompt: str, part_identifier: str = "", index: int = 0) -> int:
    """Generate a deterministic seed based on user prompt, part identifier, and row index.
    Changing the prompt immediately shifts the seed and produces distinct storytelling copy.
    """
    clean_p = clean_no_commas(user_prompt or "").strip().lower()
    h = 5381
    for char in clean_p:
        h = ((h << 5) + h + ord(char)) & 0x7FFFFFFF
    for char in str(part_identifier).lower():
        h = ((h << 5) + h + ord(char)) & 0x7FFFFFFF
    h = (h ^ (index * 7919)) & 0x7FFFFFFF
    return h or 1


def enforce_meta_desc_length(
    text: str,
    seed: Optional[int] = None,
    model: str = "",
    model_code: str = "",
) -> str:
    """Enforce strictly 151 to 158 characters without commas, preserving 'IndiaSpare' and model in ALL CAPS."""
    text = clean_no_commas(text).lower()
    if 151 <= len(text) <= 158:
        return preserve_caps(text, model=model, model_code=model_code)

    rng = random.Random(seed) if seed is not None else random.Random()

    pad_pool = [
        "with verified vehicle fit.",
        "with verified direct fit.",
        "for smooth daily rides.",
        "for a safe smooth ride.",
        "from indiaspare today.",
        "genuine factory spare.",
        "for total peace of mind.",
        "ride with confidence.",
        "with verified fitment.",
        "for smooth journeys.",
        "with direct factory fit.",
        "for dependable riding.",
        "with verified fit today.",
        "with guaranteed fitment.",
        "factory replacement parts.",
        "restoring smooth rides.",
    ]
    shuffled_pad = list(pad_pool)
    rng.shuffle(shuffled_pad)

    while len(text) < 151:
        candidates_matching = []
        for phrase in shuffled_pad:
            cand = clean_no_commas(text.rstrip(".") + " " + phrase).lower()
            if 151 <= len(cand) <= 158:
                candidates_matching.append(cand)
        if candidates_matching:
            return preserve_caps(rng.choice(candidates_matching), model=model, model_code=model_code)

        text = clean_no_commas(text.rstrip(".") + " genuine factory replacement.").lower()
        if 151 <= len(text) <= 158:
            return preserve_caps(text, model=model, model_code=model_code)

    words = text.split()
    built = ""
    for w in words:
        if len(built) + len(w) + 1 <= 158:
            built = (built + " " + w).strip()
        else:
            break

    if 151 <= len(built) <= 158:
        if not built.endswith("."):
            if len(built) + 1 <= 158:
                built += "."
        if 151 <= len(built) <= 158:
            return preserve_caps(built.lower(), model=model, model_code=model_code)

    closers = [
        "fit.", "now.", "part.", "today.", "spare.", "parts.",
        "with fit.", "exact fit.", "direct fit.",
        "with verified fit.", "with guaranteed fit.",
        "for your ride.", "from indiaspare.",
        "for smooth rides.", "factory direct.",
    ]
    shuffled_closers = list(closers)
    rng.shuffle(shuffled_closers)

    valid_closers = []
    for c in shuffled_closers:
        cand = clean_no_commas(built.rstrip(".") + " " + c).lower()
        if 151 <= len(cand) <= 158:
            valid_closers.append(cand)

    if valid_closers:
        return preserve_caps(rng.choice(valid_closers), model=model, model_code=model_code)

    while len(built) < 151:
        built = (built.rstrip(".") + " genuine").strip()
    if 151 <= len(built) <= 158:
        res = built.rstrip(".") + "." if len(built) + 1 <= 158 else built
        return preserve_caps(res.lower(), model=model, model_code=model_code)
    if len(built) > 158:
        last_space = built[:157].rfind(" ")
        if last_space >= 150:
            return preserve_caps((built[:last_space] + ".").lower(), model=model, model_code=model_code)
        return preserve_caps((built[:157] + ".").lower(), model=model, model_code=model_code)
    return preserve_caps(built.lower(), model=model, model_code=model_code)


def build_meta_description(
    brand: str,
    model_code: str,
    part_name: str,
    model: str = "",
    series: str = "series",
    seed: Optional[int] = None,
    user_prompt: str = "",
    parent_assembly: str = "",
) -> str:
    """Build meta description strictly bounded between 151 and 158 characters without commas,
    preserving 'IndiaSpare', model in ALL CAPS, and model_code in ALL CAPS per user mandate.
    Infuses user_prompt keywords and storytelling themes when provided.
    Outputs lowercase outside 'IndiaSpare' and model.
    """
    b = (brand or "yamaha").strip().lower()
    mc = (model_code or "model").strip().lower()
    mn = (model or "").strip().upper()
    ser = (series or "series").strip().lower()
    p = clean_no_commas((part_name or "part").strip().lower())
    parent_p = clean_no_commas((parent_assembly or "").strip().lower())
    m_disp = f"{mc} {mn}".strip() if mn else mc

    effective_seed = seed if seed is not None else compute_prompt_seed(user_prompt, f"{p}_{parent_p}")
    rng = random.Random(effective_seed)

    # Candidate storytelling sentences
    candidates = []

    if parent_p and parent_p != p:
        openings = [
            f"buy authentic {b} {m_disp} {p} for {parent_p} from indiaspare.",
            f"genuine {b} {m_disp} {p} for {parent_p} oem spare from indiaspare.",
            f"order genuine {b} {m_disp} {p} for {parent_p} from indiaspare.",
            f"authentic {b} {m_disp} {p} for {parent_p} spare part from indiaspare.",
            f"shop verified {b} {m_disp} {p} for {parent_p} at indiaspare.",
            f"official {b} {m_disp} {p} for {parent_p} spare from indiaspare.",
            f"find authentic {b} {m_disp} {p} for {parent_p} at indiaspare.",
            f"buy genuine {b} {m_disp} {p} for {parent_p} spare from indiaspare.",
        ]
    else:
        openings = [
            f"buy authentic {b} {m_disp} {p} spare parts from indiaspare.",
            f"order genuine {b} {m_disp} {p} original spares from indiaspare.",
            f"shop verified {b} {m_disp} {p} oem spare parts at indiaspare.",
            f"genuine {b} {m_disp} {p} authentic factory spares from indiaspare.",
            f"official {b} {m_disp} {p} factory replacement parts from indiaspare.",
            f"authentic {b} {m_disp} {p} genuine oem spare from indiaspare.",
            f"get authentic {b} {m_disp} {p} genuine spare parts from indiaspare.",
            f"buy genuine {b} {m_disp} {p} replacement spares from indiaspare.",
            f"find authentic {b} {m_disp} {p} oem spare parts at indiaspare.",
            f"buy official {b} {m_disp} {p} replacement parts from indiaspare.",
            f"order authentic {b} {m_disp} {p} factory spare from indiaspare.",
        ]

    narratives = [
        "enjoy smooth riding daily durability and factory precision fitment",
        "experience peaceful journeys responsive handling and verified vehicle fit",
        "restore factory balance vibration free riding and direct vehicle fitment",
        "maintain optimal road safety long lasting endurance and exact vehicle fit",
        "keep your motorcycle running smoothly with authentic factory durability",
        "protect your two wheeler with verified factory specification and fitment",
        "restore showroom smoothness and riding confidence with genuine factory fit",
        "enjoy peaceful daily commuting and responsive power with verified fit",
        "ensure dependable highway cruising and smooth handling with factory fit",
        "deliver maximum road safety and lasting durability with verified fitment",
        "experience long term road safety and dependable mechanical harmony",
        "ride with total peace of mind and verified factory standard durability",
    ]

    prompt_clean = clean_no_commas(user_prompt or "").strip().lower()
    if prompt_clean:
        skip = {"generate", "authentic", "descriptions", "for", "the", "and", "with", "parts", "oem", "spare", "catalogue", "excel"}
        p_words = [w for w in prompt_clean.split() if w not in skip and len(w) >= 4]
        if len(p_words) >= 2:
            th = " ".join(p_words[:2])
            narratives.insert(0, f"enjoy {th} and verified direct vehicle fitment with oem durability")
            narratives.insert(1, f"restore {th} and smooth riding performance with factory direct fit")
            narratives.insert(2, f"experience {th} and factory precision fitment with verified quality")

    closings = [
        " today.",
        " guaranteed.",
        " with verified vehicle fit.",
        " with direct vehicle fitment.",
        " across all roads.",
        " for daily reliability.",
        " with complete peace of mind.",
        " on every journey.",
        " across india.",
        " with fast courier delivery.",
        " for long term safety.",
    ]

    candidates = []
    for op in openings:
        for narr in narratives:
            for cl in closings:
                cand = clean_no_commas(f"{op} {narr}{cl}")
                if 151 <= len(cand) <= 158:
                    candidates.append(cand)

    if candidates:
        return preserve_caps(rng.choice(candidates), model=mn, model_code=mc)

    base = clean_no_commas(
        f"buy authentic {b} {m_disp} {p} genuine oem spare parts diagram from indiaspare. "
        f"factory replacement with verified fitment and durable performance guarantee."
    )
    words = base.split()
    cand = ""
    for w in words:
        if len(cand) + len(w) + 1 <= 154:
            cand = (cand + " " + w).strip()
        else:
            break

    closing_phrases = [
        " with verified fit.",
        " with guaranteed fit.",
        " for your vehicle.",
        " from indiaspare.",
        " today.",
    ]
    shuffled_cp = list(closing_phrases)
    rng.shuffle(shuffled_cp)
    for cp in shuffled_cp:
        test = clean_no_commas(cand.rstrip(".") + cp)
        if 151 <= len(test) <= 158:
            return preserve_caps(test, model=mn, model_code=mc)

    return preserve_caps(enforce_meta_desc_length(cand or base, seed=effective_seed, model=mn, model_code=mc), model=mn, model_code=mc)


# Backwards compatibility alias
build_long_description = build_meta_description


def build_product_description(
    brand: str,
    model_code: str,
    part_name: str,
    model: str = "",
    series: str = "series",
    user_prompt: str = "",
    assembly_components: Optional[list[dict[str, Any]]] = None,
    parent_assembly: str = "",
    seed: Optional[int] = None,
) -> str:
    """Build rich, storytelling product description strictly bounded between 120 and 140 words without commas,
    avoiding complex jargon in favor of easy-to-read, engaging narrative for riders,
    weaving user_prompt directives, extracted assembly components, and parent assembly context.
    Produces fresh unique narrative angles across different prompts.
    """
    b = (brand or "YAMAHA").strip().upper()
    mc = (model_code or "MODEL").strip().upper()
    mn = (model or "").strip().upper()
    ser = (series or "").strip().upper()
    p = clean_no_commas((part_name or "PARTS ASSEMBLY").strip().upper())
    parent_clean = clean_no_commas((parent_assembly or "").strip().upper())
    parts_model = [mc]
    if mn:
        parts_model.append(mn)
        if ser:
            parts_model.append(ser)
    elif ser and ser.lower() != "series":
        parts_model.append(ser)
    m_disp = " ".join(parts_model).strip()

    effective_seed = seed if seed is not None else compute_prompt_seed(user_prompt, f"{p}_{parent_clean}")
    rng = random.Random(effective_seed)

    parent_ctx = f" for your {parent_clean} assembly" if parent_clean and parent_clean != p else ""

    comp_mention = ""
    if assembly_components:
        c_names = []
        for c in assembly_components:
            cd = clean_no_commas(str(c.get("description") or "").strip().upper())
            if cd and cd not in c_names and cd != p:
                c_names.append(cd)
            if len(c_names) >= 2:
                break
        if c_names:
            comp_mention = f" It functions seamlessly alongside factory components like {' and '.join(c_names)} to keep your two wheeler in perfect balance."

    prompt_snippet = ""
    clean_p = clean_no_commas(user_prompt or "").strip()
    if clean_p:
        skip_words = {
            "generate", "authentic", "descriptions", "for", "the", "and", "with",
            "please", "each", "both", "excel", "pdf", "record", "parts", "catalogue",
            "extracted", "metadata", "component", "components", "oem"
        }
        meaningful = [w for w in clean_p.split() if w.lower() not in skip_words and len(w) > 2]
        if len(meaningful) >= 3:
            theme = " ".join(meaningful[:6])
            prompt_snippet = f" Designed to deliver {theme} across every road you travel."

    # 6 Distinct Storytelling Narrative Angles (easy to read, rider-focused, 0 commas)
    story_angles = [
        # Angle 0: Daily Commuting & Smooth Riding
        (
            f"Starting your two wheeler effortlessly every morning brings pure confidence to your day. "
            f"Navigating crowded city streets and sudden traffic junctions requires dependable precision from your {b} {m_disp} {p}{parent_ctx}. "
            f"This genuine OEM replacement part restores the original balance and smooth response your ride had on day one.{comp_mention} "
            f"Crafted strictly according to factory blueprints it fits seamlessly and eliminates unwanted vibration excess friction and sudden breakdowns.{prompt_snippet} "
            f"Every journey feels calm responsive and enjoyable. "
            f"Order your authentic {b} {m_disp} {p} spare parts from IndiaSpare today. "
            f"We deliver 100% genuine factory spares with verified vehicle fitment secure protective packaging and dependable courier delivery right to your doorstep across India. "
            f"Ride with complete confidence and total peace of mind knowing your vehicle runs on verified OEM engineering."
        ),
        # Angle 1: Highway Cruising & Road Confidence
        (
            f"Hitting the open highway calls for complete trust in every mechanical component beneath your seat. "
            f"When accelerating through sweeping bends or cruising at high speeds your {b} {m_disp} {p}{parent_ctx} plays a vital role in keeping your motorcycle running smoothly and safely.{comp_mention} "
            f"Worn out parts rob your vehicle of responsiveness and compromise safety on long rides. "
            f"Replacing with this authentic factory OEM part restores dependable mechanical harmony giving you crisp throttle feedback and peaceful riding comfort across all terrains.{prompt_snippet} "
            f"Order your genuine {b} {m_disp} {p} replacement spares from IndiaSpare today. "
            f"We inspect every part carefully to verify authentic factory quality exact vehicle fitment and rapid shipping in protective boxes. "
            f"Enjoy the open road with complete confidence and total peace of mind on every journey."
        ),
        # Angle 2: Weather Durability & Rough Road Safety
        (
            f"Uneven asphalt bumpy potholes and sudden monsoon rains test two wheeler components every single day across India. "
            f"Your {b} {m_disp} {p}{parent_ctx} needs genuine factory strength that withstands moisture road grit and daily usage without hesitation.{comp_mention} "
            f"This certified OEM replacement part is manufactured according to original vehicle blueprints ensuring effortless installation and steadfast mechanical endurance. "
            f"It protects surrounding components from premature wear and keeps your ride performing reliably through every season.{prompt_snippet} "
            f"IndiaSpare delivers 100% authentic factory parts in secure protective packaging directly to your doorstep. "
            f"Ride with absolute peace of mind knowing your two wheeler runs on verified factory spares. "
            f"Upgrade your vehicle with genuine replacement parts built for safety smooth performance and lasting durability on every road."
        ),
        # Angle 3: Showroom Factory Restoration
        (
            f"Nothing compares to the feeling of riding a motorcycle that performs with crisp showroom smoothness and quiet mechanical precision. "
            f"Over time daily journeys wear down critical components like your {b} {m_disp} {p}{parent_ctx}. "
            f"Installing this genuine OEM replacement part brings back original responsiveness smooth operation and worry free riding.{comp_mention} "
            f"Engineered to official factory blueprints it installs without guesswork to safeguard your two wheeler for years to come. "
            f"Every mile feels effortless whether commuting to work or heading out on weekend getaways.{prompt_snippet} "
            f"IndiaSpare is your trusted destination for genuine motorcycle and scooter spares. "
            f"Benefit from verified vehicle fitment careful transit packaging and swift delivery across India for effortless vehicle maintenance. "
            f"Keep your ride operating at peak performance with authentic factory components today."
        ),
        # Angle 4: Rider Safety & Mechanical Harmony
        (
            f"Rider safety and enjoyable journeys begin with authentic factory components working in perfect harmony on every street. "
            f"Whether tackling sudden stops sharp turns or rough country roads your {b} {m_disp} {p}{parent_ctx} must perform without failure.{comp_mention} "
            f"Non genuine aftermarket alternatives often cause fitment trouble excess wear and serious safety concerns. "
            f"This authentic OEM part meets exact factory manufacturing standards delivering dependable structural strength and long lasting mechanical reliability for worry free riding day after day.{prompt_snippet} "
            f"Upgrade your ride with authentic parts from IndiaSpare today. "
            f"We guarantee genuine OEM quality verified vehicle fitment and prompt shipping in protective boxes so you can hit the road with confidence. "
            f"Count on IndiaSpare for certified genuine spares that keep your motorcycle running safely and reliably."
        ),
        # Angle 5: Long-Distance Reliability & Fuel Efficiency
        (
            f"Long distance touring and daily office runs both require consistent engine efficiency and rock solid mechanical reliability on every ride. "
            f"Your {b} {m_disp} {p}{parent_ctx} runs at its best when every component operates with authentic factory accuracy.{comp_mention} "
            f"Replacing worn components with this certified OEM part reduces unnecessary mechanical drag helps maintain optimal fuel efficiency and prevents costly future repairs. "
            f"Every single part undergoes thorough inspection to ensure it delivers the durable performance and smooth ride you expect.{prompt_snippet} "
            f"Trust IndiaSpare for all your genuine two wheeler spare parts needs with verified fitment and fast delivery. "
            f"We take pride in delivering authentic factory spares in damage free protective packaging. "
            f"Experience smooth riding and dependable mechanical endurance on every highway and city street."
        ),
    ]

    # Select story angle based on effective seed so changing prompt selects different storytelling arc
    selected_angle_idx = effective_seed % len(story_angles)
    full_text = clean_no_commas(story_angles[selected_angle_idx])
    words = full_text.split()

    if len(words) > 140:
        words = words[:132]
        trimmed = " ".join(words)
        last_dot = trimmed.rfind(".")
        if last_dot > 0 and len(trimmed[:last_dot + 1].split()) >= 120:
            full_text = trimmed[:last_dot + 1]
            words = full_text.split()
        else:
            words = words[:130]
            full_text = " ".join(words).rstrip(".") + "."
            words = full_text.split()

    addon_sentences = [
        "Starting your two wheeler effortlessly every morning brings joy and confidence to your day.",
        "Navigating busy city streets and highway stretches feels smooth and comfortable on every ride.",
        "This genuine replacement part keeps your vehicle running with original factory smoothness and quiet efficiency.",
        "Riding on rough roads and potholes is safer when your two wheeler has genuine factory parts installed.",
        "Enjoy crisp throttle response and dependable power delivery whenever you twist the accelerator.",
        "Every weekend road trip and daily office commute becomes more enjoyable with authentic spares.",
        "Protect your two wheeler against unexpected breakdowns by choosing genuine factory components.",
        "IndiaSpare carefully packs and quickly delivers authentic OEM parts directly to your doorstep.",
        "Ride with absolute peace of mind knowing your vehicle is equipped with verified factory spares.",
        "Keep your motorcycle feeling as smooth and responsive as the day you brought it home.",
    ]
    shuffled_addons = list(addon_sentences)
    rng.shuffle(shuffled_addons)

    for s in shuffled_addons:
        if len(words) < 120:
            clean_s = clean_no_commas(s)
            if clean_s.lower() not in full_text.lower():
                full_text = full_text.rstrip(".") + ". " + clean_s
                words = full_text.split()
        else:
            break

    if len(words) < 120:
        needed = 120 - len(words)
        padding_words = [
            "All", "parts", "meet", "strict", "factory", "quality", "standards",
            "and", "provide", "uncompromised", "safety", "on", "every", "journey", "across",
            "all", "road", "conditions", "without", "exception", "delivering", "smooth",
            "rides", "and", "lasting", "durability", "for", "your", "motorcycle", "every", "day"
        ]
        full_text = full_text.rstrip(".") + ". " + " ".join(padding_words[:needed]) + "."
        words = full_text.split()

    # Ensure IndiaSpare is guaranteed to be present
    if "indiaspare" not in full_text.lower() and "india spare" not in full_text.lower():
        words = full_text.rstrip(".").split()
        if len(words) >= 137:
            words = words[:134]
        full_text = " ".join(words) + " from IndiaSpare."
        words = full_text.split()

    if len(words) > 140:
        words = words[:135]
        full_text = " ".join(words).rstrip(".") + "."

    return preserve_caps(full_text, model=mn, model_code=mc)


def generate_main_part_metadata(
    figure: dict[str, Any],
    model_code: str,
    brand: str = "YAMAHA",
    model: str = "",
    series: str = "series",
    page: int = 1,
    blank_descriptions: bool = True,
) -> dict[str, Any]:
    """Generate SEO and product metadata for a single main part (Figure Assembly)."""
    fig_no = str(figure.get("fig_no") or "").strip()
    part_name = str(figure.get("fig_name") or "").strip() or "PARTS ASSEMBLY"
    b = (brand or "YAMAHA").strip().upper()
    mc = (model_code or "MODEL").strip().upper()
    mn = (model or "").strip().upper()
    ser = (series or "series").strip()
    p = int(figure.get("first_page") or figure.get("page") or page or 1)

    parts_model_str = [mc]
    if mn:
        parts_model_str.append(mn)
        if ser:
            parts_model_str.append(ser.upper())
    elif ser and ser.lower() != "series":
        parts_model_str.append(ser.upper())
    model_str = " ".join(parts_model_str)

    # 1. Product Title: strictly in CAPS, separate, no commas, Series visible after Model
    prod_title = build_product_title(brand=b, model_code=mc, part_name=part_name, model=mn, series=ser)

    # 2. Meta Title: separate from product title, Title Case, no commas, Series visible after Model
    meta_title = build_meta_title(brand=b, model_code=mc, part_name=part_name, model=mn, series=ser)

    # 3. Meta Description & Product Description: blank during PDF scan/initial extraction per user specification
    if blank_descriptions:
        meta_desc = ""
        prod_desc = ""
    else:
        meta_desc = build_meta_description(brand=b, model_code=mc, part_name=part_name, model=mn, series=ser)
        prod_desc = build_product_description(brand=b, model_code=mc, part_name=part_name, model=mn, series=ser)

    img_filename = resolve_image_filename(part_name, model_code=mc)

    record = {
        "fig_no": fig_no,
        "part_name": part_name,
        "catalogue_code": build_catalogue_code(mc, part_name, fig_no),
        "description": part_name,
        "part_no": f"FIG.{fig_no}" if fig_no else part_name,
        "clean_part_no": f"{mc}-FIG{fig_no}" if fig_no else part_name,
        "ref_no": "1",
        "brand": b,
        "model_code": mc,
        "model": mn,
        "series": ser,
        "compatible_models": model_str,
        "image_filename": img_filename,
        "product_title": prod_title,
        "meta_title": meta_title,
        "meta_description": meta_desc,
        "meta_long_description": meta_desc,
        "meta_desc_chars": len(meta_desc),
        "long_desc_length": len(meta_desc),
        "product_description": prod_desc,
        "product_desc_words": len(prod_desc.split()) if prod_desc else 0,
        "page": p,
        "remarks": "",
    }
    for k, v in record.items():
        if isinstance(v, str) and ("india spare" in v.lower() or "indiaspare" in v.lower()):
            record[k] = format_india_spare(v)
    return record


def generate_child_part_metadata(
    row: dict[str, Any],
    model_columns: list[str],
    brand: str = "YAMAHA",
    model: str = "",
    series: str = "series",
    model_code: str = "",
    blank_descriptions: bool = True,
) -> dict[str, Any]:
    """Generate SEO and product metadata for an individual child part row (fallback mode)."""
    part_no = str(row.get("part_no") or "").strip()
    clean_no = clean_part_number(part_no)
    desc = str(row.get("description") or "").strip() or "PART"
    fig_name = str(row.get("fig_name") or "").strip() or "ASSEMBLY"
    fig_no = str(row.get("fig_no") or "").strip()
    ref_no = str(row.get("ref_no") or "").strip()
    page = int(row.get("page") or 1)

    b = (brand or "YAMAHA").strip().upper()
    mc = (model_code or ("_".join(model_columns) if model_columns else "MODEL")).strip().upper()
    mn = (model or "").strip().upper()
    ser = (series or "series").strip()

    parts_model_str = [mc]
    if mn:
        parts_model_str.append(mn)
        if ser:
            parts_model_str.append(ser.upper())
    elif ser and ser.lower() != "series":
        parts_model_str.append(ser.upper())
    model_str = " ".join(parts_model_str)
    full_part_name = f"{desc} {fig_name}".strip()

    # Per user rule: Child rows of short description and meta title must be blank
    prod_title = ""
    meta_title = ""
    if blank_descriptions:
        meta_desc = ""
        prod_desc = ""
    else:
        meta_desc = build_meta_description(brand=b, model_code=mc, part_name=desc, model=mn, series=ser, parent_assembly=fig_name)
        prod_desc = build_product_description(brand=b, model_code=mc, part_name=desc, model=mn, series=ser, parent_assembly=fig_name)
    img_filename = resolve_image_filename(fig_name, model_code=mc)

    record = {
        "fig_no": fig_no,
        "part_name": desc,
        "catalogue_code": build_catalogue_code(mc, fig_name, fig_no),
        "description": desc,  # Visible child description per user rule
        "raw_description": desc,
        "component_description": desc,
        "part_no": part_no,
        "clean_part_no": clean_no,
        "ref_no": ref_no,
        "brand": b,
        "model_code": mc,
        "model": mn,
        "series": ser,
        "compatible_models": model_str,
        "image_filename": "",  # Pic hidden for child records per user rule
        "product_title": prod_title,
        "meta_title": meta_title,
        "meta_description": meta_desc,
        "meta_long_description": meta_desc,
        "meta_desc_chars": len(meta_desc),
        "long_desc_length": len(meta_desc),
        "product_description": prod_desc,
        "product_desc_words": len(prod_desc.split()) if prod_desc else 0,
        "page": page,
        "remarks": str(row.get("remarks") or ""),
    }
    # Copy all model quantity columns from extracted row
    for m in model_columns:
        if m in row:
            record[m] = row[m]

    for k, v in record.items():
        if isinstance(v, str) and ("india spare" in v.lower() or "indiaspare" in v.lower()):
            record[k] = format_india_spare(v)
    return record


def generate_catalog_metadata(
    rows: list[dict[str, Any]],
    model_columns: list[str],
    brand: str = "YAMAHA",
    model: str = "",
    series: str = "series",
    model_code: str = "",
    main_parts_only: Optional[bool] = None,
    figures: Optional[list[dict[str, Any]]] = None,
    style: str = "ecommerce",
    custom_templates: Optional[dict[str, str]] = None,
    blank_descriptions: bool = True,
    parts_scope: Optional[str] = None,
    user_prompt: Optional[str] = None,
) -> list[dict[str, Any]]:
    """Generate SEO metadata for catalog according to the currently extracted Excel.
    
    Structure:
    - Parent cell (first row of each figure): populated Fig No., Catalog Name, Catalogue Code,
      Product Title and Meta Title. Descriptions remain blank during scan.
    - Child cells under that figure: Fig No., Catalog Name, and Catalogue Code remain blank.
      Descriptions for child cells are NEVER generated on their own until the user explicitly
      references child cells in the prompt.
    - parts_scope: 'all' (default if main_parts_only not True), 'parent', or 'child'.
    """
    model_upper = (model or "").strip().upper()
    mc = model_code
    if not mc:
        if model_columns:
            mc = "_".join(str(m).strip() for m in model_columns if str(m).strip())
        else:
            mc = "MODEL"

    b = (brand or "YAMAHA").strip().upper()
    mn = model_upper
    ser = (series or "series").strip()

    parts_model_str = [mc]
    if mn:
        parts_model_str.append(mn)
        if ser:
            parts_model_str.append(ser.upper())
    elif ser and ser.lower() != "series":
        parts_model_str.append(ser.upper())
    model_str = " ".join(parts_model_str)

    allow_child_desc = prompt_references_child_cells(user_prompt)
    should_generate_descriptions = (not blank_descriptions) or bool(user_prompt and str(user_prompt).strip())

    results: list[dict[str, Any]] = []

    if rows and len(rows) > 0:
        # Pre-group all rows by figure key so each parent assembly has its complete extracted component breakdown
        fig_components_map: dict[tuple[str, str], list[dict[str, Any]]] = {}
        curr_group_key = None
        for r_idx, r in enumerate(rows):
            raw_fno = str(r.get("parent_fig_no") or r.get("fig_no") or "").strip()
            raw_fname = str(r.get("parent_fig_name") or r.get("fig_name") or "").strip()
            fig_key = (raw_fno, raw_fname) if (raw_fno or raw_fname) else ("row", str(r_idx))
            if r.get("is_parent") is True or (r.get("is_parent") is None and fig_key != curr_group_key):
                curr_group_key = fig_key
            gk = curr_group_key or fig_key
            if gk not in fig_components_map:
                fig_components_map[gk] = []

            p_no = str(r.get("part_no") or "").strip()
            c_p_no = str(r.get("clean_part_no") or (clean_part_number(p_no) if p_no else ""))
            desc = str(r.get("description") or "").strip()
            ref_no = str(r.get("ref_no") or "").strip()
            comp_dict = {
                "ref_no": ref_no,
                "part_no": p_no,
                "clean_part_no": c_p_no,
                "description": desc,
                "remarks": str(r.get("remarks") or ""),
            }
            for m in model_columns:
                if m in r:
                    comp_dict[m] = r[m]
            fig_components_map[gk].append(comp_dict)

        last_fig_key = None
        for r_idx, r in enumerate(rows):
            raw_fno = str(r.get("parent_fig_no") or r.get("fig_no") or "").strip()
            raw_fname = str(r.get("parent_fig_name") or r.get("fig_name") or "").strip()
            fig_key = (raw_fno, raw_fname) if (raw_fno or raw_fname) else ("row", str(r_idx))

            if r.get("is_parent") is not None:
                is_parent = bool(r.get("is_parent"))
            else:
                is_parent = (fig_key != last_fig_key)

            if is_parent:
                last_fig_key = fig_key
                curr_fno = raw_fno
                curr_fname = raw_fname
                curr_cat_code = r.get("catalogue_code") or build_catalogue_code(mc, raw_fname, raw_fno)
                components_list = fig_components_map.get(fig_key, [])
            else:
                curr_fno = ""
                curr_fname = ""
                curr_cat_code = ""
                components_list = []

            part_no = str(r.get("part_no") or "").strip()
            clean_no = str(r.get("clean_part_no") or (clean_part_number(part_no) if part_no else ""))
            desc = str(r.get("description") or "").strip()
            ref_no = str(r.get("ref_no") or "").strip()
            page = int(r.get("page") or 1)
            remarks = str(r.get("remarks") or "")

            img_filename = resolve_image_filename(raw_fname or desc, model_code=mc)

            if is_parent:
                # Parent cell's parts name only for short description and meta title
                display_name = raw_fname or desc or "PARTS ASSEMBLY"
                prod_title = build_product_title(brand=b, model_code=mc, part_name=display_name, model=mn, series=ser)
                meta_title = build_meta_title(brand=b, model_code=mc, part_name=display_name, model=mn, series=ser)
                if not should_generate_descriptions:
                    meta_desc = ""
                    prod_desc = ""
                else:
                    p_seed = compute_prompt_seed(user_prompt or "", f"{display_name}_{curr_fno}", r_idx)
                    meta_desc = build_meta_description(
                        brand=b,
                        model_code=mc,
                        part_name=display_name,
                        model=mn,
                        series=ser,
                        seed=p_seed,
                        user_prompt=user_prompt or "",
                    )
                    prod_desc = build_product_description(
                        brand=b,
                        model_code=mc,
                        part_name=display_name,
                        model=mn,
                        series=ser,
                        seed=p_seed,
                        user_prompt=user_prompt or "",
                        assembly_components=components_list,
                    )
                display_desc = desc or display_name
            else:
                # Per user rule: child rows of short description and meta title must be strictly blank!
                prod_title = ""
                meta_title = ""
                if should_generate_descriptions:
                    child_name = desc or "PART"
                    parent_name = raw_fname or curr_fname or "PARTS ASSEMBLY"
                    c_seed = compute_prompt_seed(user_prompt or "", f"{parent_name}_{part_no}_{ref_no}_{desc}", r_idx)
                    meta_desc = build_meta_description(
                        brand=b,
                        model_code=mc,
                        part_name=child_name,
                        model=mn,
                        series=ser,
                        seed=c_seed,
                        user_prompt=user_prompt or "",
                        parent_assembly=parent_name,
                    )
                    prod_desc = build_product_description(
                        brand=b,
                        model_code=mc,
                        part_name=child_name,
                        model=mn,
                        series=ser,
                        seed=c_seed,
                        user_prompt=user_prompt or "",
                        parent_assembly=parent_name,
                    )
                else:
                    meta_desc = ""
                    prod_desc = ""
                # User rule: Description column child record should be visible!
                display_desc = desc
                # User rule: Pic column child record should be hidden/blank!
                img_filename = ""

            item: dict[str, Any] = {
                "fig_no": curr_fno,
                "part_name": curr_fname,
                "catalog_name": curr_fname,
                "catalogue_code": curr_cat_code,
                "parent_fig_no": raw_fno,
                "parent_fig_name": raw_fname,
                "is_parent": is_parent,
                "cell_type": "Parent" if is_parent else "Child",
                "ref_no": ref_no,
                "part_no": part_no,
                "clean_part_no": clean_no,
                "description": display_desc,
                "raw_description": desc,
                "component_description": desc,
                "assembly_components": components_list,
                "brand": b,
                "model_code": mc,
                "model": mn,
                "series": ser,
                "compatible_models": model_str,
                "image_filename": img_filename,
                "product_title": prod_title,
                "meta_title": meta_title,
                "meta_description": meta_desc,
                "meta_long_description": meta_desc,
                "meta_desc_chars": len(meta_desc) if meta_desc else 0,
                "long_desc_length": len(meta_desc) if meta_desc else 0,
                "product_description": prod_desc,
                "product_desc_words": len(prod_desc.split()) if prod_desc else 0,
                "page": page,
                "remarks": remarks,
            }

            for m in model_columns:
                if m in r:
                    item[m] = r[m]

            for k, v in item.items():
                if isinstance(v, str) and ("india spare" in v.lower() or "indiaspare" in v.lower()):
                    item[k] = format_india_spare(v)

            results.append(item)

    elif figures and len(figures) > 0:
        for fig in figures:
            item = generate_main_part_metadata(
                figure=fig,
                model_code=mc,
                brand=b,
                model=mn,
                series=ser,
                blank_descriptions=blank_descriptions,
            )
            item["is_parent"] = True
            item["cell_type"] = "Parent"
            item["parent_fig_no"] = str(fig.get("fig_no") or "")
            item["parent_fig_name"] = str(fig.get("fig_name") or "")
            results.append(item)

    # Scope resolution
    if parts_scope == "parent" or (parts_scope is None and main_parts_only is True):
        return [it for it in results if it.get("is_parent", False)]
    elif parts_scope == "child":
        return [it for it in results if not it.get("is_parent", False)]

    return results


def export_metadata_excel(
    meta_rows: list[dict[str, Any]],
    brand: str = "YAMAHA",
    model_columns: Optional[list[str]] = None,
    raw_rows: Optional[list[dict[str, Any]]] = None,
    selected_columns: Optional[list[str]] = None,
) -> io.BytesIO:
    """Generate a single-sheet Excel workbook (.xlsx) containing both extracted catalogue columns
    and generated SEO metadata. Does NOT create a separate sheet for child cells.
    If the user wants to see child cells, they can view them by applying Excel's filter.
    """
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "Product Metadata"

    header_fill = PatternFill(start_color="1B365D", end_color="1B365D", fill_type="solid")  # Navy Blue
    header_font = Font(name="Arial", size=11, bold=True, color="FFFFFF")
    header_alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)

    data_font = Font(name="Arial", size=10)
    center_align = Alignment(horizontal="center", vertical="center")
    left_align = Alignment(horizontal="left", vertical="center")
    wrap_left_align = Alignment(horizontal="left", vertical="center", wrap_text=True)

    thin_border_side = Side(style="thin", color="D3D3D3")
    thin_border = Border(
        left=thin_border_side,
        right=thin_border_side,
        top=thin_border_side,
        bottom=thin_border_side,
    )

    # Resolve dynamic model quantity columns
    resolved_model_cols: list[str] = []
    if model_columns:
        resolved_model_cols = [str(m).strip() for m in model_columns if str(m).strip()]
    else:
        seen_cols: set[str] = set()
        for r in (meta_rows + (raw_rows or [])):
            for k in r.keys():
                if k not in {
                    "fig_no", "fig_name", "part_name", "catalog_name", "catalogue_code",
                    "description", "part_no", "clean_part_no", "ref_no", "brand",
                    "model_code", "model", "series", "compatible_models", "image_filename",
                    "product_title", "meta_title", "meta_description", "meta_long_description",
                    "meta_desc_chars", "long_desc_length", "product_description",
                    "product_desc_words", "page", "remarks", "first_page", "id", "is_parent",
                    "cell_type", "parent_fig_no", "parent_fig_name", "ai_analysis", "ai_generated"
                }:
                    if re.match(r"^[A-Z0-9]{3,6}$", str(k).upper()):
                        seen_cols.add(str(k))
        resolved_model_cols = sorted(list(seen_cols))

    # Single Sheet Headers: Extracted Parts Catalogue Columns arranged on the LEFT, then SEO & Metadata Columns on the RIGHT
    headers: list[tuple[str, str, Any, int]] = [
        # --- Extracted Parts Catalogue Columns (Left) ---
        ("Page", "page", center_align, 8),
        ("Fig No.", "fig_no", center_align, 10),
        ("Catalog Name", "part_name", left_align, 28),
        ("Catalogue Code", "catalogue_code", left_align, 26),
        ("Ref No.", "ref_no", center_align, 10),
        ("Part No.", "part_no", left_align, 20),
        ("Clean Part No.", "clean_part_no", left_align, 20),
        ("Description", "description", left_align, 30),
    ]

    for m in resolved_model_cols:
        headers.append((f"Qty ({m})", m, center_align, 12))

    headers.append(("Remarks", "remarks", left_align, 24))

    # --- SEO & Metadata Columns (Right) ---
    headers.extend([
        ("Brand", "brand", center_align, 14),
        ("Model Code", "model_code", center_align, 14),
        ("Model", "model", center_align, 14),
        ("Series", "series", center_align, 14),
        ("Pic", "image_filename", left_align, 32),
        ("Short Description", "product_title", wrap_left_align, 36),
        ("Meta Title", "meta_title", wrap_left_align, 36),
        ("Meta Description (151-158 Chars)", "meta_description", wrap_left_align, 60),
        ("Meta Desc Chars", "meta_desc_chars", center_align, 15),
        ("Product Description (120-140 Words)", "product_description", wrap_left_align, 75),
        ("Product Desc Words", "product_desc_words", center_align, 16),
    ])

    has_ai_analysis = any(bool(r.get("ai_analysis")) for r in meta_rows) or (
        selected_columns and any("analysis" in str(s).lower() for s in selected_columns)
    )
    if has_ai_analysis:
        headers.append(("AI Dual-Record Analysis", "ai_analysis", wrap_left_align, 60))

    # Column Selection Filter: if provided and not empty, filter headers
    if selected_columns and len(selected_columns) > 0:
        sel_set = set(selected_columns)
        sel_lower = {s.lower() for s in selected_columns}
        filtered_headers = [
            h for h in headers
            if h[1] in sel_set or h[0] in sel_set or h[1].lower() in sel_lower or h[0].lower() in sel_lower
        ]
        if filtered_headers:
            headers = filtered_headers

    # Prepare export rows: if raw_rows is provided and has more rows than meta_rows, merge to ensure all extracted parts appear
    export_rows = list(meta_rows)
    if raw_rows and len(raw_rows) > len(meta_rows):
        meta_by_fig = {}
        for it in meta_rows:
            f_k = str(it.get("parent_fig_no") or it.get("fig_no") or "").strip()
            if f_k and f_k not in meta_by_fig:
                meta_by_fig[f_k] = it

        merged_rows = []
        last_fk = None
        for idx, r in enumerate(raw_rows):
            fno = str(r.get("parent_fig_no") or r.get("fig_no") or "").strip()
            fname = str(r.get("parent_fig_name") or r.get("fig_name") or "").strip()
            fk = (fno, fname) if (fno or fname) else ("row", str(idx))
            is_parent = bool(r.get("is_parent")) if r.get("is_parent") is not None else (fk != last_fk)
            if is_parent:
                last_fk = fk

            parent_meta = meta_by_fig.get(fno, {})
            b_val = parent_meta.get("brand") or brand or "YAMAHA"
            mc_val = parent_meta.get("model_code") or (resolved_model_cols[0] if resolved_model_cols else "MODEL")
            m_val = parent_meta.get("model") or ""
            ser_val = parent_meta.get("series") or "series"
            pno = str(r.get("part_no") or "").strip()
            clean_no = str(r.get("clean_part_no") or (clean_part_number(pno) if pno else ""))
            desc = str(r.get("description") or "").strip()

            merged_item = dict(r)
            merged_item["page"] = r.get("page", 1)
            merged_item["is_parent"] = is_parent
            merged_item["parent_fig_no"] = fno
            merged_item["parent_fig_name"] = fname
            merged_item["part_name"] = fname if is_parent else ""
            merged_item["catalog_name"] = fname if is_parent else ""
            merged_item["catalogue_code"] = build_catalogue_code(mc_val, fname, fno) if is_parent else ""
            merged_item["clean_part_no"] = clean_no
            merged_item["description"] = (desc or fname) if is_parent else desc
            merged_item["raw_description"] = desc
            merged_item["component_description"] = desc
            merged_item["brand"] = b_val
            merged_item["model_code"] = mc_val
            merged_item["model"] = m_val
            merged_item["series"] = ser_val
            merged_item["image_filename"] = (parent_meta.get("image_filename") or resolve_image_filename(fname, model_code=mc_val)) if is_parent else ""
            merged_item["product_title"] = parent_meta.get("product_title", "") if is_parent else ""
            merged_item["meta_title"] = parent_meta.get("meta_title", "") if is_parent else ""
            if is_parent:
                merged_item["meta_description"] = parent_meta.get("meta_description", "")
                merged_item["product_description"] = parent_meta.get("product_description", "")
            else:
                c_meta = r.get("meta_description") or ""
                c_prod = r.get("product_description") or ""
                if not c_meta and parent_meta.get("meta_description"):
                    c_meta = build_meta_description(
                        brand=b_val,
                        model_code=mc_val,
                        part_name=desc or "PART",
                        model=m_val,
                        series=ser_val,
                        parent_assembly=fname,
                    )
                if not c_prod and parent_meta.get("product_description"):
                    c_prod = build_product_description(
                        brand=b_val,
                        model_code=mc_val,
                        part_name=desc or "PART",
                        model=m_val,
                        series=ser_val,
                        parent_assembly=fname,
                    )
                merged_item["meta_description"] = c_meta
                merged_item["product_description"] = c_prod

            merged_item["meta_desc_chars"] = len(merged_item["meta_description"]) if merged_item["meta_description"] else 0
            merged_item["product_desc_words"] = len(merged_item["product_description"].split()) if merged_item["product_description"] else 0
            if is_parent and parent_meta.get("ai_analysis"):
                merged_item["ai_analysis"] = parent_meta["ai_analysis"]

            merged_rows.append(merged_item)
        export_rows = merged_rows

    ws.row_dimensions[1].height = 28.0
    for col_idx, (label, _, _, col_width) in enumerate(headers, start=1):
        cell = ws.cell(row=1, column=col_idx, value=label)
        cell.fill = header_fill
        cell.font = header_font
        cell.alignment = header_alignment
        cell.border = thin_border
        col_letter = get_column_letter(col_idx)
        ws.column_dimensions[col_letter].width = col_width

    only_children = bool(export_rows) and all(not bool(it.get("is_parent")) for it in export_rows)
    last_fig_key = None
    for row_idx, r in enumerate(export_rows, start=2):
        ws.row_dimensions[row_idx].height = 24.0

        raw_fno = str(r.get("parent_fig_no") or r.get("fig_no") or "").strip()
        raw_pname = str(r.get("parent_fig_name") or r.get("part_name", "") or r.get("fig_name", "") or "").strip()

        if r.get("is_parent") is not None:
            is_parent = bool(r.get("is_parent"))
        else:
            fig_key = (raw_fno, raw_pname) if (raw_fno or raw_pname) else ("row", str(row_idx))
            is_parent = (fig_key != last_fig_key)
            if is_parent:
                last_fig_key = fig_key

        if is_parent:
            curr_fno = raw_fno
            curr_pname = raw_pname
            curr_cat_code = r.get("catalogue_code") or build_catalogue_code(r.get("model_code", ""), raw_pname, raw_fno)
        else:
            curr_fno = ""
            curr_pname = ""
            curr_cat_code = ""

        for col_idx, (_, field_key, align, _) in enumerate(headers, start=1):
            if field_key == "fig_no":
                val = curr_fno
            elif field_key == "part_name":
                val = curr_pname
            elif field_key == "catalogue_code":
                val = curr_cat_code
            elif field_key == "clean_part_no":
                val = r.get("clean_part_no", "") or clean_part_number(str(r.get("part_no", "") or ""))
            elif field_key == "description":
                # User rule: Description column child record should be visible!
                val = (r.get("description", "") or curr_pname) if is_parent else (r.get("raw_description", "") or r.get("description", "") or r.get("component_description", ""))
            elif field_key == "image_filename":
                # User rule: Pic column child record should be hidden/blank!
                val = r.get("image_filename", "") if is_parent else ""
            elif field_key == "product_title":
                val = r.get("product_title", "") if is_parent else ""
            elif field_key == "meta_title":
                val = r.get("meta_title", "") if is_parent else ""
            elif field_key == "meta_description":
                val = r.get("meta_description", "") if (is_parent or r.get("meta_description")) else ""
            elif field_key == "meta_desc_chars":
                m_desc = r.get("meta_description", "") if (is_parent or r.get("meta_description")) else ""
                val = len(m_desc) if m_desc else 0
            elif field_key == "product_description":
                val = r.get("product_description", "") if (is_parent or r.get("product_description")) else ""
            elif field_key == "product_desc_words":
                p_desc = r.get("product_description", "") if (is_parent or r.get("product_description")) else ""
                val = len(p_desc.split()) if p_desc else 0
            else:
                val = r.get(field_key, "")

            val_str = str(val) if val is not None else ""
            if "india spare" in val_str.lower() or "indiaspare" in val_str.lower():
                val_str = format_india_spare(val_str)
            cell = ws.cell(row=row_idx, column=col_idx, value=val_str)
            cell.font = data_font
            cell.alignment = align
            cell.border = thin_border
            cell.number_format = "@"

    ws.freeze_panes = "A2"
    if export_rows:
        max_col_letter = get_column_letter(len(headers))
        ws.auto_filter.ref = f"A1:{max_col_letter}{len(export_rows) + 1}"

    # STRICTLY SINGLE SHEET ONLY: No separate sheet for child cells!
    buf = io.BytesIO()
    wb.save(buf)
    buf.seek(0)
    return buf


def export_metadata_csv(
    meta_rows: list[dict[str, Any]],
    model_columns: Optional[list[str]] = None,
    selected_columns: Optional[list[str]] = None,
) -> io.BytesIO:
    """Generate RFC-compliant UTF-8 CSV containing both extracted catalogue columns and generated SEO metadata.
    Supports filtering columns via selected_columns.
    """
    buf = io.StringIO()
    writer = csv.writer(buf, quoting=csv.QUOTE_MINIMAL)

    col_defs: list[tuple[str, str]] = [
        # --- Extracted Parts Catalogue Columns (Left) ---
        ("Page", "page"),
        ("Fig No.", "fig_no"),
        ("Catalog Name", "part_name"),
        ("Catalogue Code", "catalogue_code"),
        ("Ref No.", "ref_no"),
        ("Part No.", "part_no"),
        ("Clean Part No.", "clean_part_no"),
        ("Description", "description"),
    ]

    resolved_model_cols: list[str] = []
    if model_columns:
        resolved_model_cols = [str(m).strip() for m in model_columns if str(m).strip()]
    else:
        seen_cols = set()
        for r in meta_rows:
            for k in r.keys():
                if k not in {
                    "fig_no", "fig_name", "part_name", "catalogue_code", "description", "part_no",
                    "clean_part_no", "ref_no", "brand", "model_code", "model",
                    "series", "compatible_models", "image_filename", "product_title",
                    "meta_title", "meta_description", "meta_long_description",
                    "meta_desc_chars", "long_desc_length", "product_description",
                    "product_desc_words", "page", "remarks", "first_page", "id",
                    "is_parent", "cell_type", "parent_fig_no", "parent_fig_name"
                }:
                    if re.match(r"^[A-Z0-9]{3,6}$", str(k).upper()):
                        seen_cols.add(str(k))
        resolved_model_cols = sorted(list(seen_cols))

    for m in resolved_model_cols:
        col_defs.append((f"Qty ({m})", m))
    col_defs.append(("Remarks", "remarks"))

    # --- SEO & Metadata Columns (Right) ---
    col_defs.extend([
        ("Brand", "brand"),
        ("Model Code", "model_code"),
        ("Model", "model"),
        ("Series", "series"),
        ("Pic", "image_filename"),
        ("Short Description", "product_title"),
        ("Meta Title", "meta_title"),
        ("Meta Description (151-158 Chars)", "meta_description"),
        ("Meta Desc Chars", "meta_desc_chars"),
        ("Product Description (120-140 Words)", "product_description"),
        ("Product Desc Words", "product_desc_words"),
    ])

    has_ai_analysis = any(bool(r.get("ai_analysis")) for r in meta_rows) or (
        selected_columns and any("analysis" in str(s).lower() for s in selected_columns)
    )
    if has_ai_analysis:
        col_defs.append(("AI Dual-Record Analysis", "ai_analysis"))

    # Column Selection Filter: if provided and not empty, filter col_defs
    if selected_columns and len(selected_columns) > 0:
        sel_set = set(selected_columns)
        sel_lower = {s.lower() for s in selected_columns}
        filtered_cols = [
            c for c in col_defs
            if c[1] in sel_set or c[0] in sel_set or c[1].lower() in sel_lower or c[0].lower() in sel_lower
        ]
        if filtered_cols:
            col_defs = filtered_cols

    writer.writerow([c[0] for c in col_defs])

    only_children = bool(meta_rows) and all(not bool(it.get("is_parent")) for it in meta_rows)
    last_fig_key = None
    for row_idx, r in enumerate(meta_rows):
        raw_fno = str(r.get("parent_fig_no") or r.get("fig_no") or "").strip()
        raw_pname = str(r.get("parent_fig_name") or r.get("part_name", "") or r.get("fig_name", "") or "").strip()

        if r.get("is_parent") is not None:
            is_parent = bool(r.get("is_parent"))
        else:
            fig_key = (raw_fno, raw_pname) if (raw_fno or raw_pname) else ("row", str(row_idx))
            is_parent = (fig_key != last_fig_key)
            if is_parent:
                last_fig_key = fig_key

        if is_parent:
            curr_fno = raw_fno
            curr_pname = raw_pname
            curr_cat_code = r.get("catalogue_code") or build_catalogue_code(r.get("model_code", ""), raw_pname, raw_fno)
        else:
            curr_fno = ""
            curr_pname = ""
            curr_cat_code = ""

        row_vals = []
        for label, field_key in col_defs:
            if field_key == "fig_no":
                v = curr_fno
            elif field_key == "part_name":
                v = curr_pname
            elif field_key == "catalogue_code":
                v = curr_cat_code
            elif field_key == "clean_part_no":
                v = r.get("clean_part_no", "") or clean_part_number(str(r.get("part_no", "") or ""))
            elif field_key == "description":
                # User rule: Description column child record should be visible!
                v = (r.get("description", "") or curr_pname) if is_parent else (r.get("raw_description", "") or r.get("description", "") or r.get("component_description", ""))
            elif field_key == "image_filename":
                # User rule: Pic column child record should be hidden/blank!
                v = r.get("image_filename", "") if is_parent else ""
            elif field_key == "product_title":
                v = r.get("product_title", "") if is_parent else ""
            elif field_key == "meta_title":
                v = r.get("meta_title", "") if is_parent else ""
            elif field_key == "meta_description":
                v = r.get("meta_description", "") if (is_parent or r.get("meta_description")) else ""
            elif field_key == "meta_desc_chars":
                m_desc = r.get("meta_description", "") if (is_parent or r.get("meta_description")) else ""
                v = len(m_desc) if m_desc else 0
            elif field_key == "product_description":
                v = r.get("product_description", "") if (is_parent or r.get("product_description")) else ""
            elif field_key == "product_desc_words":
                p_desc = r.get("product_description", "") if (is_parent or r.get("product_description")) else ""
                v = len(p_desc.split()) if p_desc else 0
            else:
                v = r.get(field_key, "")
            val_str = str(v) if v is not None else ""
            if "india spare" in val_str.lower() or "indiaspare" in val_str.lower():
                val_str = format_india_spare(val_str)
            row_vals.append(val_str)
        writer.writerow(row_vals)

    out = io.BytesIO(buf.getvalue().encode("utf-8-sig"))
    out.seek(0)
    return out
