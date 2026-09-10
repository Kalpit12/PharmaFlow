from PIL import Image
import os

src = r"c:\Users\PC\Downloads\ChatGPT Image Sep 3, 2026, 04_18_07 PM.png"
out = r"d:\Pharmora\public\brand"
im = Image.open(src).convert("RGBA")
w, h = im.size

# Bottom row icons sit below uppercase labels
y0, y1 = int(h * 0.78), int(h * 0.955)
bottom = im.crop((0, y0, w, y1))
bw, bh = bottom.size
col_w = bw // 6
bottom.save(os.path.join(out, "_inspect_icons_only.png"))

def is_teal(px):
    r, g, b, a = px
    return a > 20 and g > 85 and b > 85 and g >= r - 15 and b >= r - 15 and (g + b) > r + 70

def extract_teal_square(cell, size):
    ww, hh = cell.size
    pix = cell.load()
    mark = Image.new("RGBA", (ww, hh), (0, 0, 0, 0))
    mp = mark.load()
    for y in range(hh):
        for x in range(ww):
            r, g, b, a = pix[x, y]
            if is_teal((r, g, b, a)):
                mp[x, y] = (r, g, b, 255)
    bbox = mark.getbbox()
    if not bbox:
        raise SystemExit("no teal in cell")
    mark = mark.crop(bbox)
    s = max(mark.size)
    pad = int(s * 0.14)
    canvas = Image.new("RGBA", (s + pad * 2, s + pad * 2), (0, 0, 0, 0))
    canvas.paste(mark, (pad + (s - mark.size[0]) // 2, pad + (s - mark.size[1]) // 2), mark)
    return canvas.resize((size, size), Image.Resampling.LANCZOS)

def extract_tile(cell, size, keep_light=False):
    ww, hh = cell.size
    pix = cell.load()
    out_img = Image.new("RGBA", (ww, hh), (0, 0, 0, 0))
    op = out_img.load()
    for y in range(hh):
        for x in range(ww):
            r, g, b, a = pix[x, y]
            avg = (r + g + b) / 3
            if is_teal((r, g, b, a)):
                op[x, y] = (r, g, b, 255)
            elif r < 60 and g < 70 and b < 85:
                op[x, y] = (r, g, b, 255)
            elif keep_light and avg < 250:
                # keep pale tint / light gray tile, drop pure white page
                if avg < 240 or (g > r + 3 and (b + g) > 2 * r + 10):
                    op[x, y] = (r, g, b, 255)
    bbox = out_img.getbbox()
    out_img = out_img.crop(bbox)
    s = max(out_img.size)
    canvas = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    canvas.paste(out_img, ((s - out_img.size[0]) // 2, (s - out_img.size[1]) // 2), out_img)
    return canvas.resize((size, size), Image.Resampling.LANCZOS)

cells = []
for i in range(6):
    x0 = i * col_w + 8
    x1 = (i + 1) * col_w - 8 if i < 5 else bw - 8
    cell = bottom.crop((x0, 0, x1, bh))
    cell.save(os.path.join(out, f"_cell{i}.png"))
    cells.append(cell)

# 0 primary mark
extract_teal_square(cells[0], 512).save(os.path.join(out, "logo-mark.png"))
extract_teal_square(cells[0], 128).save(os.path.join(out, "logo-mark-128.png"))
extract_teal_square(cells[0], 64).save(os.path.join(out, "logo-mark-64.png"))
extract_teal_square(cells[0], 32).save(os.path.join(out, "logo-mark-32.png"))

# 2 favicon circle
extract_tile(cells[2], 180, keep_light=False).save(os.path.join(out, "favicon.png"))
extract_tile(cells[2], 32, keep_light=False).save(os.path.join(out, "favicon-32.png"))

# 3/4/5 app icons
extract_tile(cells[3], 512, keep_light=False).save(os.path.join(out, "app-icon-dark.png"))
extract_tile(cells[4], 512, keep_light=True).save(os.path.join(out, "app-icon-light.png"))
extract_tile(cells[5], 512, keep_light=True).save(os.path.join(out, "app-icon-tinted.png"))

print("re-extracted ok")
