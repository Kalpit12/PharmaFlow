from PIL import Image
import os

src_dir = r"d:\\Pharmora\\public\\brand"
out_dir = r"d:\\Pharmora\\public"
os.makedirs(out_dir, exist_ok=True)

favicon = Image.open(os.path.join(src_dir, 'favicon.png')).convert('RGBA')
sizes = [16, 32, 48, 64, 128, 180]
imgs = []
for s in sizes:
    imgs.append(favicon.resize((s, s), Image.Resampling.LANCZOS))

ico_path = os.path.join(out_dir, 'favicon.ico')
imgs[0].save(ico_path, format='ICO', sizes=[(s, s) for s in sizes])

Image.open(os.path.join(src_dir, 'favicon-32.png')).save(os.path.join(out_dir, 'favicon-32x32.png'))

Image.open(os.path.join(src_dir, 'favicon.png')).save(os.path.join(out_dir, 'apple-touch-icon.png'))

app_tinted = Image.open(os.path.join(src_dir, 'app-icon-tinted.png')).convert('RGBA')
for s in [192, 512]:
    img = app_tinted.resize((s, s), Image.Resampling.LANCZOS)
    img.save(os.path.join(out_dir, f'android-chrome-{s}x{s}.png'))

print('icons created')
