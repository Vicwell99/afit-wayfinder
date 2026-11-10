import math, random, os
from PIL import Image, ImageDraw, ImageFilter, ImageFont, ImageOps

C30 = math.cos(math.radians(30))
CY = (0, 229, 255); VI = (124, 77, 255); MG = (255, 61, 154); AM = (255, 179, 0); GR = (0, 230, 118)
N = 10
BLOCKS = [(1, 1, 2.2, 2.2, 3.2, CY), (5, 1, 2, 3, 2.2, VI), (1.2, 5.4, 3, 2.4, 1.6, MG), (6, 6, 2.4, 2.4, 4.6, GR), (8.2, 3.0, 1.2, 1.2, 1.0, AM)]
ROUTE = [(0, 4.7), (4.6, 4.7), (4.6, 8.8), (7.2, 8.8)]
PATH2 = [(8, 0), (8, 5.5), (4.6, 4.7)]
FONT = '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'
FONTR = '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'

def shade(c, f):
    return tuple(int(v * f) if f <= 1 else int(v + (255 - v) * (f - 1)) for v in c[:3])

def scene(u, ox, oy, grid=True):
    P = lambda x, y, z=0: (ox + (x - y) * C30 * u, oy + (x + y) * 0.5 * u - z * u)
    sw = lambda k: max(1.0, u * k)
    it = []; th = 0.45
    it.append(dict(k='poly', pts=[P(0, N), P(N, N), P(N, N, -th), P(0, N, -th)], fill=(6, 14, 38, 255), stroke=CY + (150,), sw=sw(.05)))
    it.append(dict(k='poly', pts=[P(N, 0), P(N, N), P(N, N, -th), P(N, 0, -th)], fill=(3, 9, 26, 255), stroke=CY + (150,), sw=sw(.05)))
    it.append(dict(k='poly', pts=[P(0, 0), P(N, 0), P(N, N), P(0, N)], fill=(10, 26, 62, 255), stroke=CY + (230,), sw=sw(.08), glow=True))
    if grid:
        for i in range(1, N):
            it.append(dict(k='line', pts=[P(i, 0), P(i, N)], color=CY + (45,), w=sw(.03)))
            it.append(dict(k='line', pts=[P(0, i), P(N, i)], color=CY + (45,), w=sw(.03)))
    it.append(dict(k='line', pts=[P(x, y, .02) for x, y in PATH2], color=GR + (235,), w=sw(.14), dash=(u * .5, u * .3)))
    it.append(dict(k='line', pts=[P(x, y, .03) for x, y in ROUTE], color=CY + (255,), w=sw(.2), glow=True))
    ring = [P(7.2 + .95 * math.cos(t * math.pi / 12), 8.8 + .95 * math.sin(t * math.pi / 12), .03) for t in range(24)]
    it.append(dict(k='poly', pts=ring, fill=MG + (70,), stroke=MG + (230,), sw=sw(.06), glow=True))
    for (x, y, w, d, h, c) in sorted(BLOCKS, key=lambda b: b[0] + b[1] + (b[2] + b[3]) / 2):
        edge = shade(c, 1.4)
        it.append(dict(k='poly', pts=[P(x, y + d), P(x + w, y + d), P(x + w, y + d, h), P(x, y + d, h)], fill=shade(c, .55) + (255,), stroke=edge + (110,), sw=sw(.04)))
        it.append(dict(k='poly', pts=[P(x + w, y), P(x + w, y + d), P(x + w, y + d, h), P(x + w, y, h)], fill=shade(c, .33) + (255,), stroke=edge + (110,), sw=sw(.04)))
        it.append(dict(k='poly', pts=[P(x, y, h), P(x + w, y, h), P(x + w, y + d, h), P(x, y + d, h)], fill=shade(c, 1.12) + (255,), stroke=edge + (255,), sw=sw(.06), glow=True, gc=c))
    tip = P(7.2, 8.8, .03); r = .62 * u; hc = (tip[0], tip[1] - 1.9 * u)
    it.append(dict(k='poly', pts=[tip, (hc[0] - r * .82, hc[1] + r * .55), (hc[0] + r * .82, hc[1] + r * .55)], fill=MG + (255,), stroke=(255, 255, 255, 255), sw=sw(.06), glow=True))
    it.append(dict(k='circle', c=hc, r=r, fill=MG + (255,), stroke=(255, 255, 255, 255), sw=sw(.07), glow=True))
    it.append(dict(k='circle', c=hc, r=r * .38, fill=(255, 255, 255, 255)))
    return it

# ---------- raster ----------
def dashed(d, pts, color, w, on, off):
    pos = 0.0; draw_on = True
    for a, b in zip(pts, pts[1:]):
        L = math.dist(a, b)
        if L == 0: continue
        t = 0.0
        while t < L:
            seg = min((on if draw_on else off) - pos, L - t)
            if draw_on:
                p1 = (a[0] + (b[0] - a[0]) * t / L, a[1] + (b[1] - a[1]) * t / L)
                p2 = (a[0] + (b[0] - a[0]) * (t + seg) / L, a[1] + (b[1] - a[1]) * (t + seg) / L)
                d.line([p1, p2], fill=color, width=int(w))
            t += seg; pos += seg
            if pos >= (on if draw_on else off) - 1e-6: draw_on = not draw_on; pos = 0.0

def paint(img, items, blur):
    glow = Image.new('RGBA', img.size, (0, 0, 0, 0)); g = ImageDraw.Draw(glow, 'RGBA')
    for i in items:
        if not i.get('glow'): continue
        if i['k'] == 'poly':
            col = tuple(i.get('gc', i['stroke'][:3])) + (255,)
            g.line(i['pts'] + [i['pts'][0]], fill=col, width=int(i['sw'] * 2.2), joint='curve')
        elif i['k'] == 'line':
            g.line(i['pts'], fill=i['color'][:3] + (255,), width=int(i['w'] * 2.4), joint='curve')
        elif i['k'] == 'circle':
            x, y = i['c']; r = i['r']; g.ellipse([x - r, y - r, x + r, y + r], fill=MG + (255,))
    glow = glow.filter(ImageFilter.GaussianBlur(blur))
    img.alpha_composite(glow); img.alpha_composite(glow)
    d = ImageDraw.Draw(img, 'RGBA')
    for i in items:
        if i['k'] == 'poly':
            d.polygon(i['pts'], fill=i['fill'])
            if i.get('stroke'): d.line(i['pts'] + [i['pts'][0]], fill=i['stroke'], width=max(1, int(i['sw'])), joint='curve')
        elif i['k'] == 'line':
            if i.get('dash'): dashed(d, i['pts'], i['color'], i['w'], *i['dash'])
            else: d.line(i['pts'], fill=i['color'], width=max(1, int(i['w'])), joint='curve')
        elif i['k'] == 'circle':
            x, y = i['c']; r = i['r']
            d.ellipse([x - r, y - r, x + r, y + r], fill=i['fill'], outline=i.get('stroke'), width=max(1, int(i.get('sw', 1))))

def background(W, H, glow_at=None, glow_r=0.5, stars=False):
    grad = Image.linear_gradient('L').resize((W, H))
    img = ImageOps.colorize(grad, (3, 6, 20), (12, 30, 78)).convert('RGBA')
    if glow_at:
        gl = Image.new('RGBA', (W, H), (0, 0, 0, 0)); gd = ImageDraw.Draw(gl)
        r = int(min(W, H) * glow_r); x, y = glow_at
        gd.ellipse([x - r, y - r, x + r, y + r], fill=(0, 160, 255, 90)); gd.ellipse([x - r * .5, y - r * .5, x + r * .5, y + r * .5], fill=(124, 77, 255, 70))
        img.alpha_composite(gl.filter(ImageFilter.GaussianBlur(r * .45)))
    if stars:
        random.seed(7); d = ImageDraw.Draw(img, 'RGBA')
        for _ in range(int(W * H / 9000)):
            x, y = random.randrange(W), random.randrange(H); s = random.choice([1, 1, 2]) * max(1, W // 1200)
            d.ellipse([x, y, x + s, y + s], fill=(180, 230, 255, random.randrange(40, 150)))
    return img

def text(img, xy, s, size, fill, spacing=0, font=FONT):
    f = ImageFont.truetype(font, size); d = ImageDraw.Draw(img, 'RGBA'); x, y = xy
    for ch in s:
        d.text((x, y), ch, font=f, fill=fill); x += d.textlength(ch, font=f) + spacing
    return x

def text_w(s, size, spacing=0, font=FONT):
    f = ImageFont.truetype(font, size); return sum(f.getlength(c) + spacing for c in s) - spacing

def ss_render(W, H, fn, SS=2):
    img = fn(W * SS, H * SS, SS)
    return img.resize((W, H), Image.LANCZOS)

def center_scene(S_w, S_h, u, grid=False, dy=0):
    ox = S_w / 2; oy = S_h / 2 - 3.95 * u + dy
    return scene(u, ox, oy, grid=grid)

# ---------- artwork ----------
def cover(W, H, SS):
    img = background(W, H, glow_at=(int(W * .72), int(H * .55)), glow_r=.55, stars=True)
    paint(img, scene(31 * SS, 860 * SS, 150 * SS, grid=True), 9 * SS)
    d = ImageDraw.Draw(img, 'RGBA')
    d.rectangle([64 * SS, 150 * SS, 68 * SS, 470 * SS], fill=CY + (255,))
    text(img, (92 * SS, 146 * SS), 'CAMPUS NAVIGATION', 20 * SS, CY + (255,), spacing=5 * SS)
    text(img, (88 * SS, 178 * SS), 'AFIT', 128 * SS, (255, 255, 255, 255))
    text(img, (92 * SS, 318 * SS), 'WAYFINDER', 64 * SS, CY + (255,), spacing=4 * SS)
    text(img, (92 * SS, 410 * SS), 'Every hall, hostel and lecture room.', 27 * SS, (210, 225, 245, 255), font=FONTR)
    text(img, (92 * SS, 450 * SS), 'Live 3D map  /  walking routes  /  photos', 22 * SS, (140, 170, 210, 255), font=FONTR)
    return img

def icon_master(S, SS, fg=False, u_k=0.042):
    W = H = S
    img = Image.new('RGBA', (W, H), (0, 0, 0, 0)) if fg else background(W, H, glow_at=(W // 2, int(H * .55)), glow_r=.5)
    paint(img, center_scene(W, H, u_k * W, dy=H * 0.02), 0.012 * W)
    return img

def splash(W, H, SS):
    land = W > H
    img = background(W, H, glow_at=(W // 2, int(H * (.38 if land else .34))), glow_r=.45, stars=True)
    S = min(W, H); u = (H * .042) if land else (W * .034)
    oy = H * (.17 if land else .24)
    paint(img, scene(u, W / 2, oy, grid=True), u * .3)
    size = int(S * .07 * (1.0 if land else 1.0)); y = int(oy + 10.9 * u + H * .05)
    t = 'AFIT WAYFINDER'; sp = size * .12
    text(img, ((W - text_w(t, size, sp)) / 2, y), t, size, (255, 255, 255, 255), spacing=sp)
    t2 = 'NAVIGATE THE CAMPUS IN 3D'; s2 = int(size * .36); sp2 = s2 * .25
    text(img, ((W - text_w(t2, s2, sp2, FONTR)) / 2, y + size * 1.4), t2, s2, CY + (255,), spacing=sp2, font=FONTR)
    return img

# ---------- svg ----------
def svg_icon(S=64):
    u = S * .04
    items = center_scene(S, S, u, dy=S * .02)
    def col(c): return f'rgb({c[0]},{c[1]},{c[2]})', (c[3] / 255 if len(c) > 3 else 1)
    out = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {S} {S}" width="{S}" height="{S}">',
           '<defs><linearGradient id="bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#030614"/><stop offset="1" stop-color="#0c1e4e"/></linearGradient>',
           f'<filter id="glow" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="{S*.012:.2f}"/></filter></defs>',
           f'<rect width="{S}" height="{S}" rx="{S*.22:.1f}" fill="url(#bg)"/>']
    for gp in (True, False):
        for i in items:
            if gp and not i.get('glow'): continue
            f = ' filter="url(#glow)"' if gp else ''
            if i['k'] == 'poly':
                pts = ' '.join(f'{x:.2f},{y:.2f}' for x, y in i['pts'])
                if gp:
                    c, a = col(tuple(i.get('gc', i['stroke'][:3])) + (255,)); out.append(f'<polygon points="{pts}" fill="none" stroke="{c}" stroke-width="{i["sw"]*2:.2f}"{f}/>')
                else:
                    fc, fa = col(i['fill']); sc, sa = col(i['stroke']) if i.get('stroke') else ('none', 0)
                    out.append(f'<polygon points="{pts}" fill="{fc}" fill-opacity="{fa:.2f}" stroke="{sc}" stroke-opacity="{sa:.2f}" stroke-width="{i["sw"]:.2f}"/>')
            elif i['k'] == 'line':
                pts = ' '.join(f'{x:.2f},{y:.2f}' for x, y in i['pts']); c, a = col(i['color'])
                da = f' stroke-dasharray="{i["dash"][0]:.2f} {i["dash"][1]:.2f}"' if i.get('dash') and not gp else ''
                out.append(f'<polyline points="{pts}" fill="none" stroke="{c}" stroke-opacity="{a:.2f}" stroke-width="{i["w"]*(2 if gp else 1):.2f}" stroke-linejoin="round" stroke-linecap="round"{da}{f}/>')
            elif i['k'] == 'circle':
                x, y = i['c']; fc, fa = col(i['fill']); sc, sa = col(i['stroke']) if i.get('stroke') else ('none', 0)
                out.append(f'<circle cx="{x:.2f}" cy="{y:.2f}" r="{i["r"]:.2f}" fill="{fc}" stroke="{sc}" stroke-width="{i.get("sw",0):.2f}"{f}/>' if gp is False else f'<circle cx="{x:.2f}" cy="{y:.2f}" r="{i["r"]:.2f}" fill="{col(MG+(255,))[0]}"{f}/>')
    out.append('</svg>'); return '\n'.join(out)


# ---------- build everything into the project ----------
if __name__ == '__main__':
    ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    RES = os.path.join(ROOT, 'android/app/src/main/res')
    pub = lambda n: os.path.join(ROOT, 'public', n)
    ss_render(1200, 630, cover).convert('RGB').save(pub('cover.jpg'), quality=86, optimize=True)
    open(pub('favicon.svg'), 'w').write(svg_icon(64))
    ic = icon_master(1024, 1).convert('RGBA')
    ic.resize((512, 512), Image.LANCZOS).convert('RGB').save(pub('icon-512.png'), optimize=True)
    fg = icon_master(1024, 1, fg=True, u_k=0.036)

    def mask(img, kind):
        m = Image.new('L', img.size, 0); d = ImageDraw.Draw(m); w = img.size[0] - 1
        (d.ellipse if kind == 'circle' else lambda b, fill: d.rounded_rectangle(b, radius=int(img.size[0] * .22), fill=fill))([0, 0, w, w], fill=255)
        o = img.copy(); o.putalpha(m); return o
    for dens, s, f in [('mdpi', 48, 108), ('hdpi', 72, 162), ('xhdpi', 96, 216), ('xxhdpi', 144, 324), ('xxxhdpi', 192, 432)]:
        sq = ic.resize((s, s), Image.LANCZOS)
        mask(sq, 'round').save(f'{RES}/mipmap-{dens}/ic_launcher.png')
        mask(sq, 'circle').save(f'{RES}/mipmap-{dens}/ic_launcher_round.png')
        fg.resize((f, f), Image.LANCZOS).save(f'{RES}/mipmap-{dens}/ic_launcher_foreground.png')
    for root, _, files in os.walk(RES):  # splash screens keep their existing sizes
        for fn in files:
            if fn == 'splash.png':
                p = os.path.join(root, fn); W, H = Image.open(p).size
                ss_render(W, H, splash, 2 if W * H < 600000 else 1).convert('RGB').save(p, optimize=True)
    print('artwork written')
