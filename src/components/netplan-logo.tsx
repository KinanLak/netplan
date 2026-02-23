import type { CSSProperties } from "react";
import { cn } from "@/lib/utils";

type NetplanLogoProps = {
  size?: number;
  className?: string;
};

const LOGO_LETTERS = ["N", "e", "t", "P", "l", "a", "n"] as const;

export function NetplanLogo({ size = 26, className }: NetplanLogoProps) {
  const logoStyle = {
    "--netplan-logo-size": `${size}px`,
  } as CSSProperties;

  return (
    <span
      className={cn("netplan-logo", className)}
      style={logoStyle}
      aria-label="Netplan"
    >
      <span className="netplan-logo__wordmark" aria-hidden="true">
        {LOGO_LETTERS.map((letter, index) => {
          const ratio = index / (LOGO_LETTERS.length - 1);
          const easedRatio = Math.pow(ratio, 1.35);
          const glowStrength = (0.12 + easedRatio * 0.62).toFixed(3);

          const letterStyle = {
            "--netplan-letter-glow": glowStrength,
          } as CSSProperties;

          return (
            <span
              key={`${letter}-${index}`}
              className="netplan-logo__letter"
              data-letter={letter}
              style={letterStyle}
            >
              {letter}
            </span>
          );
        })}
      </span>
    </span>
  );
}
