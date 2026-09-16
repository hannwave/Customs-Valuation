import { useTranslation } from "react-i18next";

type LogoProps = {
  variant?: "dark" | "light";
  className?: string;
  decorative?: boolean;
};

/** Frame the supplied artwork without the source files' clipped bottom text. */
export function CustomsLogo({ variant = "dark", className = "", decorative = false }: LogoProps) {
  return <span className={`customs-logo ${className}`} role={decorative ? undefined : "img"} aria-label={decorative ? undefined : "Ethiopia Customs Commission"} aria-hidden={decorative || undefined}>
    {/* The original transparent artwork is framed by the shared CSS viewport. */}
    {/* eslint-disable-next-line @next/next/no-img-element */}
    <img src={`/images/customs-logo-${variant}.png`} width={859} height={674} alt="" draggable={false}/>
  </span>;
}

export function Brand({ compact = false, variant = "light" }: { compact?: boolean; variant?: "dark" | "light" }) {
  const { t } = useTranslation();

  return <div className={`institution-brand ${compact ? "compact" : ""}`}>
    <CustomsLogo variant={variant} decorative/>
    <span className="institution-wordmark"><strong>{t("nav.ethioiaCustoms")}</strong><small>{t("nav.commission")}</small>{compact && <span className="institution-context">{t("nav.valuationWorkspace")}</span>}</span>
  </div>;
}
