import type { HTMLAttributes, ReactNode } from "react";
import styles from "./Card.module.css";

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  padding?: "sm" | "md" | "lg";
}

/** Base surface primitive for dashboard cards, panels, and grouped content. */
export function Card({ children, padding = "md", className, ...rest }: CardProps) {
  return (
    <div className={[styles.card, styles[`pad-${padding}`], className].filter(Boolean).join(" ")} {...rest}>
      {children}
    </div>
  );
}
