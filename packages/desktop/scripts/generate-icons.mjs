import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Always resolve relative to this script's location so it works regardless of cwd
const ROOT = path.resolve(__dirname, '..');
const ASSETS = path.join(ROOT, 'assets');
const ICONSET = path.join(ASSETS, 'icon.iconset');

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & (-(c & 1)));
  }
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const t = Buffer.from(type);
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([t, data])), 0);
  return Buffer.concat([len, t, data, crc]);
}

function writePng(filePath, w, h, rgba) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace

  const stride = w * 4;
  const raw = Buffer.alloc((stride + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (stride + 1)] = 0; // filter 0
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, y * stride + stride);
  }
  const idat = zlib.deflateSync(raw, { level: 9 });

  const png = Buffer.concat([
    sig,
    chunk('IHDR', ihdr),
    chunk('IDAT', idat),
    chunk('IEND', Buffer.alloc(0)),
  ]);

  if (filePath) {
    fs.writeFileSync(filePath, png);
  }
  return png;
}

function writeIcns(filePath, elements) {
  // ICNS container format:
  // - header: 'icns' + uint32be size
  // - repeated: type(4) + uint32be elem_size + data
  const parts = [];
  for (const el of elements) {
    const type = Buffer.from(el.type);
    if (type.length !== 4) throw new Error(`ICNS element type must be 4 chars: ${el.type}`);

    const size = Buffer.alloc(4);
    size.writeUInt32BE(8 + el.data.length, 0);
    parts.push(Buffer.concat([type, size, el.data]));
  }

  const totalSize = 8 + parts.reduce((sum, p) => sum + p.length, 0);
  const header = Buffer.alloc(8);
  header.write('icns', 0, 'ascii');
  header.writeUInt32BE(totalSize, 4);

  fs.writeFileSync(filePath, Buffer.concat([header, ...parts]));
}

function mix(a, b, t) {
  return a + (b - a) * t;
}

function clamp01(x) {
  return x < 0 ? 0 : x > 1 ? 1 : x;
}

function roundedRectMask(x, y, cx, cy, w, h, r) {
  const dx = Math.abs(x - cx) - (w / 2 - r);
  const dy = Math.abs(y - cy) - (h / 2 - r);
  const ax = Math.max(dx, 0);
  const ay = Math.max(dy, 0);
  return ax * ax + ay * ay <= r * r && dx <= r && dy <= r;
}

function renderIcon(size) {
  const w = size;
  const h = size;
  const buf = Buffer.alloc(w * h * 4);

  // Colors
  const bg0 = { r: 11, g: 16, b: 32 };
  const bg1 = { r: 79, g: 70, b: 229 };
  const white = { r: 255, g: 255, b: 255 };
  const ink = { r: 11, g: 16, b: 32 };

  // Geometry (normalized)
  const bodyW = 0.46;
  const bodyH = 0.34;
  const bodyCx = 0.5;
  const bodyCy = 0.66;
  const bodyR = 0.09;

  const shCx = 0.5;
  const shCy = 0.50;
  const shR = 0.21;
  const shT = 0.06;
  const shTopCut = 0.60;

  const holeCx = 0.5;
  const holeCy = 0.70;
  const holeR = 0.075;
  const stemW = 0.055;
  const stemH = 0.17;

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const nx = (x + 0.5) / w;
      const ny = (y + 0.5) / h;

      // Background gradient
      const t = clamp01((nx * 0.65 + ny * 0.95) * 0.75);
      let r = mix(bg0.r, bg1.r, t);
      let g = mix(bg0.g, bg1.g, t);
      let b = mix(bg0.b, bg1.b, t);

      // Subtle vignette
      const dx = nx - 0.5;
      const dy = ny - 0.5;
      const v = clamp01((dx * dx + dy * dy) * 1.35);
      r = mix(r, bg0.r, v * 0.40);
      g = mix(g, bg0.g, v * 0.40);
      b = mix(b, bg0.b, v * 0.40);

      // Lock body (rounded rect)
      const inBody = roundedRectMask(nx, ny, bodyCx, bodyCy, bodyW, bodyH, bodyR);

      // Shackle ring (circle thickness), clipped to top region
      const sd = Math.hypot(nx - shCx, ny - shCy);
      const inRing = sd <= shR && sd >= shR - shT && ny <= shTopCut;
      const innerCut = Math.hypot(nx - shCx, ny - shCy) <= (shR - shT) && ny <= shTopCut;
      const inShackle = inRing && !innerCut;

      // Drop shadow (simple offset sample)
      const shadowOffsetX = 0.010;
      const shadowOffsetY = 0.016;
      const inBodyShadow = roundedRectMask(nx - shadowOffsetX, ny - shadowOffsetY, bodyCx, bodyCy, bodyW, bodyH, bodyR);
      const sdS = Math.hypot((nx - shadowOffsetX) - shCx, (ny - shadowOffsetY) - shCy);
      const inRingS = sdS <= shR && sdS >= shR - shT && (ny - shadowOffsetY) <= shTopCut;
      const innerCutS = sdS <= (shR - shT) && (ny - shadowOffsetY) <= shTopCut;
      const inShackleShadow = inRingS && !innerCutS;
      const inShadow = (inBodyShadow || inShackleShadow) && !(inBody || inShackle);

      // Apply shadow
      if (inShadow) {
        r = mix(r, 0, 0.22);
        g = mix(g, 0, 0.22);
        b = mix(b, 0, 0.22);
      }

      // Apply lock fills
      if (inBody || inShackle) {
        r = mix(r, white.r, 0.95);
        g = mix(g, white.g, 0.95);
        b = mix(b, white.b, 0.95);
      }

      // Keyhole
      const inHole = Math.hypot(nx - holeCx, ny - holeCy) <= holeR;
      const inStem = Math.abs(nx - holeCx) <= stemW / 2 && ny >= holeCy && ny <= holeCy + stemH;
      if ((inHole || inStem) && (inBody || inShackle)) {
        r = mix(r, ink.r, 0.60);
        g = mix(g, ink.g, 0.60);
        b = mix(b, ink.b, 0.60);
      }

      const i = (y * w + x) * 4;
      buf[i + 0] = Math.round(r);
      buf[i + 1] = Math.round(g);
      buf[i + 2] = Math.round(b);
      buf[i + 3] = 255;
    }
  }

  return buf;
}

function writeIco(filePath, entries) {
  // entries: [{size:number, png:Buffer}]
  const count = entries.length;
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type icon
  header.writeUInt16LE(count, 4);

  const dir = Buffer.alloc(count * 16);
  let offset = 6 + count * 16;
  const bodies = [];

  entries.forEach((e, idx) => {
    const w = e.size === 256 ? 0 : e.size;
    const h = e.size === 256 ? 0 : e.size;
    const p = idx * 16;
    dir[p + 0] = w;
    dir[p + 1] = h;
    dir[p + 2] = 0; // palette
    dir[p + 3] = 0;
    dir.writeUInt16LE(1, p + 4); // planes
    dir.writeUInt16LE(32, p + 6); // bpp
    dir.writeUInt32LE(e.png.length, p + 8);
    dir.writeUInt32LE(offset, p + 12);
    offset += e.png.length;
    bodies.push(e.png);
  });

  fs.writeFileSync(filePath, Buffer.concat([header, dir, ...bodies]));
}

function main() {
  fs.mkdirSync(ASSETS, { recursive: true });
  fs.mkdirSync(ICONSET, { recursive: true });

  // Create base PNGs for iconset
  const iconsetFiles = [
    { name: 'icon_16x16.png', size: 16 },
    { name: 'icon_16x16@2x.png', size: 32 },
    { name: 'icon_32x32.png', size: 32 },
    { name: 'icon_32x32@2x.png', size: 64 },
    { name: 'icon_128x128.png', size: 128 },
    { name: 'icon_128x128@2x.png', size: 256 },
    { name: 'icon_256x256.png', size: 256 },
    { name: 'icon_256x256@2x.png', size: 512 },
    { name: 'icon_512x512.png', size: 512 },
    { name: 'icon_512x512@2x.png', size: 1024 },
  ];

  for (const f of iconsetFiles) {
    const rgba = renderIcon(f.size);
    writePng(path.join(ICONSET, f.name), f.size, f.size, rgba);
  }

  // Convenience PNG
  {
    const rgba = renderIcon(1024);
    writePng(path.join(ASSETS, 'icon.png'), 1024, 1024, rgba);
  }

  // Generate .icns (macOS) without relying on external tooling (iconutil)
  const icnsPath = path.join(ASSETS, 'icon.icns');
  const icnsSpecs = [
    { type: 'icp4', size: 16 },
    { type: 'icp5', size: 32 },
    { type: 'ic07', size: 128 },
    { type: 'ic08', size: 256 },
    { type: 'ic09', size: 512 },
    { type: 'ic10', size: 1024 },
  ];
  const icnsElements = icnsSpecs.map((s) => {
    const rgba = renderIcon(s.size);
    const png = writePng(undefined, s.size, s.size, rgba);
    return { type: s.type, data: png };
  });
  writeIcns(icnsPath, icnsElements);

  // Generate .ico (Windows) with PNG entries
  const icoPath = path.join(ASSETS, 'icon.ico');
  const icoSizes = [16, 32, 48, 256];
  const icoEntries = icoSizes.map((s) => {
    const rgba = renderIcon(s);
    const png = writePng(path.join(ASSETS, `.tmp-icon-${s}.png`), s, s, rgba);
    fs.unlinkSync(path.join(ASSETS, `.tmp-icon-${s}.png`));
    return { size: s, png };
  });
  writeIco(icoPath, icoEntries);

  console.log(
    `\nGenerated:\n- ${path.relative(process.cwd(), path.join(ASSETS, 'icon.png'))}\n- ${path.relative(process.cwd(), icnsPath)}\n- ${path.relative(process.cwd(), icoPath)}\n`,
  );
}

main();