import * as THREE from 'three';

function makeCanvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D | null] {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  return [canvas, canvas.getContext('2d')];
}

function finalizeTexture(canvas: HTMLCanvasElement, repeatX = 1, repeatY = 1): THREE.CanvasTexture {
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeatX, repeatY);
  tex.needsUpdate = true;
  return tex;
}

/**
 * Honey-oak plank wood texture matching the warm golden hardwood floor in the apartment.
 */
export function createOakFloorTexture(): THREE.CanvasTexture {
  const [canvas, ctx] = makeCanvas(512, 512);
  if (!ctx) return finalizeTexture(canvas, 3, 3);

  ctx.fillStyle = '#c97e42';
  ctx.fillRect(0, 0, 512, 512);

  const plankHeight = 64;
  const tones = ['#c87b3e', '#d1874a', '#bd7137', '#cc8042', '#d78f50'];

  for (let row = 0; row < 8; row++) {
    const y = row * plankHeight;
    const offset = (row % 2) * 128;
    for (let col = -1; col < 3; col++) {
      const x = col * 256 + offset;
      ctx.fillStyle = tones[(row * 3 + col + 4) % tones.length];
      ctx.fillRect(x, y, 254, plankHeight - 2);

      // Subtle oak grain lines
      ctx.strokeStyle = 'rgba(110, 55, 20, 0.16)';
      ctx.lineWidth = 1.5;
      for (let g = 0; g < 5; g++) {
        const gy = y + 10 + g * 11;
        ctx.beginPath();
        ctx.moveTo(x + 4, gy);
        ctx.bezierCurveTo(x + 80, gy + ((g % 2) * 3 - 1.5), x + 170, gy - 1.5, x + 250, gy);
        ctx.stroke();
      }
    }
    ctx.fillStyle = '#8b4b21';
    ctx.fillRect(0, y + plankHeight - 2, 512, 2);
  }

  return finalizeTexture(canvas, 3, 3);
}

/**
 * Blue-and-white checkered/plaid gingham fabric texture for pillows & bedspread.
 */
export function createBluePlaidTexture(): THREE.CanvasTexture {
  const [canvas, ctx] = makeCanvas(256, 256);
  if (!ctx) return finalizeTexture(canvas, 2, 2);

  ctx.fillStyle = '#e8effc';
  ctx.fillRect(0, 0, 256, 256);

  const step = 32;
  ctx.fillStyle = 'rgba(59, 108, 214, 0.35)';
  for (let x = 0; x < 256; x += step * 2) {
    ctx.fillRect(x, 0, step, 256);
  }
  ctx.fillStyle = 'rgba(43, 88, 188, 0.38)';
  for (let y = 0; y < 256; y += step * 2) {
    ctx.fillRect(0, y, 256, step);
  }

  // Thin crisp grid accents
  ctx.strokeStyle = 'rgba(30, 64, 175, 0.25)';
  ctx.lineWidth = 1;
  for (let i = 0; i < 256; i += step) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i, 256);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, i);
    ctx.lineTo(256, i);
    ctx.stroke();
  }

  return finalizeTexture(canvas, 2, 2);
}

/**
 * Cozy textured grey-blue bedroom woven rug.
 */
export function createWovenRugTexture(): THREE.CanvasTexture {
  const [canvas, ctx] = makeCanvas(256, 256);
  if (!ctx) return finalizeTexture(canvas, 1, 1);

  ctx.fillStyle = '#6f7991';
  ctx.fillRect(0, 0, 256, 256);

  for (let y = 0; y < 256; y += 6) {
    ctx.fillStyle = y % 12 === 0 ? 'rgba(255,255,255,0.08)' : 'rgba(20,24,42,0.12)';
    ctx.fillRect(0, y, 256, 3);
  }

  ctx.strokeStyle = 'rgba(226, 232, 240, 0.22)';
  ctx.lineWidth = 4;
  ctx.strokeRect(10, 10, 236, 236);

  return finalizeTexture(canvas, 1, 1);
}

/**
 * Patterned blue-grey diamond geometric rug underneath the dining table.
 */
export function createDiamondRugTexture(): THREE.CanvasTexture {
  const [canvas, ctx] = makeCanvas(256, 256);
  if (!ctx) return finalizeTexture(canvas, 2, 2);

  ctx.fillStyle = '#475572';
  ctx.fillRect(0, 0, 256, 256);

  ctx.strokeStyle = 'rgba(226, 232, 240, 0.42)';
  ctx.lineWidth = 3;
  const s = 64;
  for (let x = 0; x <= 256; x += s) {
    for (let y = 0; y <= 256; y += s) {
      ctx.beginPath();
      ctx.moveTo(x + s / 2, y);
      ctx.lineTo(x + s, y + s / 2);
      ctx.lineTo(x + s / 2, y + s);
      ctx.lineTo(x, y + s / 2);
      ctx.closePath();
      ctx.stroke();
    }
  }

  return finalizeTexture(canvas, 2, 2);
}

/**
 * Porcelain bathroom wall/floor tile grid texture.
 */
export function createTileGridTexture(baseHex = '#cbd2dc', lineHex = '#8d96a6', repeatX = 4, repeatY = 4): THREE.CanvasTexture {
  const [canvas, ctx] = makeCanvas(256, 256);
  if (!ctx) return finalizeTexture(canvas, repeatX, repeatY);

  ctx.fillStyle = baseHex;
  ctx.fillRect(0, 0, 256, 256);

  ctx.strokeStyle = lineHex;
  ctx.lineWidth = 3;
  for (let i = 0; i <= 256; i += 64) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i, 256);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, i);
    ctx.lineTo(256, i);
    ctx.stroke();
  }

  return finalizeTexture(canvas, repeatX, repeatY);
}

/**
 * Framed Mt. Fuji landscape painting above the bed headboard.
 */
export function createMtFujiArtTexture(): THREE.CanvasTexture {
  const [canvas, ctx] = makeCanvas(256, 320);
  if (!ctx) return finalizeTexture(canvas, 1, 1);

  const sky = ctx.createLinearGradient(0, 0, 0, 200);
  sky.addColorStop(0, '#1d4ed8');
  sky.addColorStop(0.65, '#60a5fa');
  sky.addColorStop(1, '#dbeafe');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, 256, 320);

  // Calm lake bottom
  const lake = ctx.createLinearGradient(0, 205, 0, 320);
  lake.addColorStop(0, '#93c5fd');
  lake.addColorStop(1, '#1e3a8a');
  ctx.fillStyle = lake;
  ctx.fillRect(0, 205, 256, 115);

  // Mt Fuji silhouette
  ctx.fillStyle = '#1e3a8a';
  ctx.beginPath();
  ctx.moveTo(22, 205);
  ctx.lineTo(106, 86);
  ctx.lineTo(150, 86);
  ctx.lineTo(234, 205);
  ctx.closePath();
  ctx.fill();

  // Snow cap
  ctx.fillStyle = '#f8fafc';
  ctx.beginPath();
  ctx.moveTo(106, 86);
  ctx.lineTo(150, 86);
  ctx.lineTo(172, 122);
  ctx.lineTo(152, 114);
  ctx.lineTo(138, 128);
  ctx.lineTo(122, 114);
  ctx.lineTo(102, 126);
  ctx.lineTo(84, 120);
  ctx.closePath();
  ctx.fill();

  // Lake reflection
  ctx.fillStyle = 'rgba(30, 58, 138, 0.42)';
  ctx.beginPath();
  ctx.moveTo(64, 205);
  ctx.lineTo(128, 286);
  ctx.lineTo(192, 205);
  ctx.closePath();
  ctx.fill();

  return finalizeTexture(canvas, 1, 1);
}

/**
 * Window vista artwork matching Night (full moon + cozy neighborhood silhouettes),
 * Sunset, or Day views.
 */
export function createWindowBackdropTexture(mode: 'night' | 'sunset' | 'day'): THREE.CanvasTexture {
  const [canvas, ctx] = makeCanvas(512, 320);
  if (!ctx) return finalizeTexture(canvas, 1, 1);

  const grad = ctx.createLinearGradient(0, 0, 0, 320);
  if (mode === 'night') {
    grad.addColorStop(0, '#071436');
    grad.addColorStop(0.55, '#102d6b');
    grad.addColorStop(1, '#1e3a8a');
  } else if (mode === 'sunset') {
    grad.addColorStop(0, '#312e81');
    grad.addColorStop(0.45, '#db2777');
    grad.addColorStop(0.85, '#f59e0b');
    grad.addColorStop(1, '#fde68a');
  } else {
    grad.addColorStop(0, '#1d4ed8');
    grad.addColorStop(0.65, '#60a5fa');
    grad.addColorStop(1, '#e0f2fe');
  }
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 512, 320);

  if (mode === 'night') {
    // Stars
    ctx.fillStyle = 'rgba(248, 250, 252, 0.8)';
    for (let i = 0; i < 42; i++) {
      const sx = ((i * 97) % 490) + 10;
      const sy = ((i * 53) % 165) + 10;
      ctx.fillRect(sx, sy, i % 3 === 0 ? 2.5 : 1.5, i % 3 === 0 ? 2.5 : 1.5);
    }

    // Glowing full moon
    const moonGlow = ctx.createRadialGradient(210, 96, 18, 210, 96, 95);
    moonGlow.addColorStop(0, 'rgba(224, 242, 254, 0.95)');
    moonGlow.addColorStop(0.38, 'rgba(147, 197, 253, 0.45)');
    moonGlow.addColorStop(1, 'rgba(30, 58, 138, 0)');
    ctx.fillStyle = moonGlow;
    ctx.beginPath();
    ctx.arc(210, 96, 95, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#e0f2fe';
    ctx.beginPath();
    ctx.arc(210, 96, 36, 0, Math.PI * 2);
    ctx.fill();
  } else if (mode === 'sunset') {
    ctx.fillStyle = '#fde047';
    ctx.beginPath();
    ctx.arc(250, 185, 38, 0, Math.PI * 2);
    ctx.fill();
  } else {
    // Crisp sun + fluffy daylight clouds
    ctx.fillStyle = '#fef08a';
    ctx.beginPath();
    ctx.arc(380, 72, 30, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255, 255, 255, 0.78)';
    [
      [110, 88, 30],
      [142, 82, 36],
      [178, 90, 26],
      [295, 118, 24],
      [325, 112, 32],
    ].forEach(([cx, cy, r]) => {
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fill();
    });
  }

  // Distant pine & rooftop silhouettes
  const silColor = mode === 'night' ? '#07112b' : mode === 'sunset' ? '#2c1638' : '#1e3a5f';
  ctx.fillStyle = silColor;
  ctx.fillRect(0, 258, 512, 62);

  // Pine trees
  const drawTree = (x: number, baseY: number, h: number) => {
    ctx.beginPath();
    ctx.moveTo(x - h * 0.35, baseY);
    ctx.lineTo(x, baseY - h);
    ctx.lineTo(x + h * 0.35, baseY);
    ctx.closePath();
    ctx.fill();
  };
  drawTree(45, 265, 95);
  drawTree(85, 268, 70);
  drawTree(348, 268, 110);
  drawTree(386, 270, 80);
  drawTree(472, 268, 92);

  // Neighborhood houses
  const houses = [
    { x: 115, y: 224, w: 68, h: 42 },
    { x: 215, y: 212, w: 86, h: 52 },
    { x: 400, y: 226, w: 64, h: 40 },
  ];
  for (const h of houses) {
    ctx.fillStyle = silColor;
    ctx.fillRect(h.x, h.y, h.w, h.h);
    ctx.beginPath();
    ctx.moveTo(h.x - 8, h.y);
    ctx.lineTo(h.x + h.w / 2, h.y - 26);
    ctx.lineTo(h.x + h.w + 8, h.y);
    ctx.closePath();
    ctx.fill();

    // Warm lit house windows at night/sunset
    if (mode !== 'day') {
      ctx.fillStyle = '#fbbf24';
      ctx.fillRect(h.x + 14, h.y + 12, 12, 14);
      ctx.fillRect(h.x + h.w - 28, h.y + 12, 12, 14);
    }
  }

  return finalizeTexture(canvas, 1, 1);
}

