/**
 * Design tokens – source of truth from exportJson.tokensResolved
 * Replace this object with your exported JSON tokensResolved when using real Figma data.
 */
export const tokensResolved = {
    color: {
        "surface-1": { Light: "#ffffff", Dark: "#121212" },
        "surface-2": { Light: "#f5f5f5", Dark: "#1e1e1e" },
        "text-primary": { Light: "#111111", Dark: "#f5f5f5" },
        "text-secondary": { Light: "#666666", Dark: "#a3a3a3" },
        "accent.lime": { Light: "#defd61", Dark: "#c4e045" },
        "accent.primary.100": { Light: "#e0f2fe", Dark: "#0c4a6e" },
        "accent.primary.500": { Light: "#0ea5e9", Dark: "#38bdf8" },
        "button.main": { Light: "#0ea5e9", Dark: "#0284c7" },
        "button.content": { Light: "#ffffff", Dark: "#ffffff" },
        "pill.surface": { Light: "#f0fdf4", Dark: "#14532d" },
        "pill.text": { Light: "#166534", Dark: "#86efac" },
        "border.border": { Light: "#e5e5e5", Dark: "#404040" },
    },
    spacing: {
        "spacing.2": { default: { value: 2 } },
        "spacing.4": { default: { value: 4 } },
        "spacing.8": { default: { value: 8 } },
        "spacing.12": { default: { value: 12 } },
        "spacing.16": { default: { value: 16 } },
        "spacing.24": { default: { value: 24 } },
    },
    radius: {
        "radius.sm": { default: { value: 4 } },
        "radius.m": { default: { value: 8 } },
        "radius.lg": { default: { value: 12 } },
        "radius.full": { default: { value: 9999 } },
    },
};
function toVarSegment(key) {
    return key.replace(/\./g, "-");
}
export function getColorVarName(tokenKey) {
    return `--color-${toVarSegment(tokenKey)}`;
}
export function getSpacingVarName(tokenKey) {
    return `--${toVarSegment(tokenKey)}`;
}
export function getRadiusVarName(tokenKey) {
    return `--${toVarSegment(tokenKey)}`;
}
export function colorBgClass(tokenKey) {
    return `bg-${toVarSegment(tokenKey)}`;
}
export function colorTextClass(tokenKey) {
    return `text-${toVarSegment(tokenKey)}`;
}
/** Get first available hex value for a color token (Light, Dark, or default) */
export function getColorHex(token, preferDark = false) {
    var _a;
    if (!token)
        return null;
    const keys = Object.keys(token);
    if (preferDark && keys.includes("Dark"))
        return token.Dark;
    if (keys.includes("Light"))
        return token.Light;
    if (keys.includes("default"))
        return token.default;
    return (_a = token[keys[0]]) !== null && _a !== void 0 ? _a : null;
}
/** Approximate luminance for contrast (0–1, higher = lighter) */
export function hexLuminance(hex) {
    const m = hex.match(/^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i);
    if (!m)
        return 0.5;
    const r = parseInt(m[1], 16) / 255;
    const g = parseInt(m[2], 16) / 255;
    const b = parseInt(m[3], 16) / 255;
    const [rs, gs, bs] = [r, g, b].map((c) => c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
    return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
}
export function getSpacingValue(token) {
    if (!token)
        return null;
    const vals = Object.values(token).filter((v) => v && typeof v.value === "number");
    return vals.length ? vals[0].value : null;
}
