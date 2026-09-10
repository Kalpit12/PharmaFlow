from PIL import Image
im = Image.open(r"c:\Users\PC\Downloads\ChatGPT Image Sep 3, 2026, 04_18_07 PM.png")
w, h = im.size
print(w, h)
crops = {
    "inspect_bottom": (0, int(h * 0.68), w, h),
    "inspect_mid": (0, int(h * 0.38), w, int(h * 0.68)),
    "inspect_top": (0, 0, w, int(h * 0.38)),
}
for name, box in crops.items():
    im.crop(box).save(rf"d:\Pharmora\public\brand\_{name}.png")
print("saved")
