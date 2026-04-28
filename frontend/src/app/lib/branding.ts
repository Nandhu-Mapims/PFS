import {
  getBrandingSettingsApi,
  resetBrandingSettingsApi,
  saveBrandingSettingsApi,
  type BrandingSettings,
} from "./api";

const BRANDING_UPDATED_EVENT = "feedback:branding-updated";

const DEFAULT_BRANDING: BrandingSettings = {
  primaryColor: "#2A6FDB",
  pageBackgroundColor: "#F5F7FA",
  logoDataUrl: null,
};

let brandingCache: BrandingSettings = DEFAULT_BRANDING;

export function getBrandingSettings(): BrandingSettings {
  return brandingCache;
}

function setBrandingCache(next: BrandingSettings): BrandingSettings {
  brandingCache = next;
  window.dispatchEvent(new CustomEvent(BRANDING_UPDATED_EVENT));
  return brandingCache;
}

export async function loadBrandingSettings(): Promise<BrandingSettings> {
  try {
    const fetched = await getBrandingSettingsApi();
    return setBrandingCache({
      primaryColor: fetched.primaryColor || DEFAULT_BRANDING.primaryColor,
      pageBackgroundColor: fetched.pageBackgroundColor || DEFAULT_BRANDING.pageBackgroundColor,
      logoDataUrl: fetched.logoDataUrl || null,
    });
  } catch {
    return brandingCache;
  }
}

export async function saveBrandingSettings(
  settings: BrandingSettings
): Promise<BrandingSettings> {
  const saved = await saveBrandingSettingsApi(settings);
  return setBrandingCache(saved);
}

export async function resetBrandingSettings(): Promise<BrandingSettings> {
  const reset = await resetBrandingSettingsApi();
  return setBrandingCache(reset);
}

export function applyBrandingTheme(settings: BrandingSettings): void {
  const root = document.documentElement;
  root.style.setProperty("--primary", settings.primaryColor);
  root.style.setProperty("--ring", settings.primaryColor);
  root.style.setProperty("--background", settings.pageBackgroundColor);
}

export function onBrandingSettingsChange(callback: () => void): () => void {
  window.addEventListener(BRANDING_UPDATED_EVENT, callback);
  return () => {
    window.removeEventListener(BRANDING_UPDATED_EVENT, callback);
  };
}
