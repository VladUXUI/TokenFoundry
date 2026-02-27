const config = {
    content: [
        "./pages/**/*.{js,ts,jsx,tsx,mdx}",
        "./components/**/*.{js,ts,jsx,tsx,mdx}",
        "./app/**/*.{js,ts,jsx,tsx,mdx}",
    ],
    darkMode: "class",
    theme: {
        extend: {
            colors: {
                background: "var(--background)",
                foreground: "var(--foreground)",
                surface: {
                    1: "var(--color-surface-1)",
                    2: "var(--color-surface-2)",
                },
                "text-primary": "var(--color-text-primary)",
                "text-secondary": "var(--color-text-secondary)",
                accent: {
                    lime: "var(--color-accent-lime)",
                    primary: {
                        100: "var(--color-accent-primary-100)",
                        500: "var(--color-accent-primary-500)",
                    },
                },
                button: {
                    main: "var(--color-button-main)",
                    content: "var(--color-button-content)",
                },
                pill: {
                    surface: "var(--color-pill-surface)",
                    text: "var(--color-pill-text)",
                },
                border: {
                    border: "var(--color-border-border)",
                },
            },
            spacing: {
                2: "var(--spacing-2)",
                4: "var(--spacing-4)",
                8: "var(--spacing-8)",
                12: "var(--spacing-12)",
                16: "var(--spacing-16)",
                24: "var(--spacing-24)",
            },
            borderRadius: {
                sm: "var(--radius-sm)",
                m: "var(--radius-m)",
                lg: "var(--radius-lg)",
                full: "var(--radius-full)",
            },
        },
    },
    plugins: [],
};
export default config;
