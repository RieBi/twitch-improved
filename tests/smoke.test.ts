import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const workspaceRoot = resolve(import.meta.dirname, "..");

describe("milestone 1 scaffold", () => {
  it("keeps required entrypoint files in place", async () => {
    const paths = [
      "entrypoints/background.ts",
      "entrypoints/content/index.ts",
      "entrypoints/options/index.html",
      "entrypoints/options/main.tsx"
    ];

    await Promise.all(
      paths.map(async (relativePath) => {
        const content = await readFile(resolve(workspaceRoot, relativePath), "utf8");
        expect(content.length).toBeGreaterThan(0);
      })
    );
  });

  it("renders the options section shell contract", async () => {
    const optionsSource = await readFile(
      resolve(workspaceRoot, "entrypoints/options/main.tsx"),
      "utf8"
    );

    expect(optionsSource).toContain("Declutter");
    expect(optionsSource).toContain("Watch heatmap");
    expect(optionsSource).toContain("Data");
  });
});
