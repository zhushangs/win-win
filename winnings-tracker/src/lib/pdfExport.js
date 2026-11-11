// Builds a printable A4 PDF of a winnings list without any PDF library.
//
// Each page is drawn on a <canvas> with the system fonts, so any text the phone can
// display (including Chinese brand names) shows up correctly. Pages are encoded as JPEG
// and wrapped in a minimal PDF. Text in the PDF is an image (not selectable).

const PAGE_W = 595.28; // A4 in points
const PAGE_H = 841.89;
const SCALE = 2; // canvas pixels per point (sharp enough for screens and printing)
const MARGIN = 40;
const FOOTER_SPACE = 28;

const FONT_STACK =
  '-apple-system, BlinkMacSystemFont, "Helvetica Neue", "PingFang SC", "Hiragino Sans GB", ' +
  '"Microsoft YaHei", "Noto Sans CJK SC", Arial, sans-serif';

const COLORS = {
  ink: '#111827',
  sub: '#475569',
  muted: '#64748b',
  accent: '#7c3aed',
  band: '#f5f3ff',
  rule: '#e2e8f0'
};

const HEIGHTS = { header: 78, month: 32, item: 38 };

const font = (size, weight = 400) => `${weight} ${size}px ${FONT_STACK}`;

// Shorten text with an ellipsis so it fits in maxWidth.
const fit = (ctx, text, maxWidth) => {
  const s = String(text ?? '');
  if (ctx.measureText(s).width <= maxWidth) return s;
  let t = s;
  while (t.length > 1 && ctx.measureText(t + '…').width > maxWidth) t = t.slice(0, -1);
  return t + '…';
};

// Split the content into pages. A month header is never left alone at the bottom of a page.
const paginate = (months) => {
  const pages = [[]];
  const bottom = PAGE_H - MARGIN - FOOTER_SPACE;
  let y = MARGIN;
  const place = (block, height, keepWith = 0) => {
    if (y + height + keepWith > bottom && pages[pages.length - 1].length > 0) {
      pages.push([]);
      y = MARGIN;
    }
    pages[pages.length - 1].push({ ...block, y });
    y += height;
  };
  place({ kind: 'header' }, HEIGHTS.header);
  months.forEach(m => {
    place({ kind: 'month', month: m }, HEIGHTS.month, m.items.length ? HEIGHTS.item : 0);
    m.items.forEach(item => place({ kind: 'item', item }, HEIGHTS.item));
  });
  return pages;
};

const drawPage = (blocks, doc, pageIndex, pageCount) => {
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(PAGE_W * SCALE);
  canvas.height = Math.round(PAGE_H * SCALE);
  const ctx = canvas.getContext('2d');
  ctx.scale(SCALE, SCALE);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, PAGE_W, PAGE_H);
  ctx.textBaseline = 'alphabetic';

  const left = MARGIN;
  const right = PAGE_W - MARGIN;
  const width = right - left;

  blocks.forEach(b => {
    const y = b.y;
    if (b.kind === 'header') {
      ctx.fillStyle = COLORS.ink;
      ctx.font = font(20, 800);
      ctx.fillText(fit(ctx, doc.title, width), left, y + 22);
      ctx.fillStyle = COLORS.sub;
      ctx.font = font(12, 500);
      ctx.fillText(fit(ctx, doc.subtitle, width), left, y + 42);
      ctx.fillStyle = COLORS.muted;
      ctx.font = font(9.5);
      ctx.fillText(doc.generated, left, y + 58);
      ctx.fillStyle = COLORS.accent;
      ctx.fillRect(left, y + 66, width, 2);
    } else if (b.kind === 'month') {
      ctx.fillStyle = COLORS.band;
      ctx.fillRect(left, y + 4, width, 24);
      ctx.fillStyle = COLORS.ink;
      ctx.font = font(12.5, 800);
      ctx.fillText(b.month.label, left + 8, y + 20.5);
      ctx.fillStyle = COLORS.accent;
      ctx.font = font(11, 700);
      ctx.textAlign = 'right';
      ctx.fillText(b.month.summary, right - 8, y + 20.5);
      ctx.textAlign = 'left';
    } else if (b.kind === 'item') {
      const { item } = b;
      ctx.font = font(11.5, 700);
      const priceWidth = ctx.measureText(item.price).width;
      ctx.fillStyle = COLORS.ink;
      ctx.textAlign = 'right';
      ctx.fillText(item.price, right - 8, y + 16);
      ctx.textAlign = 'left';
      ctx.fillText(fit(ctx, item.title, width - priceWidth - 32), left + 8, y + 16);
      ctx.fillStyle = COLORS.muted;
      ctx.font = font(9.5);
      ctx.fillText(fit(ctx, item.meta, width - 16), left + 8, y + 30);
      ctx.fillStyle = COLORS.rule;
      ctx.fillRect(left + 8, y + 37, width - 16, 0.75);
    }
  });

  ctx.fillStyle = COLORS.muted;
  ctx.font = font(9);
  ctx.textAlign = 'center';
  ctx.fillText(`Win Win · Page ${pageIndex + 1} of ${pageCount}`, PAGE_W / 2, PAGE_H - MARGIN + 8);
  ctx.textAlign = 'left';
  return canvas;
};

const canvasToJpeg = (canvas) =>
  new Promise((resolve, reject) => {
    canvas.toBlob(async blob => {
      if (!blob) return reject(new Error('Could not render page'));
      resolve({ bytes: new Uint8Array(await blob.arrayBuffer()), w: canvas.width, h: canvas.height });
    }, 'image/jpeg', 0.9);
  });

// Minimal PDF: one full-page JPEG image per page.
const assemblePdf = (images) => {
  const enc = new TextEncoder();
  const chunks = [];
  const offsets = [];
  let length = 0;
  const push = d => {
    const bytes = typeof d === 'string' ? enc.encode(d) : d;
    chunks.push(bytes);
    length += bytes.length;
  };
  const obj = (num, writeBody) => {
    offsets[num] = length;
    push(`${num} 0 obj\n`);
    writeBody();
    push('\nendobj\n');
  };

  push('%PDF-1.4\n');
  push(new Uint8Array([0x25, 0xe2, 0xe3, 0xcf, 0xd3, 0x0a])); // binary marker comment

  // 1 = catalog, 2 = page tree, then per page i: page 3+3i, contents 4+3i, image 5+3i
  obj(1, () => push('<< /Type /Catalog /Pages 2 0 R >>'));
  const kids = images.map((_, i) => `${3 + 3 * i} 0 R`).join(' ');
  obj(2, () => push(`<< /Type /Pages /Kids [${kids}] /Count ${images.length} >>`));
  images.forEach((img, i) => {
    const p = 3 + 3 * i;
    obj(p, () => push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_W} ${PAGE_H}] ` +
      `/Resources << /XObject << /Im0 ${p + 2} 0 R >> >> /Contents ${p + 1} 0 R >>`
    ));
    const content = `q ${PAGE_W} 0 0 ${PAGE_H} 0 0 cm /Im0 Do Q`;
    obj(p + 1, () => {
      push(`<< /Length ${content.length} >>\nstream\n`);
      push(content);
      push('\nendstream');
    });
    obj(p + 2, () => {
      push(
        `<< /Type /XObject /Subtype /Image /Width ${img.w} /Height ${img.h} /ColorSpace /DeviceRGB ` +
        `/BitsPerComponent 8 /Filter /DCTDecode /Length ${img.bytes.length} >>\nstream\n`
      );
      push(img.bytes);
      push('\nendstream');
    });
  });

  const xrefStart = length;
  const count = 3 + 3 * images.length;
  let xref = `xref\n0 ${count}\n0000000000 65535 f \n`;
  for (let k = 1; k < count; k++) xref += `${String(offsets[k]).padStart(10, '0')} 00000 n \n`;
  push(xref);
  push(`trailer\n<< /Size ${count} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF\n`);
  return new Blob(chunks, { type: 'application/pdf' });
};

/**
 * @param {object} doc
 * @param {string} doc.title      e.g. "Win Win — 2026"
 * @param {string} doc.subtitle   e.g. "54 items · $2,345.00"
 * @param {string} doc.generated  e.g. "Generated Nov 11, 2026"
 * @param {Array<{label: string, summary: string, items: Array<{title: string, meta: string, price: string}>}>} doc.months
 * @returns {Promise<Blob>} application/pdf
 */
export async function createWinningsPdf(doc) {
  const pages = paginate(doc.months);
  const images = [];
  for (let i = 0; i < pages.length; i++) {
    images.push(await canvasToJpeg(drawPage(pages[i], doc, i, pages.length)));
  }
  return assemblePdf(images);
}
