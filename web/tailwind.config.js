import tailwindTypography from "@tailwindcss/typography";

/** @type {import('tailwindcss').Config} */
export default { // Changed to ES module export
    darkMode: 'class',
    content: [
        "./index.html", // Important for Vite to scan the root index.html
        "./src/**/*.{js,ts,jsx,tsx}", // obviously we need frontend jsx files for Tailwind scanning
        "../backend/**/*.{js,ts,jsx,tsx}", // Added backend jsx files for Tailwind scanning
    ],
    // safelist: [
    //     // --- Static Individual Classes ---
    //     'bg-white',
    //     'border',
    //     'border-transparent',
    //     'flex',
    //     'flex-col',
    //     'font-bold',
    //     'font-medium',
    //     'font-normal',
    //     'font-sans',
    //     'font-semibold',
    //     'from-white',
    //     'grid',
    //     'grid-cols-1',
    //     'grid-cols-2',
    //     'grid-cols-3',
    //     'items-center',
    //     'justify-between',
    //     'last:border-0',
    //     'max-w-7xl',
    //     'min-h-screen',
    //     'mx-auto',
    //     'to-white',
    //     'tracking-tight',
    //     'transition-all',
    //     'transition-colors',
    //     'truncate',
    //     '-mb-px',
    //     'gap-6',
    //     'space-y-6',
    //     'mb-6',
    //     'mb-8',
    //     'lg:mb-0',
    //
    //     // --- Patterns for Colors (bg, text, border, from, to) ---
    //     {
    //         pattern: /(bg|text|border|from|to)-(slate)-(50|100|200|300|500|600|700|800|900)/,
    //     },
    //     {
    //         // Covers opacities like bg-slate-50/75
    //         pattern: /(bg|border)-(slate)-(50|200)\/(60|75|80)/,
    //     },
    //     {
    //         pattern: /(bg|text|border|from)-(green|blue|indigo|emerald|red)-(50|500|600)/,
    //     },
    //
    //     // --- Patterns for Sizing (width, height, padding, margin, gap, text-size) ---
    //     {
    //         pattern: /([wh])-(2|3|4|5|6|full)/,
    //     },
    //     {
    //         pattern: /p-([3468])/,
    //     },
    //     {
    //         pattern: /(px|py)-([234])/,
    //     },
    //     {
    //         pattern: /(m[trblxy]?)-([23468]|1.5)/, // covers mt-2, mr-3, ml-1.5 etc.
    //     },
    //     {
    //         pattern: /(gap|space-y)-([36])/,
    //     },
    //     {
    //         pattern: /text-(xs|sm|lg|xl|2xl|3xl|4xl)/,
    //     },
    //
    //     // --- Patterns for Shadows ---
    //     {
    //         pattern: /shadow-(md|lg|xl)/,
    //     },
    //     {
    //         pattern: /hover:shadow-(xl)/,
    //     },
    //
    //     // --- Patterns for Borders & Rounded Corners ---
    //     {
    //         pattern: /rounded-(lg|2xl|full|t-md)/,
    //     },
    //     {
    //         pattern: /border-b(-2)?/,
    //     },
    //
    //     // --- Patterns for Transitions & Durations ---
    //     {
    //         pattern: /duration-(200|300)/,
    //     },
    //
    //     // --- Patterns for Responsive Prefixes (sm, lg) ---
    //     {
    //         pattern: /(sm|md|lg):.*/,
    //         // pattern: /(sm|md|lg):(p|text|grid-cols|col-span)-(.*)/,
    //     },
    //
    //     // --- Patterns for Hover States ---
    //     {
    //         pattern: /hover:(bg|text|border)-(.*)/,
    //     }
    // ],

    // Generate ALL utilities and their common variants
    // safelist: [
    //     {
    //         pattern: /.*/, // match any utility name
    //         variants: [
    //             "sm", "md", "lg", "xl", "2xl",
    //             "hover", "focus", "active", "disabled",
    //             "focus-visible", "group-hover", "focus-within",
    //             "first", "last", "odd", "even",
    //             "dark"
    //         ],
    //     },
    //     // include plugin classes you rely on explicitly
    //     "prose", "prose-sm", "prose-lg", "prose-invert"
    // ],
    theme: {
        extend: {
            animation: {
                fadeIn: 'fadeIn 0.3s ease-out forwards',
            },
            keyframes: {
                fadeIn: {
                    '0%': {opacity: '0', transform: 'translateY(-10px)'},
                    '100%': {opacity: '1', transform: 'translateY(0)'},
                },
            },
            maxWidth: {
                '2xl': '42rem',
                '3xl': '63rem',
            },
            // Theme token bridge: use CSS custom properties so tenant themes auto-apply
            // Usage: bg-theme-accent, text-theme-page, border-theme-sidebar-border, etc.
            colors: {
                theme: {
                    'page-bg': 'var(--theme-page-bg)',
                    'page-text': 'var(--theme-page-text)',
                    'page-text-secondary': 'var(--theme-page-text-secondary)',
                    'page-text-muted': 'var(--theme-page-text-muted)',
                    'header-bg': 'var(--theme-header-bg)',
                    'header-text': 'var(--theme-header-text)',
                    'header-border': 'var(--theme-header-border)',
                    'sidebar-bg': 'var(--theme-sidebar-bg)',
                    'sidebar-text': 'var(--theme-sidebar-text)',
                    'sidebar-text-muted': 'var(--theme-sidebar-text-muted)',
                    'sidebar-border': 'var(--theme-sidebar-border)',
                    'sidebar-hover-bg': 'var(--theme-sidebar-hover-bg)',
                    'sidebar-active-bg': 'var(--theme-sidebar-active-bg)',
                    'sidebar-active-text': 'var(--theme-sidebar-active-text)',
                    // Collapsed sidebar uses a dedicated dark chrome distinct
                    // from the expanded (light) sidebar — see App.css for the
                    // CSS variable defaults in light + dark modes.
                    'sidebar-collapsed-bg': 'var(--theme-sidebar-collapsed-bg)',
                    'sidebar-collapsed-text': 'var(--theme-sidebar-collapsed-text)',
                    'accent': 'var(--theme-accent)',
                    'accent-hover': 'var(--theme-accent-hover)',
                    'accent-foreground': 'var(--theme-accent-foreground)',
                    'accent-light': 'var(--theme-accent-light)',
                    'accent-muted': 'var(--theme-accent-muted)',
                    'card-bg': 'var(--theme-card-bg)',
                    'card-border': 'var(--theme-card-border)',
                    'input-bg': 'var(--theme-input-bg)',
                    'input-border': 'var(--theme-input-border)',
                    'input-focus-ring': 'var(--theme-input-focus-ring)',
                    'input-text': 'var(--theme-input-text)',
                    'input-placeholder': 'var(--theme-input-placeholder)',
                    'border': 'var(--theme-border)',
                    'border-muted': 'var(--theme-border-muted)',
                    'success': 'var(--theme-success)',
                    'success-bg': 'var(--theme-success-bg)',
                    'warning': 'var(--theme-warning)',
                    'warning-bg': 'var(--theme-warning-bg)',
                    'error': 'var(--theme-error)',
                    'error-bg': 'var(--theme-error-bg)',
                    'info': 'var(--theme-info)',
                    'info-bg': 'var(--theme-info-bg)',
                    'chat-bg': 'var(--theme-chat-bg)',
                    'chat-user-bg': 'var(--theme-chat-user-bg)',
                    'chat-ai-bg': 'var(--theme-chat-ai-bg)',
                    'chat-input-bg': 'var(--theme-chat-input-bg)',
                    'focus-ring': 'var(--theme-focus-ring)',
                },
            },
        },
    },
    plugins: [
        tailwindTypography
    ],
}
