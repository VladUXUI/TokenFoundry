# AI Agent Instructions for Variables to LLM

## Project Overview
A Figma plugin that extracts design tokens (colors, spacing, radius) from Figma Variables and exports them as both a TypeScript configuration and an interactive web showcase. The plugin bridges Figma's design system with LLM-friendly structured data for AI code generation.

## Architecture

### Three-Layer Structure
1. **Figma Plugin Layer** (`code.ts`): Runs in Figma, reads local variable collections via Figma API
2. **UI/Export Layer** (`ui.html`): Provides export interface with format and target selection
3. **Web Showcase** (`web/`): Next.js app that displays tokens with theme toggling (Light/Dark modes)

### Key Data Flow
1. Plugin reads variables via `figma.variables.getLocalVariableCollectionsAsync()`
2. Transforms to normalized token format: `"Accent/Primary/100"` → `"accent.primary.100"`
3. Resolves variable aliases (`$ref` chains) and handles multi-mode values
4. Generates LLM-friendly JSON export + TypeScript code for web integration

## Critical Implementation Patterns

### Token Path Normalization
- **Location**: `nameToTokenPath()` in `code.ts:57`
- Splits variable name on `/`, lowercases, replaces spaces with hyphens, joins with dots
- Example: `"Primary/Button/Large"` → `"primary.button.large"`
- **Important**: Must be consistent with `toVarSegment()` in `web/styles/tokens.ts:52`

### Alias Resolution
- **Location**: `resolveRef()` in `code.ts:166-235`
- Recursively resolves `$ref` chains with cycle detection (using `visited` set)
- Returns resolved value or tracks error with chain context
- **Critical**: Handles mode mismatch (token in one mode but alias references another) by falling back to single-mode values

### Type Discrimination
- Use type guards: `isVariableAlias()`, `resolveRef()` returns `{ rgba }` vs `{ value }` vs `null`
- Token types: `COLOR`, `FLOAT` (spacing/radius)
- Raw format: `{ rgba: [0-1, 0-1, 0-1, 0-1], hex }` for colors, `{ value: number }` for floats

### Plugin-UI Communication
- **Location**: `figma.ui.onmessage()` in `code.ts:700`
- Plugin receives messages: `REFRESH`, `EXPORT`, `EXPORT_REQUEST`
- Posts back: `EXPORT_READY` with `{ exportJson, cursorPrompt, settings }`
- Uses `figma.notify()` for error feedback

## Build & Development

### Core Plugin
- Build: `npm run build` (tsc compilation)
- Watch: `npm run watch` (interactive development)
- ESLint config in `package.json` with `@figma/eslint-plugin-figma-plugins`
- Typing: `@figma/plugin-typings` provides `figma.*` global API

### Web Showcase
- Location: `web/` with separate `package.json`
- Build: `npm run build` in web directory (Next.js)
- Dev: `npm run dev` for local testing
- Uses Tailwind CSS + TypeScript
- Tokens loaded from `web/styles/tokens.ts` (auto-generated from plugin export)

## Token Export Format

### Export JSON Structure
```typescript
{
  color: { "color.key": { "Light": "#fff", "Dark": "#000" } },
  spacing: { "spacing.key": { "default": { value: 16 } } },
  radius: { "radius.key": { "default": { value: 8 } } },
  errors: Array<DuplicateError | ReferenceError>,
  meta: { version, exportedAt, targets, mobileFramework }
}
```

### Token Validation
- **Duplicate detection**: Same token path from different variable IDs (tracked per bucket)
- **Mode handling**: Single-mode tokens can be referenced by multi-mode tokens
- **Type matching**: Aliases must resolve to same type (color to color, float to float)

## Web Integration

### Token Consumer
- Import `tokensResolved` from `web/styles/tokens.ts`
- Use helpers: `getColorHex()`, `getSpacingValue()` (handles multi-mode fallback)
- CSS var names: `--color-{token}`, `--{token}` (spacing/radius)
- Theme: Controlled via localStorage key `"theme"` ("light" or "dark")

### Theme System
- Light/Dark modes stored in token records: `Record<"Light" | "Dark" | "default", value>`
- `hexLuminance()` for contrast calculations (returns 0–1)
- DOM class toggle: `document.documentElement.classList.toggle("dark", isDark)`

## Error Handling & Edge Cases
- Cycle detection in alias chains: Returns null + error object
- Mode mismatch: Falls back to single-mode value if available
- Collision detection: Tracks first variable ID per token path, reports duplicates
- Missing references: Reports with full chain context for debugging
- Type mismatches: Validates COLOR vs FLOAT before building token values

## Key Files & Their Responsibilities
- `code.ts` (755 lines): Figma plugin logic, variable extraction, token building, export generation
- `ui.html` (1814 lines): HTML UI + embedded CSS (design tokens as CSS vars)
- `web/styles/tokens.ts`: TypeScript token definitions + helper functions (consumer API)
- `manifest.json`: Plugin metadata, API version 1.0.0, dynamic page access
