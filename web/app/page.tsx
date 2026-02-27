"use client";

import { useEffect, useState } from "react";
import {
  tokensResolved,
  getColorVarName,
  getSpacingVarName,
  getRadiusVarName,
  getColorHex,
  hexLuminance,
  getSpacingValue,
} from "@/styles/tokens";

function getThemeFromStorage(): "light" | "dark" {
  if (typeof window === "undefined") return "light";
  const stored = localStorage.getItem("theme");
  if (stored === "dark" || stored === "light") return stored;
  return "light";
}

function setThemeStorage(theme: "light" | "dark") {
  localStorage.setItem("theme", theme);
}

export default function TokensPage() {
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    const theme = getThemeFromStorage();
    const dark = theme === "dark";
    setIsDark(dark);
    document.documentElement.classList.toggle("dark", dark);
  }, []);

  const handleToggle = () => {
    const next = !isDark;
    setIsDark(next);
    document.documentElement.classList.toggle("dark", next);
    setThemeStorage(next ? "dark" : "light");
  };

  const colorEntries = Object.entries(tokensResolved.color);
  const spacingEntries = Object.entries(tokensResolved.spacing).sort(
    (a, b) => (getSpacingValue(a[1]) ?? 0) - (getSpacingValue(b[1]) ?? 0)
  );
  const radiusEntries = Object.entries(tokensResolved.radius).sort(
    (a, b) => (getSpacingValue(a[1]) ?? 0) - (getSpacingValue(b[1]) ?? 0)
  );

  const groupColors = (entries: [string, Record<string, string | null>][]) => {
    const groups: Record<string, [string, Record<string, string | null>][]> = {};
    for (const [key, val] of entries) {
      const group = key.includes(".") ? key.split(".")[0] : "misc";
      if (!groups[group]) groups[group] = [];
      groups[group].push([key, val]);
    }
    return groups;
  };

  const colorGroups = groupColors(colorEntries);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-4xl px-6 py-12">
        <header className="mb-12 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">
              Design Tokens
            </h1>
            <p className="text-sm text-[var(--color-text-secondary)]">
              Generated from Figma variables
            </p>
          </div>
          <div className="mt-4 flex items-center gap-3 sm:mt-0">
            <span
              className={`text-sm ${!isDark ? "font-medium" : "text-[var(--color-text-secondary)]"}`}
            >
              Light
            </span>
            <button
              role="switch"
              aria-checked={isDark}
              onClick={handleToggle}
              className="relative h-7 w-12 rounded-full border border-[var(--color-border-border)] bg-[var(--color-surface-2)] transition-colors focus:outline-none focus:ring-2 focus:ring-[var(--color-accent-primary-500)] focus:ring-offset-2 focus:ring-offset-[var(--color-surface-1)]"
            >
              <span
                className={`absolute top-1 h-5 w-5 rounded-full bg-[var(--color-accent-primary-500)] shadow-sm transition-transform ${
                  isDark ? "left-6" : "left-1"
                }`}
              />
            </button>
            <span
              className={`text-sm ${isDark ? "font-medium" : "text-[var(--color-text-secondary)]"}`}
            >
              Dark
            </span>
          </div>
        </header>

        <section className="mb-16">
          <h2 className="mb-4 text-lg font-medium">Preview</h2>
          <div className="rounded-lg border border-[var(--color-border-border)] bg-[var(--color-surface-2)] p-6">
            <div className="flex flex-wrap items-center gap-4">
              <div className="rounded-lg border border-[var(--color-border-border)] bg-background p-4">
                <p className="text-sm">Background & foreground</p>
              </div>
              <button
                className="rounded-lg px-4 py-2 text-sm font-medium"
                style={{
                  backgroundColor: "var(--color-button-main)",
                  color: "var(--color-button-content)",
                }}
              >
                Button
              </button>
              <span
                className="rounded-full px-3 py-1 text-sm"
                style={{
                  backgroundColor: "var(--color-pill-surface)",
                  color: "var(--color-pill-text)",
                }}
              >
                Pill
              </span>
              <div
                className="rounded border-2 p-3"
                style={{ borderColor: "var(--color-border-border)" }}
              >
                Border example
              </div>
            </div>
          </div>
        </section>

        <section className="mb-16">
          <h2 className="mb-4 text-lg font-medium">Colors</h2>
          <div className="space-y-8">
            {Object.entries(colorGroups).map(([group, items]) => (
              <div key={group}>
                <h3 className="mb-3 text-sm font-medium capitalize text-[var(--color-text-secondary)]">
                  {group}
                </h3>
                <div className="space-y-3">
                  {items.map(([key, token]) => {
                    const hex = getColorHex(token, isDark) ?? "#888";
                    const lum = hexLuminance(hex);
                    const labelColor = lum < 0.4 ? "#fff" : "#000";
                    const varName = getColorVarName(key);
                    const normalized = key.replace(/\./g, "-");
                    return (
                      <div
                        key={key}
                        className="flex flex-wrap items-center gap-4 rounded-lg border border-[var(--color-border-border)] bg-[var(--color-surface-2)] p-4"
                      >
                        <div
                          className="h-12 w-12 shrink-0 rounded-lg border border-[var(--color-border-border)]"
                          style={{ backgroundColor: hex }}
                        />
                        <div className="min-w-0 flex-1">
                          <p className="font-mono text-sm">{key}</p>
                          <p className="text-xs text-[var(--color-text-secondary)]">
                            {varName}
                          </p>
                          <p className="mt-1 text-xs text-[var(--color-text-secondary)]">
                            {hex}
                          </p>
                          <p className="mt-1 text-xs text-[var(--color-text-secondary)]">
                            bg: bg-{normalized} · text: text-{normalized}
                          </p>
                        </div>
                        <div
                          className="rounded px-3 py-1.5 text-xs font-mono"
                          style={{ backgroundColor: hex, color: labelColor }}
                        >
                          Aa
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="mb-16">
          <h2 className="mb-4 text-lg font-medium">Spacing</h2>
          <div className="space-y-4">
            {spacingEntries.map(([key, token]) => {
              const val = getSpacingValue(token) ?? 0;
              const varName = getSpacingVarName(key);
              const segment = key.replace(/\./g, "-");
              return (
                <div
                  key={key}
                  className="flex flex-wrap items-center gap-4 rounded-lg border border-[var(--color-border-border)] bg-[var(--color-surface-2)] p-4"
                >
                  <div className="min-w-0">
                    <p className="font-mono text-sm">{key}</p>
                    <p className="text-xs text-[var(--color-text-secondary)]">
                      {varName} · {val}px
                    </p>
                    <p className="mt-1 text-xs text-[var(--color-text-secondary)]">
                      {`p-[var(${varName})]`}
                    </p>
                  </div>
                  <div
                    className="h-6 rounded bg-[var(--color-accent-primary-500)] opacity-60"
                    style={{ width: Math.min(val * 4, 200) }}
                  />
                  <div
                    className="rounded border border-[var(--color-border-border)] bg-background"
                    style={{ padding: `var(${varName})` }}
                  >
                    <div className="h-4 w-4 rounded-sm bg-[var(--color-accent-primary-500)] opacity-40" />
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        <section>
          <h2 className="mb-4 text-lg font-medium">Radius</h2>
          <div className="space-y-4">
            {radiusEntries.map(([key, token]) => {
              const val = getSpacingValue(token) ?? 0;
              const varName = getRadiusVarName(key);
              return (
                <div
                  key={key}
                  className="flex flex-wrap items-center gap-4 rounded-lg border border-[var(--color-border-border)] bg-[var(--color-surface-2)] p-4"
                >
                  <div>
                    <p className="font-mono text-sm">{key}</p>
                    <p className="text-xs text-[var(--color-text-secondary)]">
                      {varName} · {val}px
                    </p>
                    <p className="mt-1 text-xs text-[var(--color-text-secondary)]">
                      {`rounded-[var(${varName})]`}
                    </p>
                  </div>
                  <div
                    className="h-12 w-12 shrink-0 rounded border border-[var(--color-border-border)] bg-[var(--color-accent-primary-500)] opacity-60"
                    style={{ borderRadius: `var(${varName})` }}
                  />
                </div>
              );
            })}
          </div>
        </section>
      </div>
    </div>
  );
}
