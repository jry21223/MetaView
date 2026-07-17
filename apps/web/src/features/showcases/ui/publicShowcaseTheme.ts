import { createContext, useContext } from "react";

export const publicShowcaseThemeContext = createContext<"light" | "dark">("light");

export function usePublicShowcaseTheme(): "light" | "dark" {
  return useContext(publicShowcaseThemeContext);
}
