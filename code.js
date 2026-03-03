"use strict";
/// <reference types="@figma/plugin-typings" />
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
// This file holds the main code for plugins. Code in this file has access to
// the *figma document* via the figma global object.
const PLUGIN_VERSION = "0.1.0";
// Convert normalized rgba [0..1] to hex string
function rgbaToHex(r, g, b, a) {
    const pad = (n) => ("0" + n.toString(16)).slice(-2);
    const R = pad(Math.round(r * 255));
    const G = pad(Math.round(g * 255));
    const B = pad(Math.round(b * 255));
    if (a >= 1)
        return `#${R}${G}${B}`;
    return `#${R}${G}${B}${pad(Math.round(a * 255))}`;
}
// 1) Normalize variable name to token path: "Accent/Primary/100" -> "accent.primary.100"
function nameToTokenPath(name) {
    const segments = name.split("/").map((seg) => seg.trim().toLowerCase().replace(/\s+/g, "-"));
    return segments.filter(Boolean).join(".");
}
// 2) Get target variable ID from alias value
function getAliasVariableId(value) {
    if (typeof value === "object" &&
        value !== null &&
        "type" in value &&
        value.type === "VARIABLE_ALIAS" &&
        "id" in value) {
        return value.id;
    }
    return null;
}
const isVariableAlias = (value) => {
    return (typeof value === 'object' &&
        value !== null &&
        'type' in value &&
        value.type === 'VARIABLE_ALIAS');
};
function detectTargetPlatforms() {
    return __awaiter(this, void 0, void 0, function* () {
        let hasWeb = false;
        let hasMobile = false;
        for (const page of figma.root.children) {
            yield page.loadAsync();
            for (const node of page.children) {
                if (node.type === "FRAME") {
                    const w = node.width;
                    if (w >= 320 && w <= 430)
                        hasMobile = true;
                    if (w >= 768)
                        hasWeb = true;
                }
            }
        }
        // Fallback: default to web if no matching frames found
        if (!hasWeb && !hasMobile)
            hasWeb = true;
        return { web: hasWeb, mobile: hasMobile };
    });
}
function logLocalVariableCollections() {
    return __awaiter(this, void 0, void 0, function* () {
        const collections = yield figma.variables.getLocalVariableCollectionsAsync();
        const output = yield Promise.all(collections.map((collection) => __awaiter(this, void 0, void 0, function* () {
            const modes = collection.modes.map((mode) => ({
                id: mode.modeId,
                name: mode.name,
            }));
            const variables = yield Promise.all(collection.variableIds.map((variableId) => __awaiter(this, void 0, void 0, function* () {
                const variable = yield figma.variables.getVariableByIdAsync(variableId);
                if (!variable)
                    return null;
                const valuesPerMode = {};
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
            })));
            return {
                id: collection.id,
                name: collection.name,
                modes,
                variables: variables.filter((x) => Boolean(x)),
            };
        })));
        return output;
    });
}
// 3) Build raw token value for a mode
function buildTokenValueRaw(value, isAlias, varIdToTokenPath, resolvedType) {
    var _a;
    if (isAlias) {
        const targetId = getAliasVariableId(value);
        const tokenPath = targetId ? varIdToTokenPath[targetId] : null;
        if (tokenPath)
            return { $ref: tokenPath };
        return null;
    }
    if (resolvedType === "COLOR" && typeof value === "object" && value !== null && "r" in value) {
        const c = value;
        const r = c.r;
        const g = c.g;
        const b = c.b;
        const a = (_a = c.a) !== null && _a !== void 0 ? _a : 1;
        return { rgba: [r, g, b, a], hex: rgbaToHex(r, g, b, a) };
    }
    if (resolvedType === "FLOAT" && typeof value === "number") {
        return { value };
    }
    return null;
}
// Get value for a mode from a token entry, with single-mode fallback
function getValueForMode(tokenEntry, requestedModeName) {
    if (tokenEntry[requestedModeName])
        return tokenEntry[requestedModeName];
    const modeKeys = Object.keys(tokenEntry);
    if (modeKeys.length === 1)
        return tokenEntry[modeKeys[0]];
    return null;
}
// 4) Resolve $ref chain for a single token mode value (returns resolved value or null)
function resolveRef(tokenPath, requestedModeName, tokensRaw, bucket, visited, chain, errors) {
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
    const tokenEntry = bucketTokens === null || bucketTokens === void 0 ? void 0 : bucketTokens[tokenPath];
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
        if (!bucketTokens[refPath]) {
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
        const resolved = resolveRef(refPath, requestedModeName, tokensRaw, bucket, visited, chain, errors);
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
function buildExportModel(collections) {
    var _a, _b, _c, _d;
    // 1) Build varId -> tokenPath lookup
    const varIdToTokenPath = {};
    for (const col of collections) {
        for (const v of col.variables) {
            varIdToTokenPath[v.id] = nameToTokenPath(v.name);
        }
    }
    // 2) Build tokensRaw grouped by type, with collision detection per bucket
    const tokensRaw = { color: {}, spacing: {}, radius: {} };
    const tokenPathToFirst = {
        color: {},
        spacing: {},
        radius: {},
    };
    const duplicateErrors = [];
    const checkCollisionAndAdd = (bucket, tokenPath, varId, originalName, collectionName) => {
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
        if (!existing)
            map[tokenPath] = { varId, originalName, collectionName };
        return true;
    };
    for (const col of collections) {
        const modeIdToName = {};
        for (const m of col.modes)
            modeIdToName[m.id] = m.name;
        const getOutputModeKey = (modeName) => col.modes.length === 1 && col.modes[0].name === "Mode 1" && modeName === "Mode 1"
            ? "default"
            : modeName;
        for (const v of col.variables) {
            const tokenPath = varIdToTokenPath[v.id];
            const nameLower = v.name.toLowerCase();
            if (v.resolvedType === "COLOR") {
                if (!checkCollisionAndAdd("color", tokenPath, v.id, v.name, col.name))
                    continue;
                tokensRaw.color[tokenPath] = {};
                for (const modeId of Object.keys(v.valuesPerMode)) {
                    const { value, isAlias } = v.valuesPerMode[modeId];
                    const modeName = (_a = modeIdToName[modeId]) !== null && _a !== void 0 ? _a : modeId;
                    const outputKey = getOutputModeKey(modeName);
                    const tv = buildTokenValueRaw(value, isAlias, varIdToTokenPath, v.resolvedType);
                    if (tv)
                        tokensRaw.color[tokenPath][outputKey] = tv;
                }
            }
            else if (v.resolvedType === "FLOAT") {
                const colNameLower = col.name.toLowerCase();
                let toSpacing;
                let toRadius;
                if (colNameLower.includes("spacing")) {
                    toSpacing = true;
                    toRadius = false;
                }
                else if (colNameLower.includes("radius")) {
                    toSpacing = false;
                    toRadius = true;
                }
                else {
                    toSpacing = nameLower.includes("spacing");
                    toRadius = nameLower.includes("radius");
                }
                if (toSpacing) {
                    if (!checkCollisionAndAdd("spacing", tokenPath, v.id, v.name, col.name))
                        continue;
                    tokensRaw.spacing[tokenPath] = {};
                    for (const modeId of Object.keys(v.valuesPerMode)) {
                        const { value, isAlias } = v.valuesPerMode[modeId];
                        const modeName = (_b = modeIdToName[modeId]) !== null && _b !== void 0 ? _b : modeId;
                        const outputKey = getOutputModeKey(modeName);
                        const tv = buildTokenValueRaw(value, isAlias, varIdToTokenPath, v.resolvedType);
                        if (tv)
                            tokensRaw.spacing[tokenPath][outputKey] = tv;
                    }
                }
                else if (toRadius) {
                    if (!checkCollisionAndAdd("radius", tokenPath, v.id, v.name, col.name))
                        continue;
                    tokensRaw.radius[tokenPath] = {};
                    for (const modeId of Object.keys(v.valuesPerMode)) {
                        const { value, isAlias } = v.valuesPerMode[modeId];
                        const modeName = (_c = modeIdToName[modeId]) !== null && _c !== void 0 ? _c : modeId;
                        const outputKey = getOutputModeKey(modeName);
                        const tv = buildTokenValueRaw(value, isAlias, varIdToTokenPath, v.resolvedType);
                        if (tv)
                            tokensRaw.radius[tokenPath][outputKey] = tv;
                    }
                }
            }
        }
    }
    // 4) Build tokensResolved
    const tokensResolved = { color: {}, spacing: {}, radius: {} };
    const resolutionErrors = [];
    for (const bucket of ["color", "spacing", "radius"]) {
        const raw = tokensRaw[bucket];
        const res = tokensResolved[bucket];
        for (const tokenPath of Object.keys(raw).sort()) {
            res[tokenPath] = {};
            const modeNames = Object.keys(raw[tokenPath]).sort();
            for (const modeName of modeNames) {
                const visited = new Set();
                const resolved = resolveRef(tokenPath, modeName, tokensRaw, bucket, visited, [], resolutionErrors);
                if (bucket === "color") {
                    const rgba = resolved && "rgba" in resolved ? resolved.rgba : null;
                    res[tokenPath][modeName] =
                        rgba ? rgbaToHex(rgba[0], rgba[1], rgba[2], (_d = rgba[3]) !== null && _d !== void 0 ? _d : 1) : null;
                }
                else {
                    res[tokenPath][modeName] =
                        resolved;
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
const DEFAULT_SETTINGS = {
    targets: { web: true, ios: false, android: false },
    mobileFramework: "react-native",
};
function hasUiVsRawColorSplit(exportJson) {
    const tr = exportJson.tokensResolved;
    const color = tr === null || tr === void 0 ? void 0 : tr.color;
    if (!color || typeof color !== "object")
        return false;
    const keys = Object.keys(color);
    const uiPattern = /^(surface|text|button|pill|border|background|foreground)[.-]|^surface$|^text$|^button$|^pill$|^border$|^background$|^foreground$/i;
    const rawPattern = /accent|palette|primary\.\d|secondary\.\d|blue|red|green|gray|grey|lime|orange|\.[0-9]{2,}$/i;
    let hasUi = false;
    let hasRaw = false;
    for (const k of keys) {
        const lower = k.toLowerCase();
        if (uiPattern.test(lower) || /\b(surface|text|button|pill|border)\b/.test(lower))
            hasUi = true;
        if (rawPattern.test(lower) || /\.(100|200|300|400|500|600|700|800|900)$/.test(k))
            hasRaw = true;
        if (hasUi && hasRaw)
            return true;
    }
    return false;
}
function getUniqueFontFamilies(exportJson) {
    const tokensResolved = exportJson.tokensResolved;
    const fontTokens = ((tokensResolved === null || tokensResolved === void 0 ? void 0 : tokensResolved.font) || {});
    const families = [];
    for (const tokenPath of Object.keys(fontTokens)) {
        const modeMap = fontTokens[tokenPath];
        if (!modeMap)
            continue;
        for (const modeName of Object.keys(modeMap)) {
            const v = modeMap[modeName];
            if (typeof v === "string" && v)
                families.push(v);
        }
    }
    return [...new Set(families)];
}
function generateTokensAndFilesPrompt(exportJson, settings) {
    const lines = [];
    const web = settings.targets.web;
    const uniqueFontFamilies = getUniqueFontFamilies(exportJson);
    const fontSlug = (name) => name.toLowerCase().replace(/\s+/g, "-");
    const uniqueFontsList = uniqueFontFamilies.length
        ? uniqueFontFamilies.map((f) => `${f} (variable: --font-${fontSlug(f)})`).join(", ")
        : "(none detected — check exportJson.tokensResolved.font)";
    const mobile = settings.targets.ios || settings.targets.android;
    const rn = settings.mobileFramework === "react-native";
    const nativeSoon = settings.mobileFramework === "swift" || settings.mobileFramework === "kotlin";
    lines.push("Target: Next.js + Tailwind" + (mobile && rn ? " + React Native" : mobile && nativeSoon ? " (mobile coming soon)" : "") + ".");
    lines.push("");
    lines.push("STRICT RULES");
    lines.push("- Do not rename any token keys. from this exportJson");
    lines.push("- Do not drop or merge tokens. from this exportJson");
    lines.push("- Do not \"prettify\" token names (no camelCase conversions).");
    lines.push("- Update the existing global stylesheet that is imported by app/layout.tsx. Do not create a second globals file.");
    lines.push("- If app/layout.tsx imports \"./globals.css\", the correct file is app/globals.css (not styles/globals.css).");
    lines.push("- Ensure tailwind.config.ts content includes \"./app/**/*.{js,ts,jsx,tsx,mdx}\".");
    lines.push("");
    lines.push("Use exportJson.tokensResolved as source of truth for final values.");
    lines.push("Aliases are in exportJson.tokensRaw (optional).");
    lines.push("ALIAS HANDLING IS IDEMPOTENT");
    lines.push("Treat all existing aliases as disposable.");
    lines.push("If an alias already exists and its value is exactly the same as the new value from exportJson.tokensResolved — same hex or same var(--target) — do not change it.");
    lines.push("If an alias already exists but its value differs from the value derived from exportJson.tokensResolved, overwrite it with the new correct value.");
    lines.push("Apply this rule to both raw hex aliases and var(--some-other-var) aliases so that re-running this prompt after Figma changes always syncs CSS with exportJson.tokensResolved.");
    lines.push("This rule must be applied to all aliases in the project, not just the ones generated by this prompt.");
    lines.push("");
    lines.push("ALIAS/TAILWIND SYNC IS SEMANTIC, NOT LITERAL");
    lines.push("_ For each semantic token from exportJson  e.g. surface, text, background, foreground  derive the authoritative CSS variable name from the token path, and treat that as the single source of truth for that role.");
    lines.push("_ In globals.css, always define that authoritative CSS variable and point it at the correct RAW palette var using var(...). If the authoritative name changes between runs, treat the old variable name as deprecated.");
    lines.push("_ In tailwind.config.*, never hard‑code old variable names. For each semantic role, make Tailwind's theme.colors entry reference the current authoritative CSS variable name, e.g. if the background role is now --surface, then colors.background must be var(--surface) instead of var(--background).");
    lines.push("_ When you detect that a semantic role's CSS variable name has changed  e.g. old: --background, new: --surface – you MUST update every Tailwind mapping that used the old name to use the new one. Code using bg-background / text-foreground should continue to work because the Tailwind keys stay the same; only the referenced var(--) changes.");
    lines.push("_ Do not keep \"ghost\" aliases for renamed roles unless explicitly instructed. If the design now says the semantic background token is --surface, then var(--background) should no longer be used anywhere; instead, Tailwind should point directly at var(--surface).");
    lines.push("");
    lines.push("Tailwind v4 note:");
    lines.push("- Do NOT use @theme blocks in globals.css to define --spacing-* or --radius-* custom properties. In Tailwind v4, @theme variables with those prefixes replace the built-in spacing and borderRadius scales.");
    lines.push("- Instead, define spacing and radius tokens as normal CSS custom properties under :root, and extend theme.spacing and theme.borderRadius in tailwind.config.ts.");
    lines.push("FONT VS FONT SIZE TOKENS (REQUIRED)");
    lines.push("- tokensResolved.font defines font families (e.g. \"Inter\", \"Outfit\"). For each font.* token, create a --font-<tokenPathSlug> CSS variable (e.g. font.belong.h1 → --font-belong-h1) whose value is a var(--font-<next-font-slug>) reference to the corresponding next/font variable (e.g. --font-outfit).");
    lines.push("- tokensResolved.fontSize defines font sizes in px. For each fontSize.* token, create a --font-size-<tokenPathSlug> CSS variable (e.g. fontSize.belong.h1 → --font-size-belong-h1) whose value is the px string (e.g. 40px).");
    lines.push("- Never mix these: --font-* variables are always font families (referencing next/font CSS vars), and --font-size-* variables are always numeric sizes with px.");
    lines.push("");
    lines.push("COLOR LAYERS AND COLLECTIONS (REQUIRED)");
    lines.push("- Treat base collections (e.g. \"Base Colours\", \"Sand\", \"Night\", or other palette-like groups) as RAW palette tokens.");
    lines.push("- For each RAW token, create a CSS variable that stores the hex value directly: --color-<collectionSlug>-<tokenSlug>.");
    lines.push("  - collectionSlug: collection name lowercased, spaces and \"/\" replaced with \"-\" (e.g. \"Sand\" -> \"sand\").");
    lines.push("  - tokenSlug: token path lowercased, \"/\" replaced with \"-\" (e.g. \"Sand/80\" -> \"sand-80\").");
    lines.push("  - Example: collection \"Sand\" + token \"Sand/100\" -> --color-sand-sand-100: #f1f1f1;");
    lines.push("- Treat UI/semantic collections (names containing \"Ui\", \"UI\", \"Semantic\" or tokens whose path includes surface/text/border/button/pill/background/foreground) as UI tokens.");
    lines.push("- UI tokens must NEVER inline hex; they should always reference RAW palette vars using var(...).");
    lines.push("  - Example: --color-surface-surface-1: var(--color-sand-sand-100);");
    lines.push("SPACING IN TAILWIND — MAP BY VALUE, NOT BY KEY NAME (REQUIRED)");
    lines.push("- The spacing scale in tailwind.config must map Tailwind's utility keys (the numbers used in classes like p-4, gap-6) to the nearest design token by pixel value, not by matching key and token name.");
    lines.push("- Do not set 4: \"var(--spacing-4)\" (that would make p-4 = 4px). Instead, map so that common utilities match the intent of the token scale: e.g. if tokens are 0, 2, 4, 8, 12, 16, 24, 32, 40, 48, 56, 64 px, then map Tailwind key 4 → var(--spacing-16), 6 → var(--spacing-24), 8 → var(--spacing-32), 10 → var(--spacing-40), 12 → var(--spacing-48), 16 → var(--spacing-16), 24 → var(--spacing-24), etc. Include all Tailwind spacing keys that appear in the project (e.g. 1, 1.5, 2, 3, 4, 5, 6, 8, 10, 12, 16, 20, 24) and point each to the closest token var by value.");
    lines.push("BORDER RADIUS IN TAILWIND — MAP DEFAULT NAMES (REQUIRED)");
    lines.push("- In addition to any custom radius token names (e.g. s, m, round), always map Tailwind's default borderRadius keys so that standard utilities use the token scale: sm → the smallest radius token (e.g. var(--radius-s) or var(--radius-xs)), md → medium (e.g. var(--radius-m)), lg → next up (e.g. var(--radius-xl)), xl/2xl/full → the matching or nearest token. Include full: \"var(--radius-round)\" (or the equivalent \"pill\" token) so that rounded-full uses the design system.");
    lines.push("COLOR PRIMITIVES IN DESIGN-TOKENS AND THE COLORS PAGE (REQUIRED)");
    lines.push("- In the design-tokens file (e.g. src/data/design-tokens.ts), always export a primitives (or raw/base) color list containing every RAW palette token from globals.css: all base-colours tokens (e.g. night.night-10 through night-100, sand.sand-40 through sand-100, accent.lime, accent.primary.50/100, error, success). Each entry must have name and variable (the --color-* CSS var). Do not only list UI/semantic colors; the primitives list is required for the docs.");
    lines.push("- On the Colors documentation page, the Primitives tab must render that list: use the same Section/Card pattern as the UI tab and pass tokens={colorTokens.primitives} (or the chosen key). The Primitives tab must not be only a title and description with no token grid.");
    lines.push("");
    if (web) {
        lines.push("Web theming rules:");
        lines.push("DARK MODE RUNTIME WIRING (REQUIRED)");
        lines.push("- Tailwind darkMode is \"class\" and globals.css uses a .dark { ... } selector for overrides.");
        lines.push("- The runtime theme switcher (e.g. ThemeProvider) MUST add/remove the \"dark\" class on document.documentElement whenever the theme changes.");
        lines.push("- When theme is \"dark\", ensure document.documentElement.classList.add(\"dark\").");
        lines.push("- When theme is \"light\", ensure document.documentElement.classList.remove(\"dark\").");
        lines.push("- It is optional to keep data-theme=\"light\" | \"dark\" for JS, but ALL visual dark-mode styling must be driven by the dark class so that both Tailwind dark: variants and the .dark { ... } block in globals.css activate correctly.");
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
    if (web || mobile) {
        lines.push(idx + ") component-rules.md (create at project root or in .cursor/ or docs/)");
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
        lines.push("- In :root define RAW palette vars for every base colour token using hex (no var(...) here).");
        lines.push("  Example: --color-sand-sand-100: #f1f1f1;");
        lines.push("- Then define UI/semantic vars that reference RAW palette vars with var(...), never hex.");
        lines.push("  Example: --color-surface-surface-1: var(--color-sand-sand-100); --color-text-text-primary: var(--color-night-night-100);");
        lines.push("- Define short semantic aliases on top of the UI layer (e.g. --background, --foreground) that point to UI vars.");
        lines.push("- Spacing, radius, and font-size vars should store px strings; font vars should reference next/font CSS vars (e.g. --font-primary: var(--font-inter));");
        lines.push("- Define overrides in .dark (Dark only) by changing RAW or UI vars that have Dark values, keeping the same layering (RAW -> UI -> aliases).");
        lines.push("- For font CSS vars: Do NOT store a plain font name string (e.g. --font-primary: \"Inter\" is WRONG).");
        lines.push("  Instead, reference the CSS variable that next/font/google generates:");
        lines.push("  e.g. --font-primary: var(--font-inter);");
        lines.push("  This requires layout.tsx to load every font and expose it as a CSS variable (see FONT LOADING section below).");
        lines.push("- Semantic aliases for page background and main text:");
        lines.push("  - If the project already has semantic aliases (e.g. --surface, --text, --bg, --fg), keep them and ensure Tailwind theme and .dark overrides use those same variables.");
        lines.push("  - If not, or if Tailwind uses bg-background/text-foreground, define --background and --foreground pointing at the surface and text tokens (e.g. --background: var(--color-surface-1); --foreground: var(--color-text-primary);) in both :root and .dark.");
        lines.push("  - Do not duplicate semantics: use either the project's existing aliases or add --background/--foreground, not both.");
        lines.push("");
        lines.push("2) tailwind.config.ts");
        lines.push("- Map Tailwind theme colors to CSS vars, e.g.:");
        lines.push("  colors: { surface: { 1: \"var(--color-surface-1)\" }, accent: { lime: \"var(--color-accent-lime)\" } }");
        lines.push("- Map spacing and borderRadius similarly, using the closest available token values instead of assuming exact numeric matches:");
        lines.push("  - For spacing, look at the px values of your spacing tokens and map the Tailwind keys actually used in the project (e.g. 1, 1.5, 2, 4, 6, 8, 10, 12) to the nearest token value.");
        lines.push("  - Example: if tokens are 0,2,4,8,12,16,24,32,40,48,56,64, then p-6 (24px) can use var(--spacing-24), gap-10 (40px) can use var(--spacing-40), and small values like py-1.5 can map to the closest small token (e.g. var(--spacing-2)).");
        lines.push("  spacing: { 0: \"0px\", 2: \"var(--spacing-4)\", 4: \"var(--spacing-16)\", 6: \"var(--spacing-24)\", 10: \"var(--spacing-40)\" }");
        lines.push("  - For radius, map semantic keys to the closest radius tokens (e.g. sm/md/lg to s/m/l, and full to the most rounded token).");
        lines.push("  borderRadius: { sm: \"var(--radius-s)\", md: \"var(--radius-m)\", lg: \"var(--radius-l)\", full: \"var(--radius-round)\" }");
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
        lines.push("4) src/data/design-tokens.ts");
        lines.push("- Keep this file's token entries in sync with the authoritative CSS variables from globals.css.");
        lines.push("- For each token, update the variable field to point at the current semantic alias layer (e.g. --background, --foreground, --color-surface-1, --color-text-primary) instead of old names like --surface-1 or --text-primary.");
        lines.push("- Do not rename the token keys or display names, only update variable strings.");
        lines.push("- For any changes to semantic CSS variables in globals.css, also update references in src/data/design-tokens.ts so that all variable fields point to the same authoritative semantic aliases used by Tailwind (e.g. if text primary is now --color-text-primary, then design-tokens.ts must use that too).");
        lines.push("- Add every token from exportJson to design-tokens.ts. Do not limit updates to existing entries. For each color, typography, spacing, and radius token in exportJson.tokensResolved (and font/fontSize where applicable), ensure there is a corresponding entry in design-tokens.ts with the correct variable field pointing at the authoritative CSS variable (e.g. --color-surface-2, --color-surface-drawer, --color-text-primary-inverted, --color-accent-lime, --color-error, --color-success, --color-button-main, --color-button-content). Add new sections or arrays as needed (e.g. for semantic surfaces, text, accents, buttons, status colors) so the docs page can display the full token set.");
        lines.push("- Font family tokens in design-tokens.ts: List only the distinct font families (one entry per next/font, e.g. Inter, Outfit). Do not add every font.* token (e.g. belong.body, belong.h1, … belong.h6) to fontFamilyTokens; those are semantic \"which family for this style\" tokens, not separate families. They can be referenced via typographyTokens (font-size entries) or a separate typography-style list if needed; the variable for a style's family is --font-belong-<name> (font family), and the variable for its size is --font-size-belong-<name> (font size).");
        lines.push("");
        lines.push("5) component-rules.md");
        lines.push("Create or update component-rules.md (at project root, or in .cursor/ or docs/) with the following content. This file is framework-agnostic and must be used when building UI components. Write the file exactly as below:");
        lines.push("");
        lines.push("# Component Rules (Token-Driven UI)");
        lines.push("");
        lines.push("## Source of Truth");
        lines.push("- All final values come from exportJson.tokensResolved.");
        lines.push("- Aliases may exist in exportJson.tokensRaw but are optional.");
        lines.push("");
        lines.push("## Token Keys");
        lines.push("- Token keys must be used exactly as exported.");
        lines.push("- No camelCase, no prettifying, no renaming.");
        lines.push("");
        lines.push("## No Hardcoded Values");
        lines.push("- Do not use raw hex, rgb(...), rgba(...) literals, px literals, or hardcoded radii in component styles.");
        lines.push("- Exceptions: layout primitives that are not tokenized (e.g. 0 for reset, 1px for hairline) are allowed only when there is no corresponding token. If a value should be tokenized, add it to the design tokens and use the token.");
        lines.push("");
        lines.push("## Implementation Flexibility (Framework-Agnostic)");
        lines.push("- If a framework or theme mapping exists (e.g. Tailwind theme extending tokens), use the mapped utilities.");
        lines.push("- If no mapping exists, use CSS variables directly: var(--color-...), var(--spacing-...), var(--radius-...), var(--font-...), var(--font-size-...).");
        lines.push("- Do not assume specific class names; only require that visual values come from token-derived CSS variables or their mapped equivalents.");
        lines.push("");
        lines.push("## How to Apply These Rules When Building Components");
        lines.push("- When creating or updating components (Button, Card, Tab, etc.), derive background, text color, border, radius, and spacing from tokens.");
        lines.push("- Use semantic variables when provided (e.g. --background, --foreground); otherwise use the token CSS variables that match the role.");
        lines.push("");
        lines.push("## Validation Checklist");
        lines.push("- Search for #, rgb(, rgba(, and bare px in component files; ensure these come from tokens or are in the allowed exceptions.");
        lines.push("- Ensure colors are read from CSS variables or from the token mapping, not hardcoded.");
        lines.push("- If the UI does not change when toggling dark mode, check that the global CSS is imported and that theme mapping points at the correct variables.");
        lines.push("");
    }
    if (mobile && rn) {
        lines.push((web ? "6" : "1") + ") react-native/theme.ts");
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
function sortObjectKeys(obj) {
    const out = {};
    for (const k of Object.keys(obj).sort()) {
        const v = obj[k];
        if (v !== null && typeof v === "object" && !Array.isArray(v) && !(v instanceof Date)) {
            out[k] = sortObjectKeys(v);
        }
        else {
            out[k] = v;
        }
    }
    return out;
}
let lastSettings = DEFAULT_SETTINGS;
function runExportWithRaw(rawOutput, settings) {
    return __awaiter(this, void 0, void 0, function* () {
        lastSettings = settings;
        const exportModel = buildExportModel(rawOutput);
        const meta = exportModel.meta;
        meta.targets = settings.targets;
        const webOnly = settings.targets.web && !settings.targets.ios && !settings.targets.android;
        meta.mobileFramework = webOnly ? "none" : settings.mobileFramework;
        // Collect font families and sizes from local text styles
        const textStyles = yield figma.getLocalTextStylesAsync();
        const fontTokens = {};
        const fontSizeTokens = {};
        const fontSizeToFontFamily = {};
        for (const style of textStyles) {
            const tokenPath = nameToTokenPath(style.name);
            fontTokens[tokenPath] = { default: style.fontName.family };
            fontSizeTokens[tokenPath] = { default: style.fontSize };
            fontSizeToFontFamily[tokenPath] = style.fontName.family;
        }
        exportModel.tokensResolved.font = sortObjectKeys(fontTokens);
        exportModel.tokensResolved.fontSize = sortObjectKeys(fontSizeTokens);
        exportModel.fontSizeToFontFamily = sortObjectKeys(fontSizeToFontFamily);
        const tokensPrompt = generateTokensAndFilesPrompt(exportModel, settings);
        const detectedPlatforms = yield detectTargetPlatforms();
        figma.ui.postMessage({
            type: "EXPORT_READY",
            payload: { exportJson: exportModel, tokensPrompt, settings, detectedPlatforms },
        });
    });
}
figma.showUI(__html__, { width: 520, height: 760 });
figma.ui.onmessage = (msg) => {
    if (msg.type === "REFRESH") {
        logLocalVariableCollections()
            .then((rawOutput) => runExportWithRaw(rawOutput, lastSettings))
            .catch((err) => {
            console.error(err);
            figma.notify("Export failed: " + String(err), { error: true });
        });
    }
    else if (msg.type === "EXPORT" && msg.settings) {
        logLocalVariableCollections()
            .then((rawOutput) => runExportWithRaw(rawOutput, msg.settings))
            .catch((err) => {
            console.error(err);
            figma.notify("Export failed: " + String(err), { error: true });
        });
    }
    else if (msg.type === "EXPORT_REQUEST") {
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
