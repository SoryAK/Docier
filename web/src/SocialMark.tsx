import type { ComponentType, ReactNode, SVGProps } from "react";

export type SocialMarkKind = "linkedin" | "github" | "site" | "instagram" | "facebook" | "x" | "youtube";

const filled = { fill: "currentColor", stroke: "none" } as const;
const outline = { fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round", strokeLinejoin: "round" } as const;

/** Marks for a link: a social account, GitHub, or any other site (a globe). Each part sets its own fill, so the mark draws the same wherever it sits. */
export function SocialMark({ kind, ...props }: { kind: SocialMarkKind } & SVGProps<SVGSVGElement>) {
  const svg = (children: ReactNode) => (
    <svg viewBox="0 0 24 24" aria-hidden="true" {...props}>
      {children}
    </svg>
  );
  if (kind === "linkedin") {
    return svg(
      <path
        {...filled}
        d="M4.7 3.2a1.7 1.7 0 1 0 .02 3.4 1.7 1.7 0 0 0-.02-3.4ZM3.2 8.4h3.1V20.8H3.2V8.4Zm5 0h3v1.7h.04c.42-.8 1.44-1.64 2.96-1.64 3.17 0 3.76 2.08 3.76 4.79v7.55h-3.1v-6.7c0-1.6-.03-3.66-2.23-3.66-2.23 0-2.57 1.74-2.57 3.54v6.82H8.2V8.4Z"
      />,
    );
  }
  if (kind === "github") {
    return svg(
      <path
        {...filled}
        d="M12 2C6.48 2 2 6.58 2 12.26c0 4.52 2.87 8.35 6.84 9.7.5.1.68-.22.68-.49 0-.24-.01-.87-.01-1.71-2.78.62-3.37-1.37-3.37-1.37-.45-1.18-1.11-1.5-1.11-1.5-.91-.64.07-.63.07-.63 1 .07 1.53 1.06 1.53 1.06.9 1.57 2.36 1.12 2.94.86.09-.67.35-1.12.63-1.38-2.22-.26-4.55-1.14-4.55-5.07 0-1.12.39-2.03 1.03-2.75-.1-.26-.45-1.3.1-2.71 0 0 .84-.27 2.75 1.05a9.3 9.3 0 0 1 5 0c1.91-1.32 2.75-1.05 2.75-1.05.55 1.41.2 2.45.1 2.71.64.72 1.03 1.63 1.03 2.75 0 3.94-2.34 4.8-4.57 5.06.36.32.68.94.68 1.9 0 1.38-.01 2.49-.01 2.83 0 .27.18.6.69.49A10.04 10.04 0 0 0 22 12.26C22 6.58 17.52 2 12 2Z"
      />,
    );
  }
  if (kind === "instagram") {
    return svg(
      <>
        <rect {...outline} x="3.5" y="3.5" width="17" height="17" rx="5" />
        <circle {...outline} cx="12" cy="12" r="3.9" />
        <circle {...filled} cx="17.2" cy="6.8" r="1.1" />
      </>,
    );
  }
  if (kind === "facebook") {
    return svg(
      <path
        {...filled}
        d="M13.4 21v-7.6h2.55l.4-3h-2.95V8.5c0-.86.26-1.45 1.5-1.45h1.57V4.38c-.27-.04-1.2-.12-2.29-.12-2.27 0-3.82 1.38-3.82 3.92v2.22H7.8v3h2.56V21h3.04Z"
      />,
    );
  }
  if (kind === "x") {
    return svg(
      <>
        <path {...filled} d="M4.2 4h4.6l11 16h-4.6L4.2 4Z" />
        <path {...outline} d="M19.4 4l-6.2 7M10.8 13 4.6 20" />
      </>,
    );
  }
  if (kind === "youtube") {
    return svg(
      <>
        <rect {...outline} x="2.75" y="5.5" width="18.5" height="13" rx="4" />
        <path {...filled} d="M10 9.2v5.6l4.9-2.8L10 9.2Z" />
      </>,
    );
  }
  return svg(
    <>
      <circle cx="12" cy="12" r="8.25" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <path
        d="M3.75 12h16.5M12 3.75c2.15 2.25 3.25 5.05 3.25 8.25s-1.1 6-3.25 8.25c-2.15-2.25-3.25-5.05-3.25-8.25s1.1-6 3.25-8.25Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
      />
    </>,
  );
}

/** A mark as an icon component, for places that take one, like a settings row. */
export function socialMarkIcon(kind: SocialMarkKind): ComponentType<SVGProps<SVGSVGElement>> {
  const MarkIcon = (props: SVGProps<SVGSVGElement>) => <SocialMark kind={kind} {...props} />;
  MarkIcon.displayName = `SocialMark(${kind})`;
  return MarkIcon;
}
