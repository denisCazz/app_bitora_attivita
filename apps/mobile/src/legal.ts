import * as WebBrowser from "expo-web-browser";
import { API_URL } from "./api/client";

export type LegalPage = "privacy" | "terms" | "imprint";

const PATHS: Record<LegalPage, string> = { privacy: "/legal/privacy", terms: "/legal/terms", imprint: "/legal" };

export function legalUrl(page: LegalPage) {
  return `${API_URL}${PATHS[page]}`;
}

export function openLegal(page: LegalPage) {
  return WebBrowser.openBrowserAsync(legalUrl(page)).catch(() => undefined);
}
