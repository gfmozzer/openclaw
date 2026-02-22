import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

type ThemeVars = {
  "--bg": string;
  "--text": string;
  "--text-strong": string;
  "--muted": string;
  "--accent": string;
  "--card": string;
  "--card-foreground": string;
};

function parseVars(block: string): Partial<ThemeVars> {
  const out: Record<string, string> = {};
  const lineRe = /(--[a-z-]+)\s*:\s*([^;]+);/g;
  for (const match of block.matchAll(lineRe)) {
    out[match[1]] = match[2].trim();
  }
  return out as Partial<ThemeVars>;
}

function hexToRgb(hex: string): [number, number, number] {
  const value = hex.trim().toLowerCase();
  const normalized = value.startsWith("#") ? value.slice(1) : value;
  const full =
    normalized.length === 3
      ? normalized
          .split("")
          .map((ch) => `${ch}${ch}`)
          .join("")
      : normalized;
  if (!/^[0-9a-f]{6}$/.test(full)) {
    throw new Error(`expected hex color, got "${hex}"`);
  }
  return [
    Number.parseInt(full.slice(0, 2), 16),
    Number.parseInt(full.slice(2, 4), 16),
    Number.parseInt(full.slice(4, 6), 16),
  ];
}

function srgbToLinear(channel: number): number {
  const c = channel / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function luminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex);
  const rl = srgbToLinear(r);
  const gl = srgbToLinear(g);
  const bl = srgbToLinear(b);
  return 0.2126 * rl + 0.7152 * gl + 0.0722 * bl;
}

function contrastRatio(fg: string, bg: string): number {
  const l1 = luminance(fg);
  const l2 = luminance(bg);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

function expectVar(vars: Partial<ThemeVars>, key: keyof ThemeVars): string {
  const value = vars[key];
  expect(value, `missing CSS var ${key}`).toBeTruthy();
  return value as string;
}

describe("theme contrast", () => {
  it("keeps minimum contrast for key black/green theme tokens", async () => {
    const cssPath = path.join(process.cwd(), "ui", "src", "styles", "base.css");
    const css = await readFile(cssPath, "utf8");

    const darkRootMatch = css.match(/:root\s*\{([\s\S]*?)\n\}/);
    const lightRootMatch = css.match(/:root\[data-theme="light"\]\s*\{([\s\S]*?)\n\}/);
    expect(darkRootMatch?.[1]).toBeTruthy();
    expect(lightRootMatch?.[1]).toBeTruthy();

    const dark = parseVars(darkRootMatch?.[1] ?? "");
    const light = parseVars(lightRootMatch?.[1] ?? "");

    const darkBg = expectVar(dark, "--bg");
    const darkText = expectVar(dark, "--text");
    const darkTextStrong = expectVar(dark, "--text-strong");
    const darkMuted = expectVar(dark, "--muted");
    const darkCard = expectVar(dark, "--card");
    const darkCardFg = expectVar(dark, "--card-foreground");
    const darkAccent = expectVar(dark, "--accent");

    const lightBg = expectVar(light, "--bg");
    const lightText = expectVar(light, "--text");
    const lightTextStrong = expectVar(light, "--text-strong");
    const lightMuted = expectVar(light, "--muted");
    const lightCard = expectVar(light, "--card");
    const lightCardFg = expectVar(light, "--card-foreground");
    const lightAccent = expectVar(light, "--accent");

    expect(contrastRatio(darkText, darkBg)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(darkTextStrong, darkBg)).toBeGreaterThanOrEqual(7);
    expect(contrastRatio(darkCardFg, darkCard)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(darkMuted, darkBg)).toBeGreaterThanOrEqual(3);
    expect(contrastRatio(darkAccent, darkBg)).toBeGreaterThanOrEqual(3);

    expect(contrastRatio(lightText, lightBg)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(lightTextStrong, lightBg)).toBeGreaterThanOrEqual(7);
    expect(contrastRatio(lightCardFg, lightCard)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(lightMuted, lightBg)).toBeGreaterThanOrEqual(3);
    expect(contrastRatio(lightAccent, lightBg)).toBeGreaterThanOrEqual(3);
  });
});
