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
  return <div className={`institution-brand ${compact ? "compact" : ""}`}>
    <CustomsLogo variant={variant} decorative/>
    <span className="institution-wordmark"><strong>ETHIOPIA CUSTOMS</strong><small>COMMISSION</small>{compact && <span className="institution-context">VALUATION WORKSPACE</span>}</span>
  </div>;
}
