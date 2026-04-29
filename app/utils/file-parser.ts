export interface ParsedFile {
  name: string;
  content: string;
  size: number;
}

const MAX_TEXT_LENGTH = 100_000; // 100K chars max

function parseCsvText(text: string): string {
  return text.trim();
}

async function parseExcelFile(file: File): Promise<string> {
  const XLSX = await import("xlsx");
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: "array" });
  const parts: string[] = [];

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    const csv = XLSX.utils.sheet_to_csv(sheet);
    if (csv.trim()) {
      parts.push(`[Sheet: ${sheetName}]\n${csv}`);
    }
  }

  return parts.join("\n\n");
}

async function parsePdfFile(file: File): Promise<string> {
  const pdfjsLib = await import("pdfjs-dist");

  if (typeof window !== "undefined" && !pdfjsLib.GlobalWorkerOptions.workerSrc) {
    const v = pdfjsLib.version;
    pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${v}/pdf.worker.min.mjs`;
  }

  const buffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: buffer }).promise;
  const parts: string[] = [];

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const textContent = await page.getTextContent();
    const pageText = textContent.items
      .map((item: any) => item.str)
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();
    if (pageText) {
      parts.push(`[Page ${i}]\n${pageText}`);
    }
  }

  return parts.join("\n\n");
}

async function parseWordFile(file: File): Promise<string> {
  const mammoth = await import("mammoth");
  const buffer = await file.arrayBuffer();
  const result = await mammoth.extractRawText({ arrayBuffer: buffer });
  return result.value;
}

export async function parseFile(file: File): Promise<ParsedFile> {
  const ext = file.name.split(".").pop()?.toLowerCase() || "";
  let content: string;

  switch (ext) {
    case "csv":
    case "tsv":
    case "txt":
    case "text":
      content = await file.text();
      if (ext === "csv" || ext === "tsv") {
        content = parseCsvText(content);
      }
      break;

    case "xlsx":
    case "xls":
      content = await parseExcelFile(file);
      break;

    case "pdf":
      content = await parsePdfFile(file);
      break;

    case "docx":
      content = await parseWordFile(file);
      break;

    default:
      content = await file.text();
      break;
  }

  if (content.length > MAX_TEXT_LENGTH) {
    content =
      content.slice(0, MAX_TEXT_LENGTH) + "\n\n[... 文件内容过长，已截断 ...]";
  }

  return { name: file.name, content, size: file.size };
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function isSupportedFileType(filename: string): boolean {
  const ext = filename.split(".").pop()?.toLowerCase() || "";
  return [
    "csv",
    "tsv",
    "txt",
    "text",
    "xlsx",
    "xls",
    "pdf",
    "docx",
  ].includes(ext);
}
