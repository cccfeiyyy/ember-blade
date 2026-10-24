from PIL import Image, ImageDraw

def make(size):
    s = size
    img = Image.new('RGBA', (s, s), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    d.rounded_rectangle([0, 0, s - 1, s - 1], radius=int(s * 0.22), fill=(11, 15, 26, 255))
    # ember halo ring
    d.ellipse([s * 0.11, s * 0.11, s * 0.89, s * 0.89], outline=(255, 120, 40, 150), width=max(1, int(s * 0.028)))
    outer = [(0.50,0.14),(0.67,0.36),(0.62,0.52),(0.78,0.45),(0.72,0.64),
             (0.60,0.83),(0.50,0.88),(0.38,0.79),(0.27,0.60),(0.35,0.49),(0.25,0.51),(0.33,0.32)]
    d.polygon([(x * s, y * s) for x, y in outer], fill=(255, 108, 34, 255))
    inner = [(0.50,0.33),(0.60,0.49),(0.56,0.62),(0.64,0.60),(0.57,0.72),
             (0.50,0.78),(0.43,0.70),(0.38,0.58),(0.45,0.50)]
    d.polygon([(x * s, y * s) for x, y in inner], fill=(255, 220, 120, 255))
    return img

sizes = [16, 32, 48, 64, 128, 256]
imgs = [make(x) for x in sizes]
imgs[-1].save('favicon.ico', format='ICO', sizes=[(x, x) for x in sizes])
make(180).save('apple-touch-icon.png')
make(512).save('icon-512.png')
print('icons written:', [(x, make(x).size) for x in [16, 32, 180, 512]])
