/// <reference types="@figma/plugin-typings" />

// This file holds the main code for plugins. Code in this file has access to
// the *figma document* via the figma global object.

const PLUGIN_VERSION = "0.1.0";

// --- Types ---
type RawCollection = {
  id: string;
  name: string;
  modes: Array<{ id: string; name: string }>;
  variables: Array<{
    id: string;
    name: string;
    resolvedType: string;
    valuesPerMode: Record<
      string,
      { value: VariableValue; isAlias: boolean }
    >;
  }>;
};

type TokenValueRaw =
  | { rgba: [number, number, number, number]; hex: string }
  | { value: number }
  | { $ref: string };

type TokensRaw = {
  color: Record<string, Record<string, TokenValueRaw>>;
  spacing: Record<string, Record<string, TokenValueRaw>>;
  radius: Record<string, Record<string, TokenValueRaw>>;
};

type TokenValueResolvedColor = string | null;
type TokenValueResolvedFloat = { value: number } | null;
type TokensResolved = {
  color: Record<string, Record<string, TokenValueResolvedColor>>;
  spacing: Record<string, Record<string, TokenValueResolvedFloat>>;
  radius: Record<string, Record<string, TokenValueResolvedFloat>>;
};

// Convert normalized rgba [0..1] to hex string
function rgbaToHex(r: number, g: number, b: number, a: number): string {
  const pad = (n: number) => ("0" + n.toString(16)).slice(-2);
  const R = pad(Math.round(r * 255));
  const G = pad(Math.round(g * 255));
  const B = pad(Math.round(b * 255));
  if (a >= 1) return `#${R}${G}${B}`;
  return `#${R}${G}${B}${pad(Math.round(a * 255))}`;
}

// 1) Normalize variable name to token path: "Accent/Primary/100" -> "accent.primary.100"
function nameToTokenPath(name: string): string {
  const segments = name.split("/").map((seg) =>
    seg.trim().toLowerCase().replace(/\s+/g, "-")
  );
  return segments.filter(Boolean).join(".");
}

// 2) Get target variable ID from alias value
function getAliasVariableId(value: VariableValue): string | null {
  if (
    typeof value === "object" &&
    value !== null &&
    "type" in value &&
    (value as VariableAlias).type === "VARIABLE_ALIAS" &&
    "id" in value
  ) {
    return (value as VariableAlias).id;
  }
  return null;
}

const isVariableAlias = (
  value: VariableValue
): value is VariableAlias => {
  return (
    typeof value === 'object' &&
    value !== null &&
    'type' in value &&
    (value as VariableAlias).type === 'VARIABLE_ALIAS'
  );
};

async function detectTargetPlatforms(): Promise<{ web: boolean; mobile: boolean }> {
  let hasWeb = false;
  let hasMobile = false;
  for (const page of figma.root.children) {
    await page.loadAsync();
    for (const node of page.children) {
      if (node.type === "FRAME") {
        const w = (node as FrameNode).width;
        if (w >= 320 && w <= 430) hasMobile = true;
        if (w >= 768) hasWeb = true;
      }
    }
  }
  // Fallback: default to web if no matching frames found
  if (!hasWeb && !hasMobile) hasWeb = true;
  return { web: hasWeb, mobile: hasMobile };
}

async function logLocalVariableCollections(): Promise<RawCollection[]> {
  const collections = await figma.variables.getLocalVariableCollectionsAsync();

  const output = await Promise.all(
    collections.map(async (collection) => {
      const modes = collection.modes.map((mode) => ({
        id: mode.modeId,
        name: mode.name,
      }));

      const variables = await Promise.all(
        collection.variableIds.map(async (variableId) => {
          const variable = await figma.variables.getVariableByIdAsync(variableId);
          if (!variable) return null;

          const valuesPerMode: Record<
            string,
            { value: VariableValue; isAlias: boolean }
          > = {};

          const valuesByMode = variable.valuesByMode;
          for (const modeId of Object.keys(valuesByMode)) {
            const value = valuesByMode[modeId];
            valuesPerMode[modeId] = {
              value,
              isAlias: isVariableAlias(value),
            };
          }

          return {
            id: variable.id,
            name: variable.name,
            resolvedType: variable.resolvedType,
            valuesPerMode,
          };
        })
      );

      return {
        id: collection.id,
        name: collection.name,
        modes,
        variables: variables.filter((x): x is NonNullable<typeof x> => Boolean(x)),
      };
    })
  );

  return output;
}

// 3) Build raw token value for a mode
function buildTokenValueRaw(
  value: VariableValue,
  isAlias: boolean,
  varIdToTokenPath: Record<string, string>,
  resolvedType: string
): TokenValueRaw | null {
  if (isAlias) {
    const targetId = getAliasVariableId(value);
    const tokenPath = targetId ? varIdToTokenPath[targetId] : null;
    if (tokenPath) return { $ref: tokenPath };
    return null;
  }
  if (resolvedType === "COLOR" && typeof value === "object" && value !== null && "r" in value) {
    const c = value as RGBA;
    const r = c.r;
    const g = c.g;
    const b = c.b;
    const a = c.a ?? 1;
    return { rgba: [r, g, b, a], hex: rgbaToHex(r, g, b, a) };
  }
  if (resolvedType === "FLOAT" && typeof value === "number") {
    return { value };
  }
  return null;
}

// Get value for a mode from a token entry, with single-mode fallback
function getValueForMode(
  tokenEntry: Record<string, TokenValueRaw>,
  requestedModeName: string
): TokenValueRaw | null {
  if (tokenEntry[requestedModeName]) return tokenEntry[requestedModeName];
  const modeKeys = Object.keys(tokenEntry);
  if (modeKeys.length === 1) return tokenEntry[modeKeys[0]];
  return null;
}

// 4) Resolve $ref chain for a single token mode value (returns resolved value or null)
function resolveRef(
  tokenPath: string,
  requestedModeName: string,
  tokensRaw: TokensRaw,
  bucket: keyof TokensRaw,
  visited: Set<string>,
  chain: string[],
  errors: Array<{ tokenPath: string; requestedModeName: string; reason: string; chain: string[] }>
): { rgba: [number, number, number, number] } | { value: number } | null {
  const pathKey = `${bucket}:${tokenPath}:${requestedModeName}`;
  if (visited.has(pathKey)) {
    errors.push({
      tokenPath,
      requestedModeName,
      reason: "cycle",
      chain: [...chain, tokenPath],
    });
    return null;
  }
  visited.add(pathKey);
  chain.push(tokenPath);

  const bucketTokens = tokensRaw[bucket];
  const tokenEntry = bucketTokens?.[tokenPath];
  if (!tokenEntry) {
    errors.push({
      tokenPath,
      requestedModeName,
      reason: "missing token",
      chain: [...chain],
    });
    visited.delete(pathKey);
    chain.pop();
    return null;
  }

  const modeValues = getValueForMode(tokenEntry, requestedModeName);
  if (!modeValues) {
    errors.push({
      tokenPath,
      requestedModeName,
      reason: "mode mismatch",
      chain: [...chain],
    });
    visited.delete(pathKey);
    chain.pop();
    return null;
  }

  if ("$ref" in modeValues) {
    const refPath = modeValues.$ref;
    if (!bucketTokens![refPath]) {
      errors.push({
        tokenPath,
        requestedModeName,
        reason: "missing token",
        chain: [...chain, refPath],
      });
      visited.delete(pathKey);
      chain.pop();
      return null;
    }
    const resolved = resolveRef(
      refPath,
      requestedModeName,
      tokensRaw,
      bucket,
      visited,
      chain,
      errors
    );
    visited.delete(pathKey);
    chain.pop();
    return resolved;
  }

  if ("rgba" in modeValues) {
    visited.delete(pathKey);
    chain.pop();
    return { rgba: modeValues.rgba };
  }
  if ("value" in modeValues) {
    visited.delete(pathKey);
    chain.pop();
    return { value: modeValues.value };
  }
  visited.delete(pathKey);
  chain.pop();
  return null;
}

// Build the full export model from raw collections
function buildExportModel(collections: RawCollection[]): Record<string, unknown> {

  // 1) Build varId -> tokenPath lookup
  const varIdToTokenPath: Record<string, string> = {};
  for (const col of collections) {
    for (const v of col.variables) {
      varIdToTokenPath[v.id] = nameToTokenPath(v.name);
    }
  }

  // 2) Build tokensRaw grouped by type, with collision detection per bucket
  const tokensRaw: TokensRaw = { color: {}, spacing: {}, radius: {} };
  type Bucket = "color" | "spacing" | "radius";
  const tokenPathToFirst: Record<Bucket, Record<string, { varId: string; originalName: string; collectionName: string }>> = {
    color: {},
    spacing: {},
    radius: {},
  };
  type DuplicateError = {
    type: "DuplicateTokenPath";
    tokenPath: string;
    bucket: Bucket;
    existingVarId: string;
    newVarId: string;
    existingOriginalName: string;
    newOriginalName: string;
    existingCollectionName: string;
    newCollectionName: string;
    suggestion: string;
  };
  const duplicateErrors: DuplicateError[] = [];

  const checkCollisionAndAdd = (
    bucket: Bucket,
    tokenPath: string,
    varId: string,
    originalName: string,
    collectionName: string
  ): boolean => {
    const map = tokenPathToFirst[bucket];
    const existing = map[tokenPath];
    if (existing && existing.varId !== varId) {
      duplicateErrors.push({
        type: "DuplicateTokenPath",
        tokenPath,
        bucket,
        existingVarId: existing.varId,
        newVarId: varId,
        existingOriginalName: existing.originalName,
        newOriginalName: originalName,
        existingCollectionName: existing.collectionName,
        newCollectionName: collectionName,
        suggestion: "Rename one of the variables or move them into the same collection.",
      });
      return false;
    }
    if (!existing) map[tokenPath] = { varId, originalName, collectionName };
    return true;
  };

  for (const col of collections) {
    const modeIdToName: Record<string, string> = {};
    for (const m of col.modes) modeIdToName[m.id] = m.name;
    const getOutputModeKey = (modeName: string) =>
      col.modes.length === 1 && col.modes[0].name === "Mode 1" && modeName === "Mode 1"
        ? "default"
        : modeName;

    for (const v of col.variables) {
      const tokenPath = varIdToTokenPath[v.id];
      const nameLower = v.name.toLowerCase();

      if (v.resolvedType === "COLOR") {
        if (!checkCollisionAndAdd("color", tokenPath, v.id, v.name, col.name)) continue;
        tokensRaw.color[tokenPath] = {};
        for (const modeId of Object.keys(v.valuesPerMode)) {
          const { value, isAlias } = v.valuesPerMode[modeId];
          const modeName = modeIdToName[modeId] ?? modeId;
          const outputKey = getOutputModeKey(modeName);
          const tv = buildTokenValueRaw(value, isAlias, varIdToTokenPath, v.resolvedType);
          if (tv) tokensRaw.color[tokenPath][outputKey] = tv;
        }
      } else if (v.resolvedType === "FLOAT") {
        const colNameLower = col.name.toLowerCase();
        let toSpacing: boolean;
        let toRadius: boolean;
        if (colNameLower.includes("spacing")) {
          toSpacing = true;
          toRadius = false;
        } else if (colNameLower.includes("radius")) {
          toSpacing = false;
          toRadius = true;
        } else {
          toSpacing = nameLower.includes("spacing");
          toRadius = nameLower.includes("radius");
        }
        if (toSpacing) {
          if (!checkCollisionAndAdd("spacing", tokenPath, v.id, v.name, col.name)) continue;
          tokensRaw.spacing[tokenPath] = {};
          for (const modeId of Object.keys(v.valuesPerMode)) {
            const { value, isAlias } = v.valuesPerMode[modeId];
            const modeName = modeIdToName[modeId] ?? modeId;
            const outputKey = getOutputModeKey(modeName);
            const tv = buildTokenValueRaw(value, isAlias, varIdToTokenPath, v.resolvedType);
            if (tv) tokensRaw.spacing[tokenPath][outputKey] = tv;
          }
        } else if (toRadius) {
          if (!checkCollisionAndAdd("radius", tokenPath, v.id, v.name, col.name)) continue;
          tokensRaw.radius[tokenPath] = {};
          for (const modeId of Object.keys(v.valuesPerMode)) {
            const { value, isAlias } = v.valuesPerMode[modeId];
            const modeName = modeIdToName[modeId] ?? modeId;
            const outputKey = getOutputModeKey(modeName);
            const tv = buildTokenValueRaw(value, isAlias, varIdToTokenPath, v.resolvedType);
            if (tv) tokensRaw.radius[tokenPath][outputKey] = tv;
          }
        }
      }
    }
  }

  // 4) Build tokensResolved
  const tokensResolved: TokensResolved = { color: {}, spacing: {}, radius: {} };
  type ResolutionError = { tokenPath: string; requestedModeName: string; reason: string; chain: string[] };
  const resolutionErrors: ResolutionError[] = [];

  for (const bucket of ["color", "spacing", "radius"] as const) {
    const raw = tokensRaw[bucket];
    const res = tokensResolved[bucket];
    for (const tokenPath of Object.keys(raw).sort()) {
      res[tokenPath] = {};
      const modeNames = Object.keys(raw[tokenPath]).sort();
      for (const modeName of modeNames) {
        const visited = new Set<string>();
        const resolved = resolveRef(
          tokenPath,
          modeName,
          tokensRaw,
          bucket,
          visited,
          [],
          resolutionErrors
        );
        if (bucket === "color") {
          const rgba = resolved && "rgba" in resolved ? resolved.rgba : null;
          (res as Record<string, Record<string, string | null>>)[tokenPath][modeName] =
            rgba ? rgbaToHex(rgba[0], rgba[1], rgba[2], rgba[3] ?? 1) : null;
        } else {
          (res as Record<string, Record<string, { value: number } | null>>)[tokenPath][modeName] =
            resolved as { value: number } | null;
        }
      }
    }
  }

  // 5) Final output (deterministic: sort keys)
  const collectionsOut = collections.map((c) => ({
    id: c.id,
    name: c.name,
    modes: [...c.modes].sort((a, b) => a.id.localeCompare(b.id)),
  }));

  return {
    meta: {
      exportedAt: new Date().toISOString(),
      pluginVersion: PLUGIN_VERSION,
    },
    collections: collectionsOut,
    tokensRaw: sortObjectKeys(tokensRaw),
    tokensResolved: sortObjectKeys(tokensResolved),
    errors: [...duplicateErrors, ...resolutionErrors],
  };
}

type PluginExportSettings = {
  targets: { web: boolean; ios: boolean; android: boolean };
  mobileFramework: "react-native" | "swift" | "kotlin";
};

const DEFAULT_SETTINGS: PluginExportSettings = {
  targets: { web: true, ios: false, android: false },
  mobileFramework: "react-native",
};

function hasUiVsRawColorSplit(exportJson: Record<string, unknown>): boolean {
  const tr = exportJson.tokensResolved as Record<string, Record<string, unknown>> | undefined;
  const color = tr?.color as Record<string, unknown> | undefined;
  if (!color || typeof color !== "object") return false;
  const keys = Object.keys(color);
  const uiPattern = /^(surface|text|button|pill|border|background|foreground)[.-]|^surface$|^text$|^button$|^pill$|^border$|^background$|^foreground$/i;
  const rawPattern = /accent|palette|primary\.\d|secondary\.\d|blue|red|green|gray|grey|lime|orange|\.[0-9]{2,}$/i;
  let hasUi = false;
  let hasRaw = false;
  for (const k of keys) {
    const lower = k.toLowerCase();
    if (uiPattern.test(lower) || /\b(surface|text|button|pill|border)\b/.test(lower)) hasUi = true;
    if (rawPattern.test(lower) || /\.(100|200|300|400|500|600|700|800|900)$/.test(k)) hasRaw = true;
    if (hasUi && hasRaw) return true;
  }
  return false;
}

function generateCursorPrompt(exportJson: Record<string, unknown>, settings: PluginExportSettings): string {
  const lines: string[] = [];
  const web = settings.targets.web;
  const colorTabs = web && hasUiVsRawColorSplit(exportJson);
  // Compute unique font families from tokensResolved.font for layout.tsx instructions
  const tokensResolved = exportJson.tokensResolved as Record<string, Record<string, Record<string, string | null>>> | undefined;
  const fontTokens: Record<string, Record<string, string | null>> = (tokensResolved && tokensResolved.font) || {};
  const uniqueFontFamilies: string[] = [...new Set(
    Object.values(fontTokens)
      .flatMap((modeMap) => Object.values(modeMap || {}).filter((v): v is string => typeof v === "string" && !!v))
  )];
  const fontSlug = (name: string) => name.toLowerCase().replace(/\s+/g, "-");
  const uniqueFontsList = uniqueFontFamilies.length
    ? uniqueFontFamilies.map((f) => `${f} (variable: --font-${fontSlug(f)})`).join(", ")
    : "(none detected — check exportJson.tokensResolved.font)";
  const mobile = settings.targets.ios || settings.targets.android;
  const rn = settings.mobileFramework === "react-native";
  const nativeSoon = settings.mobileFramework === "swift" || settings.mobileFramework === "kotlin";

  lines.push("Target: Next.js + Tailwind" + (mobile && rn ? " + React Native" : mobile && nativeSoon ? " (mobile coming soon)" : "") + ".");
  lines.push("");
  lines.push("STRICT RULES");
  lines.push("- Do not rename any token keys.");
  lines.push("- Do not drop or merge tokens.");
  lines.push("- Do not \"prettify\" token names (no camelCase conversions).");
  lines.push("- Update the existing global stylesheet that is imported by app/layout.tsx. Do not create a second globals file.");
  lines.push("- If app/layout.tsx imports \"./globals.css\", the correct file is app/globals.css (not styles/globals.css).");
  lines.push("- Ensure tailwind.config.ts content includes \"./app/**/*.{js,ts,jsx,tsx,mdx}\".");
  lines.push("");
  lines.push("Use exportJson.tokensResolved as source of truth for final values.");
  lines.push("Aliases are in exportJson.tokensRaw (optional).");
  lines.push("");
  if (web) {
    lines.push("Web theming rules:");
    lines.push("- Tailwind darkMode is \"class\".");
    lines.push("- :root contains Light values where available, otherwise default.");
    lines.push("- .dark overrides variables using Dark values where available; otherwise keep :root value.");
    lines.push("- CSS variable naming:");
    lines.push("  - color token key \"surface-1\" -> --color-surface-1");
    lines.push("  - color token key \"accent.lime\" -> --color-accent-lime");
    lines.push("  - spacing token key \"spacing.8\" -> --spacing-8");
    lines.push("  - radius token key \"radius.m\" -> --radius-m");
    lines.push("");
  }
  lines.push("TARGET FILES");
  lines.push("Edit these exact paths:");
  let idx = 1;
  if (web) {
    lines.push(idx + ") app/globals.css (ONLY if imported by app/layout.tsx; otherwise edit whatever file is imported there)");
    idx++;
  }
  if (web) {
    lines.push(idx + ") tailwind.config.ts");
    idx++;
  }
  if (web || mobile) {
    lines.push(idx + ") styles/tokens.ts (create if missing)");
    idx++;
  }
  if (mobile && rn) {
    lines.push(idx + ") react-native/theme.ts (create if missing)");
  }
  if (mobile && nativeSoon) {
    lines.push(idx + ") Native iOS/Android files – coming soon");
  }
  lines.push("");
  lines.push("- If a different globals.css is currently imported, update that file instead and remove/stop importing the unused one.");
  lines.push("- Never leave multiple competing globals.css files.");
  lines.push("");
  lines.push("Generate files:");
  lines.push("");
  if (web) {
    lines.push("1) globals.css (the file imported by app/layout.tsx)");
    lines.push("- Define CSS vars in :root (Light or default)");
    lines.push("- Define overrides in .dark (Dark only)");
    lines.push("- Variables should store raw hex values for colors, px strings for spacing/radius, and px strings for font sizes.");
    lines.push("- For font CSS vars: Do NOT store a plain font name string (e.g. --font-primary: \"Inter\" is WRONG).");
    lines.push("  Instead, reference the CSS variable that next/font/google generates:");
    lines.push("  e.g. --font-primary: var(--font-inter);");
    lines.push("  This requires layout.tsx to load every font and expose it as a CSS variable (see FONT LOADING section below).");
    lines.push("- Semantic aliases (MUST ADD):");
    lines.push("  - In :root define: --background: var(--color-surface-1); --foreground: var(--color-text-primary);");
    lines.push("  - In .dark define: --background: var(--color-surface-1); --foreground: var(--color-text-primary);");
    lines.push("  - Tailwind maps bg-background/text-foreground to these. Keep these in addition to all token vars.");
    lines.push("");
    lines.push("2) tailwind.config.ts");
    lines.push("- Map Tailwind theme colors to CSS vars, e.g.:");
    lines.push("  colors: { surface: { 1: \"var(--color-surface-1)\" }, accent: { lime: \"var(--color-accent-lime)\" } }");
    lines.push("- Map spacing and borderRadius similarly:");
    lines.push("  spacing: { 8: \"var(--spacing-8)\" }");
    lines.push("  borderRadius: { m: \"var(--radius-m)\" }");
    lines.push("- Map fontFamily and fontSize similarly:");
    lines.push("  fontFamily: { primary: \"var(--font-primary)\" }");
    lines.push("  fontSize: { base: \"var(--font-size-base)\" }");
    lines.push("");
    lines.push("FONT LOADING — app/layout.tsx (REQUIRED — do this BEFORE writing globals.css font vars)");
    lines.push("- Use next/font/google to import EACH unique font family as a SEPARATE import.");
    lines.push("- Unique font families to load: " + uniqueFontsList);
    lines.push("- For each font create a next/font/google call with:");
    lines.push("    subsets: ['latin']");
    lines.push("    weight: ['400', '500', '600', '700']");
    lines.push("    variable: '--font-<slugified-name>'  (e.g. Inter -> '--font-inter', Syne -> '--font-syne')");
    lines.push("- Apply ALL font variables to <body> className so the CSS vars are available globally:");
    lines.push("    <body className={`${inter.variable} ${syne.variable} antialiased`}>");
    lines.push("- Do NOT load only one font. Every font listed above MUST have its own import and variable.");
    lines.push("- Then in globals.css set: --font-primary: var(--font-<primary-slug>);  etc.");
    lines.push("  The primary font is the first one listed above (or whichever token key is named 'primary').");
    lines.push("- WRONG:  --font-primary: 'Inter';          ← plain string, font never actually loads");
    lines.push("- CORRECT: --font-primary: var(--font-inter); ← references the variable next/font sets on <body>");
    lines.push("");
    lines.push("3) styles/tokens.ts");
    lines.push("- Export tokensResolved and also export helper functions:");
    lines.push("  getColorVarName(tokenKey), getSpacingVarName(tokenKey), getRadiusVarName(tokenKey), getFontVarName(tokenKey), getFontSizeVarName(tokenKey)");
    lines.push("");
    // Build Google Fonts URL from unique font families for the preview.html instruction
    const googleFontsUrl = uniqueFontFamilies.length
      ? "https://fonts.googleapis.com/css2?" +
        uniqueFontFamilies.map((f) => "family=" + f.replace(/ /g, "+") + ":wght@400;500;600;700").join("&") +
        "&display=swap"
      : "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap";
    lines.push("4) preview.html  (create at project root — no build step, no npm, no server required)");
    lines.push("- Pure HTML + inline CSS + vanilla JS only. No React, no Tailwind, no imports.");
    lines.push("- The user opens this by simply double-clicking it in Finder/Explorer.");
    lines.push("- Load fonts via Google Fonts <link> tags in <head>:");
    lines.push("    <link rel=\"preconnect\" href=\"https://fonts.googleapis.com\">");
    lines.push("    <link rel=\"preconnect\" href=\"https://fonts.gstatic.com\" crossorigin>");
    lines.push("    <link href=\"" + googleFontsUrl + "\" rel=\"stylesheet\">");
    lines.push("- In a <style> block, define ALL token CSS variables:");
    lines.push("    :root { /* Light / default values */ }");
    lines.push("    .dark { /* Dark overrides only */ }");
    lines.push("    body.dark { background: var(--color-surface-1); color: var(--color-text-primary); }");
    lines.push("  Rules for variables:");
    lines.push("  - Colors: resolved hex value directly (e.g. --color-surface-1: #ffffff;)");
    lines.push("  - Spacing and radius: append 'px' unit (e.g. --spacing-8: 8px; --radius-m: 12px;)");
    lines.push("  - Fonts: plain family string — this is plain HTML, NOT Next.js, so no var(--font-inter).");
    lines.push("    e.g. --font-primary: 'Inter', sans-serif;");
    lines.push("  - Tokens with Light and Dark modes: Light in :root, Dark overrides in .dark");
    lines.push("- TOKEN DATA ACCESS PATTERNS — use these exact patterns when reading from exportJson:");
    lines.push("  Colors: entry = exportJson.tokensResolved.color[tokenPath]  ->  { modeName: hexString | null }");
    lines.push("    Get display hex: entry.Light ?? entry.Dark ?? Object.values(entry).find(v => v != null)");
    lines.push("  Spacing: entry = exportJson.tokensResolved.spacing[tokenPath]  ->  { modeName: { value: number } | null }");
    lines.push("    Get px value: Object.values(entry).find(v => v != null)?.value  ->  render as value + 'px'");
    lines.push("  Radius: same access pattern as spacing (values are wrapped in { value: number }).");
    lines.push("  Font: entry = exportJson.tokensResolved.font[tokenPath]  ->  { modeName: string | null }");
    lines.push("    Get family: Object.values(entry).find(v => typeof v === 'string')");
    lines.push("  FontSize: entry = exportJson.tokensResolved.fontSize[tokenPath]  ->  { modeName: number | null }");
    lines.push("    Get size: Object.values(entry).find(v => typeof v === 'number')  ->  render as value + 'px'");
    lines.push("  FontSizeToFontFamily: exportJson.fontSizeToFontFamily[tokenPath]  ->  'FamilyName' | undefined");
    lines.push("  IMPORTANT: Never assume a mode name. Always use Object.values() to find the first non-null value.");
    lines.push("- PAGE LAYOUT: fixed sidebar (~240px) on the left, scrollable main content on the right.");
    lines.push("  Sidebar:");
    lines.push("    - Title: exportJson.meta.projectName (the Figma file name)");
    lines.push("    - Subtitle: \"Design System\"");
    lines.push("    - Nav group \"Tokens\" with clickable items: Colours, Fonts, Spacing, Radius");
    lines.push("    - Nav group \"Components\" (greyed-out placeholder label, no subpages yet)");
    lines.push("  Main content: shows ONE section at a time based on the active nav item.");
    lines.push("    Default section on load: Colours.");
    lines.push("  Dark mode toggle: top-right corner of the main content header.");
    lines.push("  Navigation: pure vanilla JS. Clicking a nav item hides all sections and shows the active one.");
    lines.push("    e.g. each section has a data-section=\"colours\" attribute; active nav item sets a CSS class.");
    lines.push("- TOKEN SECTIONS (one per nav item, shown/hidden by the sidebar nav):");
    lines.push("  COLOURS: always split into 2 tabs — \"UI Colours\" (default/active) and \"Raw\".");
    lines.push("    Tab switching: pure vanilla JS, same show/hide pattern as the sidebar nav.");
    lines.push("    A token is UI Colours if EITHER:");
    lines.push("      (a) its entry has BOTH a Light value AND a Dark value (themeable = semantic), OR");
    lines.push("      (b) its key contains any of these substrings (case-insensitive): background, foreground,");
    lines.push("          surface, text, border, button, pill, muted, blur, error, success, warning, info.");
    lines.push("      Use substring match (key.toLowerCase().includes(...)), NOT just prefix/startsWith.");
    lines.push("    Raw tab: all colour tokens that don't match either criterion above.");
    lines.push("    Each tab shows a grid of cards. Each card: 40×40px color swatch, hex value, CSS var name.");
    lines.push("  FONTS: one row per unique font family. Show font name + sample sentence");
    lines.push("    'The quick brown fox jumps over the lazy dog'");
    lines.push("    rendered with font-family: var(--font-<slug>).");
    lines.push("    Below the font families, show all fontSize tokens. For each: token name, size value,");
    lines.push("    and sample text at that size. Use exportJson.fontSizeToFontFamily to pick the font family.");
    lines.push("    e.g. <p style=\"font-size:var(--font-size-h2);font-family:var(--font-primary)\">Heading 2</p>");
    lines.push("  SPACING: one row per spacing token. Token name, px value, horizontal bar (width = value, max 400px).");
    lines.push("  RADIUS: one row per radius token. Token name, px value, 48×48px square with border-radius applied.");
    lines.push("- Style cleanly: white/dark background, neat section headings, consistent card rows.");
    lines.push("  All styles must be inline or in the single <style> block — no external CSS files.");
    lines.push("- All data comes from exportJson embedded in this prompt. Do not use fetch().");
    lines.push("");
  }
  if (mobile && rn) {
    lines.push((web ? "5" : "1") + ") react-native/theme.ts");
    lines.push("- Export themes.light and themes.dark as plain objects with:");
    lines.push("  colors, spacing, radius");
    lines.push("- React Native does NOT use CSS variables; use raw hex and numeric values.");
    lines.push("- For each token:");
    lines.push("  - light uses Light value if present else default");
    lines.push("  - dark uses Dark value if present else (Light if present) else default");
    lines.push("");
  }
  if (mobile && nativeSoon) {
    lines.push("Native iOS (Swift) and Native Android (Kotlin/XML) – coming soon. No file generation yet.");
    lines.push("");
  }
  lines.push("Here is exportJson:");
  lines.push("```json");
  lines.push(JSON.stringify(exportJson, null, 2));
  lines.push("```");
  lines.push("");
  lines.push("VERIFICATION CHECKLIST");
  lines.push("1) In browser DevTools console, run:");
  lines.push("   document.documentElement.classList.toggle(\"dark\")");
  lines.push("2) Then check computed values:");
  lines.push("   getComputedStyle(document.documentElement).getPropertyValue(\"--color-surface-1\").trim()");
  lines.push("   getComputedStyle(document.documentElement).getPropertyValue(\"--background\").trim()");
  lines.push("3) Confirm CSS includes --background and --foreground, and Tailwind uses bg-background/text-foreground somewhere (e.g. app/page.tsx harness).");
  lines.push("4) Confirm UI visibly changes (background/text) without refresh.");
  lines.push("5) If variables change but UI does not, the issue is Tailwind mapping or wrong CSS import path. Re-check STRICT RULES and TARGET FILES.");
  lines.push("");
  if (web) {
    lines.push("DEBUG HARNESS (optional, for quick sanity check)");
    lines.push("Add to app/page.tsx temporarily - toggle button + computed CSS vars:");
    lines.push("```tsx");
    lines.push("const [dark, setDark] = useState(false);");
    lines.push("useEffect(() => { document.documentElement.classList.toggle(\"dark\", dark); }, [dark]);");
    lines.push("const css = typeof document !== \"undefined\" ? getComputedStyle(document.documentElement) : null;");
    lines.push("// Add inside return:");
    lines.push("<div className=\"p-4 space-y-2 border rounded\">");
    lines.push("  <button onClick={() => setDark((d) => !d)} className=\"px-4 py-2 border rounded\">Toggle dark</button>");
    lines.push("  <pre className=\"text-xs\">{`dark: ${dark}\\n--background: ${css?.getPropertyValue(\"--background\").trim() || \"-\"}\\n--color-surface-1: ${css?.getPropertyValue(\"--color-surface-1\").trim() || \"-\"}`}</pre>");
    lines.push("</div>");
    lines.push("```");
  }
  return lines.join("\n");
}

function sortObjectKeys<T extends Record<string, unknown>>(obj: T): T {
  const out = {} as T;
  for (const k of Object.keys(obj).sort()) {
    const v = obj[k];
    if (v !== null && typeof v === "object" && !Array.isArray(v) && !(v instanceof Date)) {
      (out as Record<string, unknown>)[k] = sortObjectKeys(v as Record<string, unknown>);
    } else {
      (out as Record<string, unknown>)[k] = v;
    }
  }
  return out;
}

let lastSettings: PluginExportSettings = DEFAULT_SETTINGS;

async function runExportWithRaw(rawOutput: RawCollection[], settings: PluginExportSettings): Promise<void> {
  lastSettings = settings;
  const exportModel = buildExportModel(rawOutput);
  const meta = exportModel.meta as Record<string, unknown>;
  meta.targets = settings.targets;
  const webOnly = settings.targets.web && !settings.targets.ios && !settings.targets.android;
  meta.mobileFramework = webOnly ? "none" : settings.mobileFramework;

  // Collect font families and sizes from local text styles
  const textStyles = await figma.getLocalTextStylesAsync();
  const fontTokens: Record<string, { default: string }> = {};
  const fontSizeTokens: Record<string, { default: number }> = {};
  const fontSizeToFontFamily: Record<string, string> = {};
  for (const style of textStyles) {
    const tokenPath = nameToTokenPath(style.name);
    fontTokens[tokenPath] = { default: style.fontName.family };
    fontSizeTokens[tokenPath] = { default: style.fontSize };
    fontSizeToFontFamily[tokenPath] = style.fontName.family;
  }
  (exportModel.tokensResolved as Record<string, unknown>).font = sortObjectKeys(fontTokens);
  (exportModel.tokensResolved as Record<string, unknown>).fontSize = sortObjectKeys(fontSizeTokens);
  exportModel.fontSizeToFontFamily = sortObjectKeys(fontSizeToFontFamily);

  const cursorPrompt = generateCursorPrompt(exportModel, settings);
  const detectedPlatforms = detectTargetPlatforms();
  figma.ui.postMessage({
    type: "EXPORT_READY",
    payload: { exportJson: exportModel, cursorPrompt, settings, detectedPlatforms },
  });
}

figma.showUI(__html__, { width: 520, height: 660 });

figma.ui.onmessage = (msg: { type: string; settings?: PluginExportSettings }) => {
  if (msg.type === "REFRESH") {
    logLocalVariableCollections()
      .then((rawOutput) => runExportWithRaw(rawOutput, lastSettings))
      .catch((err) => {
        console.error(err);
        figma.notify("Export failed: " + String(err), { error: true });
      });
  } else if (msg.type === "EXPORT" && msg.settings) {
    logLocalVariableCollections()
      .then((rawOutput) => runExportWithRaw(rawOutput, msg.settings!))
      .catch((err) => {
        console.error(err);
        figma.notify("Export failed: " + String(err), { error: true });
      });
  } else if (msg.type === "EXPORT_REQUEST") {
    logLocalVariableCollections()
      .then((rawOutput) => runExportWithRaw(rawOutput, DEFAULT_SETTINGS))
      .catch((err) => {
        console.error(err);
        figma.notify("Export failed: " + String(err), { error: true });
      });
  }
};

logLocalVariableCollections()
  .then((rawOutput) => runExportWithRaw(rawOutput, DEFAULT_SETTINGS))
  .catch((err) => {
    console.error(err);
    figma.notify("Export failed: " + String(err), { error: true });
  });
