"use client";
import { createInstance } from "i18next";
import { initReactI18next } from "react-i18next";
import en from "./locales/en.json";
import am from "./locales/am.json";
export function createI18n() {
  const instance = createInstance();
  void instance.use(initReactI18next).init({
    resources: { en: { translation: en }, am: { translation: am } },
    lng: "en", fallbackLng: "en", supportedLngs: ["en", "am"],
    interpolation: { escapeValue: false }, initImmediate: false,
  });
  return instance;
}
