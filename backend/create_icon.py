"""Generate ultra-crisp modern app icon and multi-resolution Windows .ico for ConverterStudio.exe."""

import math
import os
from PIL import Image, ImageDraw, ImageFilter


def create_app_icon(size: int = 512) -> Image.Image:
    # 512x512 master RGBA canvas
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    # Base dimensions
    padding = int(size * 0.06)
    box = [padding, padding, size - padding, size - padding]
    corner_radius = int(size * 0.22)

    # 1. Subtle Outer Glow / Shadow
    glow_img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    glow_draw = ImageDraw.Draw(glow_img)
    glow_box = [padding + 4, padding + 8, size - padding - 4, size - padding + 4]
    glow_draw.rounded_rectangle(glow_box, radius=corner_radius, fill=(14, 165, 233, 70))
    glow_img = glow_img.filter(ImageFilter.GaussianBlur(radius=size * 0.04))
    img.paste(glow_img, (0, 0), glow_img)

    # 2. Main Squircle Body: Deep Premium Dark Gradient
    # We draw horizontal gradient strips masked by rounded rectangle
    body_mask = Image.new("L", (size, size), 0)
    body_mask_draw = ImageDraw.Draw(body_mask)
    body_mask_draw.rounded_rectangle(box, radius=corner_radius, fill=255)

    body_gradient = Image.new("RGBA", (size, size))
    for y in range(size):
        ratio = y / size
        # From dark navy #0A1128 (10, 17, 40) down to deep onyx #020617 (2, 6, 23)
        r = int(10 * (1 - ratio) + 2 * ratio)
        g = int(24 * (1 - ratio) + 6 * ratio)
        b = int(48 * (1 - ratio) + 23 * ratio)
        for x in range(size):
            body_gradient.putpixel((x, y), (r, g, b, 255))

    img.paste(body_gradient, (0, 0), body_mask)

    # 3. Outer Neon Border / Rim light
    border_draw = ImageDraw.Draw(img)
    border_draw.rounded_rectangle(box, radius=corner_radius, outline=(56, 189, 248, 180), width=max(2, int(size * 0.018)))

    # 4. Subtle Inner Highlight Rim
    inner_box = [padding + int(size * 0.015), padding + int(size * 0.015), size - padding - int(size * 0.015), size - padding - int(size * 0.015)]
    border_draw.rounded_rectangle(inner_box, radius=corner_radius - int(size * 0.015), outline=(255, 255, 255, 30), width=1)

    # 5. Glowing Center Emblem: Modern Stylized Zap Bolt & Speed Facets
    # Center coordinates:
    cx, cy = size // 2, size // 2

    # Draw Zap Bolt
    # Points scaled relative to center
    scale = size / 512.0
    pts = [
        (cx + 10 * scale, cy - 145 * scale),  # top point
        (cx - 95 * scale, cy + 10 * scale),   # left mid
        (cx - 15 * scale, cy + 10 * scale),   # left inner
        (cx - 35 * scale, cy + 145 * scale),  # bottom tip
        (cx + 85 * scale, cy - 10 * scale),   # right mid
        (cx + 5 * scale, cy - 10 * scale),    # right inner
    ]

    # Glow layer for the emblem
    emblem_glow = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    eg_draw = ImageDraw.Draw(emblem_glow)
    eg_draw.polygon(pts, fill=(56, 189, 248, 200))
    emblem_glow = emblem_glow.filter(ImageFilter.GaussianBlur(radius=int(14 * scale)))
    img.paste(emblem_glow, (0, 0), emblem_glow)

    # Main Electric Bolt Gradient (Cyan #38BDF8 -> Electric Blue #2563EB -> Pure White Highlight)
    bolt_mask = Image.new("L", (size, size), 0)
    bm_draw = ImageDraw.Draw(bolt_mask)
    bm_draw.polygon(pts, fill=255)

    bolt_gradient = Image.new("RGBA", (size, size))
    for y in range(size):
        ratio = (y - (cy - 145 * scale)) / max(1, (290 * scale))
        ratio = max(0.0, min(1.0, ratio))
        # Top pure white/cyan (240, 253, 255) -> Bottom vibrant cobalt (37, 99, 235)
        br = int(245 * (1 - ratio) + 37 * ratio)
        bg = int(250 * (1 - ratio) + 99 * ratio)
        bb = int(255 * (1 - ratio) + 235 * ratio)
        for x in range(size):
            bolt_gradient.putpixel((x, y), (br, bg, bb, 255))

    img.paste(bolt_gradient, (0, 0), bolt_mask)

    # 6. Sleek Facet Line dividing the bolt for modern 3D depth
    divider_draw = ImageDraw.Draw(img)
    facet_pts = [
        (cx + 10 * scale, cy - 145 * scale),
        (cx - 15 * scale, cy + 10 * scale),
        (cx - 35 * scale, cy + 145 * scale),
    ]
    divider_draw.line(facet_pts, fill=(255, 255, 255, 160), width=max(1, int(2 * scale)))

    # 7. Subtle Corner Star / Lens Flare
    flare_x, flare_y = int(cx + 10 * scale), int(cy - 145 * scale)
    star_radius = int(8 * scale)
    divider_draw.ellipse(
        [flare_x - star_radius, flare_y - star_radius, flare_x + star_radius, flare_y + star_radius],
        fill=(255, 255, 255, 240),
    )

    return img


def main():
    target_dir = os.path.dirname(os.path.abspath(__file__))
    assets_dir = os.path.join(target_dir, "app", "assets")
    os.makedirs(assets_dir, exist_ok=True)

    master_icon = create_app_icon(512)

    # 1. Save 512x512 High-Res PNG
    png_path = os.path.join(assets_dir, "app_icon.png")
    master_icon.save(png_path, format="PNG")
    print(f"Created master icon PNG: {png_path}")

    # 2. Save Multi-Resolution Windows .ico (16, 24, 32, 48, 64, 128, 256)
    ico_path = os.path.join(assets_dir, "app_icon.ico")
    icon_sizes = [(256, 256), (128, 128), (64, 64), (48, 48), (32, 32), (24, 24), (16, 16)]
    master_icon.save(ico_path, format="ICO", sizes=icon_sizes)
    print(f"Created Windows multi-resolution ICO: {ico_path}")

    # 3. Also copy to root assets and frontend public so favicon matches
    root_ico = os.path.join(os.path.dirname(target_dir), "app_icon.ico")
    master_icon.save(root_ico, format="ICO", sizes=icon_sizes)

    frontend_public = os.path.join(os.path.dirname(target_dir), "frontend", "public")
    if os.path.exists(frontend_public):
        master_icon.save(os.path.join(frontend_public, "favicon.ico"), format="ICO", sizes=[(32, 32), (16, 16)])
        master_icon.save(os.path.join(frontend_public, "app_icon.png"), format="PNG")
        print("Updated frontend favicon and web app icon.")


if __name__ == "__main__":
    main()
