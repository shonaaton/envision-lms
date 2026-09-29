import "server-only";

import { inflateSync, deflateSync } from "zlib";

/**
 * A small hand-written PDF 1.4 writer: A4 pages, the three built-in Helvetica
 * faces, and JPEG / 8-bit RGB(A) PNG images. No dependency, which is why the
 * academy's invoices never pulled in a PDF library.
 *
 * The built-in fonts are WinAnsi only, so `esc` drops anything outside
 * printable ASCII - including the rupee sign, which is why amounts print as
 * "INR". Positions given to `PdfCanvas` are measured from the top of the page.
 */

export const PAGE = { width: 595, height: 842 };
export const BRAND = "#5a1372";
export const ACCENT = "#fde75a";
export const INK = "#101828";
export const MUTED = "#667085";
export const LINE = "#e7d9ec";
export const PANEL = "#fbf8fc";
export const GREEN = "#027a48";
export const RED = "#b42318";

export type FontName = "regular" | "bold" | "italic";
export type PdfImage = {
  name: string;
  width: number;
  height: number;
  object: string;
  smask?: string;
};

export function hexToRgb(hex: string) {
  const clean = hex.replace("#", "");
  return [
    parseInt(clean.slice(0, 2), 16) / 255,
    parseInt(clean.slice(2, 4), 16) / 255,
    parseInt(clean.slice(4, 6), 16) / 255,
  ];
}

export function esc(value: unknown) {
  return String(value ?? "")
    .replace(/[()\\]/g, (match) => `\\${match}`)
    .replace(/[^\x20-\x7E]/g, "");
}

export function money(paise: unknown) {
  const amount = Number(paise || 0) / 100;
  return `INR ${new Intl.NumberFormat("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amount)}`;
}

export function date(value: unknown) {
  const parsed = value ? new Date(value as any) : new Date();
  if (Number.isNaN(parsed.getTime())) return "-";
  return parsed.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

export function titleCase(value: unknown) {
  return String(value || "")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function safeFilename(value: unknown) {
  return String(value || "invoice").replace(/[^a-zA-Z0-9._-]+/g, "_").replace(/^_+|_+$/g, "") || "invoice";
}



export function textWidth(value: string, size: number) {
  return value.length * size * 0.49;
}

export function wrapText(value: unknown, size: number, maxWidth: number, maxLines = 4) {
  const words = esc(value).split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (textWidth(next, size) <= maxWidth || !current) {
      current = next;
    } else {
      lines.push(current);
      current = word;
    }
    if (lines.length === maxLines) break;
  }
  if (current && lines.length < maxLines) lines.push(current);
  if (lines.length === maxLines && words.join(" ").length > lines.join(" ").length) {
    lines[maxLines - 1] = `${lines[maxLines - 1].slice(0, Math.max(0, lines[maxLines - 1].length - 3))}...`;
  }
  return lines.length ? lines : [""];
}

export function dataUrlToBuffer(value: unknown) {
  const source = String(value || "");
  const match = source.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) return null;
  return { mime: match[1], buffer: Buffer.from(match[2], "base64") };
}

export function sniffImageMime(buffer: Buffer) {
  if (buffer.length >= 8 && buffer.toString("hex", 0, 8) === "89504e470d0a1a0a") return "image/png";
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return "image/jpeg";
  return "";
}

export function readUInt32(buffer: Buffer, offset: number) {
  return buffer.readUInt32BE(offset);
}

export function parseJpegSize(buffer: Buffer) {
  let offset = 2;
  while (offset < buffer.length) {
    if (buffer[offset] !== 0xff) break;
    const marker = buffer[offset + 1];
    const length = buffer.readUInt16BE(offset + 2);
    if (marker >= 0xc0 && marker <= 0xc3) {
      return { height: buffer.readUInt16BE(offset + 5), width: buffer.readUInt16BE(offset + 7) };
    }
    offset += 2 + length;
  }
  return null;
}

export function unfilterPng(raw: Buffer, width: number, height: number, bytesPerPixel: number) {
  const rowBytes = width * bytesPerPixel;
  const result = Buffer.alloc(rowBytes * height);
  let input = 0;
  for (let y = 0; y < height; y += 1) {
    const filter = raw[input++];
    const rowStart = y * rowBytes;
    const prevStart = (y - 1) * rowBytes;
    for (let x = 0; x < rowBytes; x += 1) {
      const rawByte = raw[input++];
      const left = x >= bytesPerPixel ? result[rowStart + x - bytesPerPixel] : 0;
      const up = y > 0 ? result[prevStart + x] : 0;
      const upLeft = y > 0 && x >= bytesPerPixel ? result[prevStart + x - bytesPerPixel] : 0;
      let value = rawByte;
      if (filter === 1) value = rawByte + left;
      if (filter === 2) value = rawByte + up;
      if (filter === 3) value = rawByte + Math.floor((left + up) / 2);
      if (filter === 4) {
        const p = left + up - upLeft;
        const pa = Math.abs(p - left);
        const pb = Math.abs(p - up);
        const pc = Math.abs(p - upLeft);
        const predictor = pa <= pb && pa <= pc ? left : pb <= pc ? up : upLeft;
        value = rawByte + predictor;
      }
      result[rowStart + x] = value & 255;
    }
  }
  return result;
}

export function parsePng(buffer: Buffer, name: string): PdfImage | null {
  if (buffer.toString("hex", 0, 8) !== "89504e470d0a1a0a") return null;
  let offset = 8;
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  const idats: Buffer[] = [];
  while (offset < buffer.length) {
    const length = readUInt32(buffer, offset);
    const type = buffer.toString("ascii", offset + 4, offset + 8);
    const data = buffer.subarray(offset + 8, offset + 8 + length);
    if (type === "IHDR") {
      width = readUInt32(data, 0);
      height = readUInt32(data, 4);
      bitDepth = data[8];
      colorType = data[9];
    }
    if (type === "IDAT") idats.push(data);
    if (type === "IEND") break;
    offset += length + 12;
  }
  if (bitDepth !== 8 || ![2, 6].includes(colorType) || !width || !height || idats.length === 0) return null;
  const bytesPerPixel = colorType === 6 ? 4 : 3;
  const pixels = unfilterPng(inflateSync(Buffer.concat(idats)), width, height, bytesPerPixel);
  const rgb = Buffer.alloc(width * height * 3);
  const alpha = colorType === 6 ? Buffer.alloc(width * height) : null;
  for (let src = 0, px = 0; src < pixels.length; src += bytesPerPixel, px += 1) {
    rgb[px * 3] = pixels[src];
    rgb[px * 3 + 1] = pixels[src + 1];
    rgb[px * 3 + 2] = pixels[src + 2];
    if (alpha) alpha[px] = pixels[src + 3];
  }
  const colorData = deflateSync(rgb);
  const alphaData = alpha ? deflateSync(alpha) : null;
  return {
    name,
    width,
    height,
    object: `<< /Type /XObject /Subtype /Image /Width ${width} /Height ${height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /FlateDecode /Length ${colorData.length}${alphaData ? " /SMask __SMASK__ 0 R" : ""} >>\nstream\n${colorData.toString("binary")}\nendstream`,
    smask: alphaData ? `<< /Type /XObject /Subtype /Image /Width ${width} /Height ${height} /ColorSpace /DeviceGray /BitsPerComponent 8 /Filter /FlateDecode /Length ${alphaData.length} >>\nstream\n${alphaData.toString("binary")}\nendstream` : undefined,
  };
}

export function parseImage(value: unknown, name: string): PdfImage | null {
  const data = dataUrlToBuffer(value);
  if (!data) return null;
  if (data.mime === "image/png") return parsePng(data.buffer, name);
  if (data.mime === "image/jpeg" || data.mime === "image/jpg") {
    const size = parseJpegSize(data.buffer);
    if (!size) return null;
    return {
      name,
      width: size.width,
      height: size.height,
      object: `<< /Type /XObject /Subtype /Image /Width ${size.width} /Height ${size.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${data.buffer.length} >>\nstream\n${data.buffer.toString("binary")}\nendstream`,
    };
  }
  return null;
}

export async function resolveImageSource(value: unknown, fallback?: string) {
  const source = String(value || fallback || "").trim();
  if (!source) return "";
  if (source.startsWith("data:")) return source;
  if (!/^https?:\/\//i.test(source)) return "";
  try {
    const response = await fetch(source, { cache: "force-cache" });
    if (!response.ok) throw new Error(`Image request failed: ${response.status}`);
    const declaredContentType = response.headers.get("content-type") || "";
    const buffer = Buffer.from(await response.arrayBuffer());
    const contentType = declaredContentType.startsWith("image/") ? declaredContentType : sniffImageMime(buffer) || "image/png";
    return `data:${contentType};base64,${buffer.toString("base64")}`;
  } catch {
    if (fallback && fallback !== source) return resolveImageSource(fallback);
    return "";
  }
}

export class PdfCanvas {
  private commands: string[] = [];

  private y(top: number) {
    return PAGE.height - top;
  }

  color(hex: string) {
    const [r, g, b] = hexToRgb(hex);
    return `${r.toFixed(4)} ${g.toFixed(4)} ${b.toFixed(4)}`;
  }

  rect(x: number, top: number, width: number, height: number, fill?: string, stroke?: string, lineWidth = 1) {
    this.commands.push("q");
    if (fill) this.commands.push(`${this.color(fill)} rg`);
    if (stroke) this.commands.push(`${this.color(stroke)} RG`);
    this.commands.push(`${lineWidth} w`);
    this.commands.push(`${x} ${this.y(top + height)} ${width} ${height} re ${fill && stroke ? "B" : fill ? "f" : "S"}`);
    this.commands.push("Q");
  }

  line(x1: number, top1: number, x2: number, top2: number, color = LINE, lineWidth = 1) {
    this.commands.push("q", `${this.color(color)} RG`, `${lineWidth} w`, `${x1} ${this.y(top1)} m ${x2} ${this.y(top2)} l S`, "Q");
  }

  image(name: string, x: number, top: number, width: number, height: number) {
    this.commands.push("q", `${width} 0 0 ${height} ${x} ${this.y(top + height)} cm`, `/${name} Do`, "Q");
  }

  text(value: unknown, x: number, top: number, options: {
    size?: number;
    font?: FontName;
    color?: string;
    align?: "left" | "right" | "center";
    maxWidth?: number;
    lineHeight?: number;
    maxLines?: number;
  } = {}) {
    const size = options.size || 10;
    const fontKey = options.font === "bold" ? "F2" : options.font === "italic" ? "F3" : "F1";
    const color = options.color || INK;
    const lineHeight = options.lineHeight || size + 4;
    const lines = options.maxWidth ? wrapText(value, size, options.maxWidth, options.maxLines || 4) : [esc(value)];
    lines.forEach((line, index) => {
      let tx = x;
      if (options.align === "right") tx = x - textWidth(line, size);
      if (options.align === "center") tx = x - textWidth(line, size) / 2;
      this.commands.push("BT", `/${fontKey} ${size} Tf`, `${this.color(color)} rg`, `${tx} ${this.y(top + index * lineHeight)} Td`, `(${line}) Tj`, "ET");
    });
    return lines.length * lineHeight;
  }

  pill(label: string, x: number, top: number, width: number, color: string) {
    this.rect(x, top, width, 20, color);
    this.text(label, x + width / 2, top + 13, { size: 8, font: "bold", color: "#ffffff", align: "center" });
  }

  meta(label: string, value: unknown, x: number, top: number, width: number) {
    this.text(label.toUpperCase(), x, top, { size: 6.5, font: "bold", color: MUTED, maxWidth: width });
    this.text(value || "-", x, top + 12, { size: 9, font: "bold", color: INK, maxWidth: width, maxLines: 2, lineHeight: 11 });
  }

  output() {
    return this.commands.join("\n");
  }
}

export function fitImage(image: PdfImage, maxWidth: number, maxHeight: number) {
  const ratio = Math.min(maxWidth / image.width, maxHeight / image.height);
  return { width: image.width * ratio, height: image.height * ratio };
}


/**
 * Serialises finished pages into a PDF file. Each entry of `pageStreams` is one
 * page's content stream (a `PdfCanvas.output()`); every page shares the fonts
 * and may draw any of `images`.
 */
export function buildPdf(pageStreams: string[], images: PdfImage[] = []) {
  const pages = pageStreams.length ? pageStreams : [""];
  const objects: string[] = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "", // page tree, filled in once the page object numbers are known
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Oblique >>",
  ];
  const xObjectRefs: string[] = [];
  for (const image of images) {
    let smaskRef = "";
    if (image.smask) {
      objects.push(image.smask);
      smaskRef = `${objects.length} 0 R`;
    }
    objects.push(image.object.replace("__SMASK__ 0 R", smaskRef || "0 0 R"));
    xObjectRefs.push(`/${image.name} ${objects.length} 0 R`);
  }
  const resources = `<< /Font << /F1 3 0 R /F2 4 0 R /F3 5 0 R >>${xObjectRefs.length ? ` /XObject << ${xObjectRefs.join(" ")} >>` : ""} >>`;
  const pageRefs: string[] = [];
  for (const content of pages) {
    objects.push(`<< /Length ${Buffer.byteLength(content, "binary")} >>\nstream\n${content}\nendstream`);
    const contentRef = objects.length;
    objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE.width} ${PAGE.height}] /Resources ${resources} /Contents ${contentRef} 0 R >>`);
    pageRefs.push(`${objects.length} 0 R`);
  }
  objects[1] = `<< /Type /Pages /Kids [${pageRefs.join(" ")}] /Count ${pageRefs.length} >>`;

  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(pdf, "binary"));
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xref = Buffer.byteLength(pdf, "binary");
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  offsets.slice(1).forEach((offset) => {
    pdf += `${String(offset).padStart(10, "0")} 00000 n \n`;
  });
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(pdf, "binary");
}
