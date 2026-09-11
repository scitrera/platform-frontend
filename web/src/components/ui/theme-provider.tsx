import { createContext, useContext, useEffect, useState } from "react"

type Theme = "dark" | "light" | "system"

interface ThemeProviderProps {
  children: React.ReactNode
  defaultTheme?: Theme
  storageKey?: string
}

interface ThemeProviderState {
  theme: Theme
  resolvedTheme: "dark" | "light"
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

export function ThemeProvider({
  children,
  defaultTheme = "system",
  storageKey = "scitrera-ui-theme",
}: ThemeProviderProps) {
  const [theme, setThemeState] = useState<Theme>(
    () => (localStorage.getItem(storageKey) as Theme) || defaultTheme
  )

  const resolvedTheme = theme === "system" ? getSystemTheme() : theme

  useEffect(() => {
    const root = window.document.documentElement
    root.classList.remove("light", "dark")
    root.classList.add(resolvedTheme)
  }, [resolvedTheme])

  // Listen for system theme changes when in "system" mode
  useEffect(() => {
    if (theme !== "system") return

    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)")
    const handler = () => {
      const root = window.document.documentElement
      root.classList.remove("light", "dark")
      root.classList.add(getSystemTheme())
    }
    mediaQuery.addEventListener("change", handler)
    return () => mediaQuery.removeEventListener("change", handler)
  }, [theme])

  const setTheme = (newTheme: Theme) => {
    localStorage.setItem(storageKey, newTheme)
    setThemeState(newTheme)
  }

  return (
    <ThemeProviderContext.Provider value={{ theme, resolvedTheme, setTheme }}>
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
