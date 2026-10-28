# Previsualizaciones de Makito para la web (diseñador de merchandising): a partir de la previsualización ORIGINAL que guarda
# «Marcaje Makito» en su caché (mkm/v/<mref>-<área>.webp, con la zona pintada en verde) se quita el verde y se rellena el hueco
# de forma natural: por columnas, interpolación vertical entre lo que hay justo encima y justo debajo de la zona (en tazas,
# bidones o cajas el color y las sombras siguen igual hacia arriba y hacia abajo), y un suavizado horizontal ligero dentro del
# hueco para que no queden rayas. Solo se hacen las áreas que el diseñador muestra con la previsualización (las que hay en mkm/z/).
# No cambia nada de «Marcaje Makito» (sus scripts siguen igual). Uso: python3 scripts/makito-previas-web.py mkm mkz
import sys, os, numpy as np, cv2
from PIL import Image

def mascara(a):
    r, g, b = [a[..., i].astype(int) for i in range(3)]
    relleno = (abs(r - 192) <= 26) & (abs(g - 240) <= 18) & (abs(b - 180) <= 30) & (g - r >= 28) & (g - b >= 34)
    borde = (g >= 130) & (g - r >= 70) & (g - b >= 70) & (r <= 170)
    m = (relleno | borde).astype(np.uint8)
    k = np.ones((3, 3), np.uint8)
    m = cv2.dilate(m, k, iterations=2)
    verdoso = ((g - np.maximum(r, b)) >= 10).astype(np.uint8)
    for _ in range(3): m = m | (cv2.dilate(m, k) & verdoso)  # halo verdoso pegado a la zona
    return cv2.dilate(m, k).astype(bool)

def limpiar(src, dst, K=4):
    a = np.array(Image.open(src).convert("RGB")); h, w = a.shape[:2]; m = mascara(a)
    if not m.any(): Image.fromarray(a).save(dst, "WEBP", quality=74, method=5); return
    out = a.astype(np.float32)
    for x in np.nonzero(m.any(0))[0]:
        col, y = m[:, x], 0
        while y < h:
            if not col[y]: y += 1; continue
            y0 = y
            while y < h and col[y]: y += 1
            up, dn = a[max(0, y0 - K):y0, x].astype(np.float32), a[y:min(h, y + K), x].astype(np.float32)
            if not len(up) and not len(dn): continue
            U = np.median(up, 0) if len(up) else np.median(dn, 0)
            D = np.median(dn, 0) if len(dn) else U
            t = np.linspace(0, 1, y - y0 + 2)[1:-1][:, None]
            out[y0:y, x] = U * (1 - t) + D * t
    out = np.clip(out, 0, 255).astype(np.uint8)
    suave = cv2.GaussianBlur(out, (0, 0), sigmaX=2.2, sigmaY=.6)
    out[m] = suave[m]
    Image.fromarray(out).save(dst, "WEBP", quality=74, method=5)

if __name__ == "__main__":
    cache, dest = sys.argv[1], sys.argv[2]
    os.makedirs(dest, exist_ok=True)
    nombres = sorted(f for f in os.listdir(os.path.join(cache, "z")) if f.endswith(".webp"))
    hechas = falta = 0
    for f in nombres:
        src = os.path.join(cache, "v", f)
        if not os.path.exists(src): falta += 1; continue
        try: limpiar(src, os.path.join(dest, f)); hechas += 1
        except Exception as e: print("no se pudo", f, e)
    print(f"Previsualizaciones para la web: {hechas} (sin original en la caché: {falta})")
