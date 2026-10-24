import ExcelJS from "exceljs";
import mammoth from "mammoth";
import { extractText, getDocumentProxy } from "unpdf";

import type { DocFormat, ReadMethod } from "@/lib/domain/types";

/**
 * Attachment readers. Each turns bytes into plain lines in one shared shape:
 * "Label: value" with continuation lines indented, so a single extractor
 * serves plain text, spreadsheets, Word tables and PDF text alike.
 */

export interface RawReading {
  format: DocFormat;
  lines: string[];
  sheetNames: string[];
  method: ReadMethod | null;
  /** The file has no text layer (a scan): only vision can read it. */
  imageOnly: boolean;
  error: string | null;
}

export function detectFormat(bytes: Uint8Array, fileName: string): DocFormat {
  const head = String.fromCharCode(...bytes.slice(0, 5));
  const extension = fileName.toLowerCase().split(".").pop() ?? "";
  if (head.startsWith("%PDF")) return "pdf";
  if (head.startsWith("PK")) {
    if (extension === "xlsx" || extension === "xlsm") return "xlsx";
    if (extension === "docx") return "docx";
    // An Office zip with a misleading name: look for the part folders.
    const sample = new TextDecoder("latin1").decode(bytes.slice(0, 4000));
    if (sample.includes("xl/")) return "xlsx";
    if (sample.includes("word/")) return "docx";
    return "unknown";
  }
  if (extension === "pdf") return "pdf"; // claims PDF but has no PDF header
  if (extension === "docx") return "docx";
  if (extension === "xlsx") return "xlsx";
  return looksLikeText(bytes) ? "txt" : "unknown";
}

function looksLikeText(bytes: Uint8Array): boolean {
  const sample = bytes.slice(0, 2000);
  if (sample.length === 0) return true;
  let control = 0;
  for (const byte of sample) {
    if (byte === 0) return false;
    if (byte < 9 || (byte > 13 && byte < 32)) control += 1;
  }
  return control / sample.length < 0.02;
}

function splitLines(text: string): string[] {
  return text.replace(/\r\n?/g, "\n").split("\n");
}

async function readPdf(bytes: Uint8Array): Promise<RawReading> {
  try {
    const pdf = await getDocumentProxy(new Uint8Array(bytes));
    const { text } = await extractText(pdf, { mergePages: true });
    const lines = splitLines(text);
    const meaningful = lines.join(" ").replace(/\s+/g, "");
    return {
      format: "pdf",
      lines,
      sheetNames: [],
      method: "pdf-text",
      // No text layer (or only a watermark): a scanned page.
      imageOnly: meaningful.length < 40,
      error: null,
    };
  } catch (error) {
    return {
      format: "pdf",
      lines: [],
      sheetNames: [],
      method: null,
      imageOnly: false,
      error: `PDF could not be opened: ${errorMessage(error)}`,
    };
  }
}

/** Minimal HTML-to-lines for mammoth output: table rows become "a: b". */
function htmlToLines(html: string): string[] {
  const decode = (text: string) =>
    text
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<[^>]+>/g, "")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&nbsp;/g, " ");
  const lines: string[] = [];
  const blocks = html.split(/(<table[\s\S]*?<\/table>)/i);
  for (const block of blocks) {
    if (/^<table/i.test(block)) {
      for (const row of block.match(/<tr[\s\S]*?<\/tr>/gi) ?? []) {
        const cells = (row.match(/<t[dh][\s\S]*?<\/t[dh]>/gi) ?? []).map((cell) =>
          decode(cell.replace(/<\/p>\s*<p>/gi, "\n")).trim(),
        );
        lines.push(...cellsToLines(cells));
      }
    } else {
      for (const paragraph of block.split(/<\/(?:p|h\d|li)>/i)) {
        const text = decode(paragraph).trim();
        if (text !== "") lines.push(...text.split("\n"));
      }
    }
  }
  return lines;
}

/**
 * One table row -> lines. Two cells read as "label: value" with the value's
 * extra lines indented; wider rows (a container table) are joined by spaces.
 */
function cellsToLines(cells: string[]): string[] {
  const filled = cells.filter((cell) => cell !== "");
  if (filled.length === 0) return [];
  if (filled.length === 2) {
    const [label, value] = filled as [string, string];
    const valueLines = value.split("\n");
    return [
      `${label.replace(/\n/g, " ")}: ${valueLines[0] ?? ""}`,
      ...valueLines.slice(1).map((line) => `  ${line}`),
    ];
  }
  return [filled.map((cell) => cell.replace(/\n/g, " ")).join("   ")];
}

async function readDocx(bytes: Uint8Array): Promise<RawReading> {
  try {
    const { value } = await mammoth.convertToHtml({ buffer: Buffer.from(bytes) });
    return {
      format: "docx",
      lines: htmlToLines(value),
      sheetNames: [],
      method: "docx",
      imageOnly: false,
      error: null,
    };
  } catch (error) {
    return {
      format: "docx",
      lines: [],
      sheetNames: [],
      method: null,
      imageOnly: false,
      error: `Word document could not be opened: ${errorMessage(error)}`,
    };
  }
}

function cellText(value: ExcelJS.CellValue): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "object") {
    if (value instanceof Date) return value.toISOString().slice(0, 10);
    if ("richText" in value) return value.richText.map((part) => part.text).join("");
    if ("result" in value) return cellText(value.result as ExcelJS.CellValue);
    if ("text" in value) return String(value.text);
    return "";
  }
  return String(value);
}

async function readXlsx(bytes: Uint8Array): Promise<RawReading> {
  try {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(Buffer.from(bytes) as unknown as ArrayBuffer);
    const lines: string[] = [];
    const sheetNames: string[] = [];
    for (const sheet of workbook.worksheets) {
      sheetNames.push(sheet.name);
      sheet.eachRow((row) => {
        const values = Array.isArray(row.values) ? row.values.slice(1) : [];
        const cells = values.map((value) => cellText(value as ExcelJS.CellValue).trim());
        lines.push(...cellsToLines(cells));
      });
    }
    return { format: "xlsx", lines, sheetNames, method: "xlsx", imageOnly: false, error: null };
  } catch (error) {
    return {
      format: "xlsx",
      lines: [],
      sheetNames: [],
      method: null,
      imageOnly: false,
      error: `Spreadsheet could not be opened: ${errorMessage(error)}`,
    };
  }
}

export async function readAttachment(
  bytes: Uint8Array,
  fileName: string,
): Promise<RawReading> {
  const format = detectFormat(bytes, fileName);
  switch (format) {
    case "pdf":
      return readPdf(bytes);
    case "docx":
      return readDocx(bytes);
    case "xlsx":
      return readXlsx(bytes);
    case "txt":
      return {
        format,
        lines: splitLines(new TextDecoder("utf-8").decode(bytes)),
        sheetNames: [],
        method: "text",
        imageOnly: false,
        error: null,
      };
    case "unknown":
      return {
        format,
        lines: [],
        sheetNames: [],
        method: null,
        imageOnly: false,
        error: "Unsupported or corrupt file format",
      };
  }
}

export function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}
