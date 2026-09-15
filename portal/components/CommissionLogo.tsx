import Image from "next/image";

/** Use the supplied Commission artwork; preserve its lettering and aspect ratio. */
export function CommissionLogo({
  variant = "color",
  className = "",
  priority = false,
}: {
  variant?: "color" | "light";
  className?: string;
  priority?: boolean;
}) {
  return <Image
    src={variant === "light" ? "/brand/customs-logo-light.png" : "/brand/customs-logo.png"}
    alt="Ethiopian Customs Commission"
    width={859}
    height={810}
    className={`commission-logo ${className}`}
    priority={priority}
  />;
}
