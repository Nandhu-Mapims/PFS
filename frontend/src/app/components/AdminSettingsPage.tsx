import React, { useEffect, useState } from "react";
import feedbackLogo from "./image/feedback_logo.png";
import {
  getBrandingSettings,
  loadBrandingSettings,
  onBrandingSettingsChange,
  resetBrandingSettings,
  saveBrandingSettings,
} from "../lib/branding";

export function AdminSettingsPage() {
  const [brandPrimary, setBrandPrimary] = useState("#2A6FDB");
  const [brandPageBg, setBrandPageBg] = useState("#F5F7FA");
  const [brandLogoDataUrl, setBrandLogoDataUrl] = useState<string | null>(null);
  const [logoError, setLogoError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [bannerMessage, setBannerMessage] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    void loadBrandingSettings().then((next) => {
      if (!alive) return;
      setBrandPrimary(next.primaryColor);
      setBrandPageBg(next.pageBackgroundColor);
      setBrandLogoDataUrl(next.logoDataUrl);
    });
    const unsubscribe = onBrandingSettingsChange(() => {
      const updated = getBrandingSettings();
      setBrandPrimary(updated.primaryColor);
      setBrandPageBg(updated.pageBackgroundColor);
      setBrandLogoDataUrl(updated.logoDataUrl);
    });
    return () => {
      alive = false;
      unsubscribe();
    };
  }, []);

  async function saveBranding() {
    try {
      setIsSaving(true);
      setBannerMessage(null);
      await saveBrandingSettings({
        primaryColor: brandPrimary,
        pageBackgroundColor: brandPageBg,
        logoDataUrl: brandLogoDataUrl,
      });
      setBannerMessage("Branding saved successfully.");
    } catch {
      setBannerMessage("Failed to save branding. Please try again.");
    } finally {
      setIsSaving(false);
    }
  }

  function handleLogoUpload(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setLogoError("Please upload an image file.");
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      setLogoError("Logo size must be under 2MB.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const value = typeof reader.result === "string" ? reader.result : null;
      setBrandLogoDataUrl(value);
      setLogoError(null);
    };
    reader.onerror = () => {
      setLogoError("Unable to read logo file.");
    };
    reader.readAsDataURL(file);
  }

  function clearCustomLogo() {
    setBrandLogoDataUrl(null);
    setLogoError(null);
  }

  async function restoreDefaultBranding() {
    try {
      setIsSaving(true);
      const defaults = await resetBrandingSettings();
      setBrandPrimary(defaults.primaryColor);
      setBrandPageBg(defaults.pageBackgroundColor);
      setBrandLogoDataUrl(defaults.logoDataUrl);
      setLogoError(null);
      setBannerMessage("Branding reset to defaults.");
    } catch {
      setBannerMessage("Failed to reset branding. Please try again.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="w-full">
      <div className="mb-6">
        <h2 className="text-3xl md:text-4xl font-bold text-gray-800">Admin Settings</h2>
        <p className="text-base md:text-lg text-gray-600 mt-2">
          Customize application theme and branding.
        </p>
      </div>

      <div className="bg-white rounded-xl shadow-md p-5">
        {bannerMessage && (
          <p className="mb-4 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-700">
            {bannerMessage}
          </p>
        )}
        <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
          <div>
            <h3 className="text-lg font-semibold text-gray-800">Theme customization</h3>
            <p className="text-sm text-gray-600 mt-1">
              Update app colors and replace the logo shown in header and QR poster.
            </p>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={restoreDefaultBranding}
              disabled={isSaving}
              className="px-3 py-2 rounded-lg border border-gray-300 text-sm font-semibold text-gray-700 hover:bg-gray-50"
            >
              Reset defaults
            </button>
            <button
              type="button"
              onClick={() => void saveBranding()}
              disabled={isSaving}
              className="px-4 py-2 rounded-lg text-white text-sm font-semibold"
              style={{ backgroundColor: brandPrimary }}
            >
              {isSaving ? "Saving..." : "Save branding"}
            </button>
          </div>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <label className="flex flex-col gap-2">
            <span className="text-sm font-medium text-gray-700">Primary color</span>
            <input
              type="color"
              value={brandPrimary}
              onChange={(e) => setBrandPrimary(e.target.value)}
              className="h-10 w-20 rounded border border-gray-300 bg-white p-1"
            />
          </label>
          <label className="flex flex-col gap-2">
            <span className="text-sm font-medium text-gray-700">Page background color</span>
            <input
              type="color"
              value={brandPageBg}
              onChange={(e) => setBrandPageBg(e.target.value)}
              className="h-10 w-20 rounded border border-gray-300 bg-white p-1"
            />
          </label>
        </div>
        <div className="mt-5 rounded-lg border border-gray-200 p-4 bg-gray-50">
          <p className="text-sm font-semibold text-gray-800 mb-2">Logo replace area</p>
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
            <img
              src={brandLogoDataUrl || feedbackLogo}
              alt="Current app logo"
              className="h-14 w-auto max-w-[200px] object-contain bg-white border border-gray-200 rounded-md px-2 py-1"
            />
            <div className="flex flex-wrap gap-2">
              <label className="px-3 py-2 rounded-lg border border-gray-300 text-sm font-semibold text-gray-700 hover:bg-white cursor-pointer">
                Upload logo
                <input type="file" accept="image/*" className="hidden" onChange={handleLogoUpload} />
              </label>
              <button
                type="button"
                onClick={clearCustomLogo}
                className="px-3 py-2 rounded-lg border border-gray-300 text-sm font-semibold text-gray-700 hover:bg-white"
              >
                Use default logo
              </button>
            </div>
          </div>
          {logoError && <p className="text-sm text-red-600 mt-2">{logoError}</p>}
          <p className="text-xs text-gray-500 mt-2">
            Supported: image files up to 2MB. Click Save branding to apply.
          </p>
        </div>
      </div>
    </div>
  );
}
