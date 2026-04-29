export interface ParsedFile {
  name: string;
  content: string;
  size: number;
}

const MAX_TEXT_LENGTH = 100_000; // 100K chars max

// Plain-text-like extensions: anything that can be safely read via file.text()
const TEXT_EXTENSIONS = new Set([
  // generic text
  "txt",
  "text",
  "log",
  "rst",
  "tex",
  // tabular
  "csv",
  "tsv",
  // markup / data
  "md",
  "markdown",
  "json",
  "jsonl",
  "ndjson",
  "yml",
  "yaml",
  "toml",
  "ini",
  "conf",
  "cfg",
  "properties",
  "env",
  "html",
  "htm",
  "xml",
  "svg",
  "rss",
  "atom",
  // stylesheets
  "css",
  "scss",
  "sass",
  "less",
  // scripts / source
  "js",
  "mjs",
  "cjs",
  "jsx",
  "ts",
  "tsx",
  "vue",
  "svelte",
  "py",
  "rb",
  "php",
  "java",
  "kt",
  "kts",
  "scala",
  "groovy",
  "c",
  "h",
  "cpp",
  "cc",
  "cxx",
  "hpp",
  "hh",
  "hxx",
  "cs",
  "go",
  "rs",
  "swift",
  "m",
  "mm",
  "sh",
  "bash",
  "zsh",
  "fish",
  "ps1",
  "bat",
  "cmd",
  "sql",
  "graphql",
  "gql",
  "proto",
  "lua",
  "pl",
  "pm",
  "r",
  "jl",
  "dart",
  "ex",
  "exs",
  "erl",
  "hs",
  "elm",
  "clj",
  // misc
  "srt",
  "vtt",
  "diff",
  "patch",
  "dockerfile",
  "makefile",
]);

const IMAGE_EXTENSIONS = new Set([
  "png",
  "jpg",
  "jpeg",
  "webp",
  "gif",
  "bmp",
  "heic",
  "heif",
]);

const BINARY_DOC_EXTENSIONS = new Set(["pdf", "docx", "xlsx", "xls", "pptx"]);

function getExt(filename: string): string {
  return filename.split(".").pop()?.toLowerCase() || "";
}

export function isImageFile(filename: string): boolean {
  return IMAGE_EXTENSIONS.has(getExt(filename));
}

export function isSupportedFileType(filename: string): boolean {
  const ext = getExt(filename);
  return (
    TEXT_EXTENSIONS.has(ext) ||
    BINARY_DOC_EXTENSIONS.has(ext) ||
    IMAGE_EXTENSIONS.has(ext)
  );
}

export function getAcceptString(): string {
  const exts = [
    ...TEXT_EXTENSIONS,
    ...BINARY_DOC_EXTENSIONS,
    ...IMAGE_EXTENSIONS,
  ];
  return exts.map((e) => "." + e).join(",");
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

  if (
    typeof window !== "undefined" &&
    !pdfjsLib.GlobalWorkerOptions.workerSrc
  ) {
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

async function parsePptxFile(file: File): Promise<string> {
  const JSZip = (await import("jszip")).default;
  const buffer = await file.arrayBuffer();
  const zip = await JSZip.loadAsync(buffer);

  // Slide files live at ppt/slides/slideN.xml; sort numerically.
  const slideFiles = Object.keys(zip.files)
    .filter((p) => /^ppt\/slides\/slide\d+\.xml$/.test(p))
    .sort((a, b) => {
      const na = parseInt(a.match(/slide(\d+)\.xml$/)![1], 10);
      const nb = parseInt(b.match(/slide(\d+)\.xml$/)![1], 10);
      return na - nb;
    });

  const parts: string[] = [];
  for (let i = 0; i < slideFiles.length; i++) {
    const xml = await zip.files[slideFiles[i]].async("string");
    // Extract text from <a:t>...</a:t> nodes; join with spaces, dedupe whitespace.
    const matches = xml.match(/<a:t[^>]*>([\s\S]*?)<\/a:t>/g) || [];
    const text = matches
      .map((m) => m.replace(/<a:t[^>]*>|<\/a:t>/g, ""))
      .map((s) =>
        s
          .replace(/&amp;/g, "&")
          .replace(/&lt;/g, "<")
          .replace(/&gt;/g, ">")
          .replace(/&quot;/g, '"')
          .replace(/&apos;/g, "'"),
      )
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();
    if (text) parts.push(`[Slide ${i + 1}]\n${text}`);
  }

  return parts.join("\n\n");
}

export async function parseFile(file: File): Promise<ParsedFile> {
  const ext = getExt(file.name);
  let content: string;

  if (ext === "doc") {
    throw new Error("旧版 .doc 文件不受支持，请另存为 .docx 后再上传");
  }

  if (IMAGE_EXTENSIONS.has(ext)) {
    throw new Error(
      "图片请通过图片上传按钮（或视觉模型）发送，文本解析无法处理图像",
    );
  }

  if (TEXT_EXTENSIONS.has(ext) || ext === "") {
    content = await file.text();
  } else if (ext === "xlsx" || ext === "xls") {
    content = await parseExcelFile(file);
  } else if (ext === "pdf") {
    content = await parsePdfFile(file);
  } else if (ext === "docx") {
    content = await parseWordFile(file);
  } else if (ext === "pptx") {
    content = await parsePptxFile(file);
  } else {
    // Unknown extension: best-effort text read, may yield garbage for binary.
    content = await file.text();
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
