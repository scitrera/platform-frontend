import { createContext, useContext, useEffect, useState, useSyncExternalStore } from "react"

type Theme = "dark" | "light" | "system"

interface ThemeProviderProps {
  children: React.ReactNode
  defaultTheme?: Theme
  storageKey?: string
  forcedTheme?: "dark" | "light"
}

interface ThemeProviderState {
  theme: Theme
  resolvedTheme: "dark" | "light"
  forcedTheme?: "dark" | "light"
  setTheme: (theme: Theme) => void
}

const ThemeProviderContext = createContext<ThemeProviderState>({
  theme: "system",
  resolvedTheme: "light",
  setTheme: () => null,
})

function getSystemTheme(): "dark" | "light" {
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"
}

function subscribeToSystemTheme(onChange: () => void) {
  const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)")
  mediaQuery.addEventListener("change", onChange)
  return () => mediaQuery.removeEventListener("change", onChange)
}

export function ThemeProvider({
  children,
  defaultTheme = "system",
  storageKey = "scitrera-ui-theme",
  forcedTheme,
}: ThemeProviderProps) {
  const [preferredTheme, setThemeState] = useState<Theme>(() => {
    const saved = localStorage.getItem(storageKey)
    return saved === "light" || saved === "dark" || saved === "system" ? saved : defaultTheme
  })
  const systemTheme = useSyncExternalStore(subscribeToSystemTheme, getSystemTheme)
  // A tenant policy takes precedence without overwriting the user's preference.
  const theme = forcedTheme ?? preferredTheme
  const resolvedTheme = theme === "system" ? systemTheme : theme

  useEffect(() => {
    const root = window.document.documentElement
    root.classList.remove("light", "dark")
    root.classList.add(resolvedTheme)
  }, [resolvedTheme])

  const setTheme = (newTheme: Theme) => {
    if (forcedTheme) return
    localStorage.setItem(storageKey, newTheme)
    setThemeState(newTheme)
  }

  return (
    <ThemeProviderContext.Provider value={{ theme, resolvedTheme, forcedTheme, setTheme }}>
      {children}
    </ThemeProviderContext.Provider>
  )
}

export function useTheme() {
  const context = useContext(ThemeProviderContext)
  if (context === undefined) {
    throw new Error("useTheme must be used within a ThemeProvider")
  }
  return context
}
