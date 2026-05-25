import {
  getBrandingSettingsApi,
  resetBrandingSettingsApi,
  saveBrandingSettingsApi,
  type BrandingSettings,
} from "./api";

const BRANDING_UPDATED_EVENT = "feedback:branding-updated";

const DEFAULT_BRANDING: BrandingSettings = {
  primaryColor: "#2A6FDB",
  accentColor: "#2FBF71",
  pageBackgroundColor: "#F5F7FA",
  logoDataUrl: null,
  voiceRecordingMaxSeconds: 120,
  botThinkSeconds: 3,
};

function clampVoiceMaxSeconds(value: unknown): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return DEFAULT_BRANDING.voiceRecordingMaxSeconds;
  return Math.min(600, Math.max(15, Math.round(n)));
}

function clampBotThinkSeconds(value: unknown): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return DEFAULT_BRANDING.botThinkSeconds;
  return Math.min(30, Math.max(1, Math.round(n)));
}

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
      accentColor: fetched.accentColor || DEFAULT_BRANDING.accentColor,
      pageBackgroundColor: fetched.pageBackgroundColor || DEFAULT_BRANDING.pageBackgroundColor,
      logoDataUrl: fetched.logoDataUrl || null,
      voiceRecordingMaxSeconds: clampVoiceMaxSeconds(fetched.voiceRecordingMaxSeconds),
      botThinkSeconds: clampBotThinkSeconds(fetched.botThinkSeconds),
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
  root.style.setProperty("--accent", settings.accentColor);
  root.style.setProperty("--ring", settings.primaryColor);
  root.style.setProperty("--background", settings.pageBackgroundColor);
}

export function onBrandingSettingsChange(callback: () => void): () => void {
  window.addEventListener(BRANDING_UPDATED_EVENT, callback);
  return () => {
    window.removeEventListener(BRANDING_UPDATED_EVENT, callback);
  };
}
