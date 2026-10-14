"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { FiCheck, FiChevronDown, FiGlobe } from "react-icons/fi";

export function LandingLanguageSelect() {
  const { i18n } = useTranslation();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const currentLang = i18n.resolvedLanguage === "am" ? "am" : "en";

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
      }
    }
    if (open) {
      document.addEventListener("mousedown", handleClickOutside);
      document.addEventListener("keydown", handleKeyDown);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  const selectLanguage = (lng: "en" | "am") => {
    void i18n.changeLanguage(lng);
    setOpen(false);
  };

  return (
    <div className="landing-language-dropdown" ref={containerRef}>
      <button
        type="button"
        className={`landing-language ${open ? "is-open" : ""}`}
        onClick={() => setOpen((prev) => !prev)}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-label="Select language"
        title="Change language / ቋንቋ ቀይር"
      >
        <FiGlobe aria-hidden="true" />
        <span>{currentLang === "am" ? "አማ (AM)" : "EN"}</span>
        <FiChevronDown aria-hidden="true" />
      </button>

      {open && (
        <ul className="landing-language-menu" role="listbox" aria-label="Languages">
          <li>
            <button
              type="button"
              className={`landing-language-item ${currentLang === "en" ? "is-selected" : ""}`}
              onClick={() => selectLanguage("en")}
              role="option"
              aria-selected={currentLang === "en"}
            >
              <span>English</span>
              {currentLang === "en" ? <FiCheck aria-hidden="true" /> : <small>EN</small>}
            </button>
          </li>
          <li>
            <button
              type="button"
              className={`landing-language-item ${currentLang === "am" ? "is-selected" : ""}`}
              onClick={() => selectLanguage("am")}
              role="option"
              aria-selected={currentLang === "am"}
            >
              <span>አማርኛ</span>
              {currentLang === "am" ? <FiCheck aria-hidden="true" /> : <small>AM</small>}
            </button>
          </li>
        </ul>
      )}
    </div>
  );
}
