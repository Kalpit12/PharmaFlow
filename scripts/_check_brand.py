from PIL import Image
import os
out = r"d:\Pharmora\public\brand"
for name in ["logo-mark.png", "favicon.png", "app-icon-dark.png", "_cell0.png", "_inspect_icons_only.png"]:
    im = Image.open(os.path.join(out, name)).convert("RGBA")
    pix = im.load()
    w,h = im.size
    black = teal = other = 0
    for y in range(h):
        for x in range(w):
            r,g,b,a = pix[x,y]
            if a < 10: continue
            if r < 40 and g < 40 and b < 40: black += 1
            elif g > 85 and b > 85 and (g+b) > r+70: teal += 1
            else: other += 1
    print(f"{name}: {w}x{h} black={black} teal={teal} other={other}")
