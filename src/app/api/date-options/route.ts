import { readdir } from "node:fs/promises";
import path from "node:path";

const IMAGE_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".webp", ".gif", ".avif"]);

function toTitleCaseFromFileName(fileName: string): string {
  const base = fileName.replace(/\.[^.]+$/, "");
  const normalized = base.replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();
  if (!normalized) return "";
  return normalized
    .split(" ")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

export async function GET() {
  const absoluteDir = path.join(process.cwd(), "public", "date-options");
  try {
    const entries = await readdir(absoluteDir, { withFileTypes: true });
    const options = entries
      .filter((entry) => entry.isFile())
      .filter((entry) => IMAGE_EXTENSIONS.has(path.extname(entry.name).toLowerCase()))
      .map((entry) => ({
        name: toTitleCaseFromFileName(entry.name),
        image_url: `/date-options/${entry.name}`,
      }))
      .filter((option) => option.name && option.image_url)
      .sort((a, b) => a.name.localeCompare(b.name));

    return Response.json({ options });
  } catch {
    return Response.json({ options: [] });
  }
}
