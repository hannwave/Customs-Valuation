"use client";

import { useEffect, useRef, type ForwardRefExoticComponent, type RefAttributes } from "react";

export type AnimatedIconHandle = { startAnimation: () => void; stopAnimation: () => void };
export type AnimatedIcon = ForwardRefExoticComponent<{ size?: number; className?: string } & RefAttributes<AnimatedIconHandle>>;

const reducedMotion = () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * An animated lucide icon that plays once when it scrolls into view (after `delay` ms) and again each time
 * `play` changes, e.g. when the card around it is hovered. Stays still for people who ask for reduced motion.
 */
export function LiveIcon({ icon: Icon, size = 24, play = 0, delay = 0 }: { icon: AnimatedIcon; size?: number; play?: number; delay?: number }) {
  const icon = useRef<AnimatedIconHandle>(null);
  const box = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (reducedMotion() || !box.current) return;
    let timer = 0;
    const observer = new IntersectionObserver(entries => {
      if (!entries.some(entry => entry.isIntersecting)) return;
      observer.disconnect();
      timer = window.setTimeout(() => icon.current?.startAnimation(), delay);
    }, { threshold: 0.6 });
    observer.observe(box.current);
    return () => { observer.disconnect(); window.clearTimeout(timer); };
  }, [delay]);

  useEffect(() => {
    if (play > 0 && !reducedMotion()) icon.current?.startAnimation();
  }, [play]);

  return <span ref={box} className="lp-live-icon" aria-hidden="true"><Icon ref={icon} size={size} /></span>;
}
