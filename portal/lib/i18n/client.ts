"use client";
import { createInstance } from "i18next";
import { initReactI18next } from "react-i18next";
import en from "./locales/en.json";
import am from "./locales/am.json";
export function createI18n() {
  const instance = createInstance();
  const savedLng = typeof window !== "undefined" ? localStorage.getItem("i18nextLng") || "en" : "en";
  const initialLng = savedLng === "am" ? "am" : "en";
  void instance.use(initReactI18next).init({
    resources: { en: { translation: en }, am: { translation: am } },
    lng: initialLng, fallbackLng: "en", supportedLngs: ["en", "am"],
    interpolation: { escapeValue: false }, initImmediate: false,
  });
  instance.on("languageChanged", (lng) => {
    if (typeof window !== "undefined") {
      localStorage.setItem("i18nextLng", lng);
      document.documentElement.lang = lng;
    }
  });
  return instance;
}
