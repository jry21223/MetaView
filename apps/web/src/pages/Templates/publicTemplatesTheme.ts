import { createContext, useContext } from "react";

export const publicTemplatesThemeContext = createContext<"dark" | "light">("light");

export function usePublicTemplatesTheme(): "dark" | "light" {
  return useContext(publicTemplatesThemeContext);
}
