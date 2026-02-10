import React from "react";

type IconProps = {
  name: string;
  size?: number;
  className?: string;
  title?: string;
};

/**
 * Ícones críticos em SVG para NÃO depender do font Material Symbols em produção.
 * Se não tiver no map, cai pro material-symbols-rounded (dev/local).
 */
const SvgIcon = ({ name, size = 18 }: { name: string; size: number }) => {
  const common = {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "currentColor",
    xmlns: "http://www.w3.org/2000/svg",
    "aria-hidden": "true" as const,
  };

  switch (name) {
    case "location_on":
      return (
        <svg {...common}>
          <path d="M12 2c-3.86 0-7 3.14-7 7 0 5.25 7 13 7 13s7-7.75 7-13c0-3.86-3.14-7-7-7zm0 9.5A2.5 2.5 0 1 1 12 6a2.5 2.5 0 0 1 0 5.5z" />
        </svg>
      );

    case "chevron_right":
      return (
        <svg {...common}>
          <path d="M9.29 6.71a1 1 0 0 1 1.42 0L15 11l-4.29 4.29a1 1 0 1 1-1.42-1.42L12.17 11 9.29 8.12a1 1 0 0 1 0-1.41z" />
        </svg>
      );

    case "straighten":
      return (
        <svg {...common}>
          <path d="M21 6H3c-1.1 0-2 .9-2 2v8c0 1.1.9 2 2 2h18c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2zm0 10H3V8h2v2h2V8h2v2h2V8h2v2h2V8h2v2h2V8h2v8z" />
        </svg>
      );

    case "foundation":
      return (
        <svg {...common}>
          <path d="M12 3 2 9v2h20V9L12 3zm8 10H4v8h16v-8zM7 15h2v4H7v-4zm4 0h2v4h-2v-4zm4 0h2v4h-2v-4z" />
        </svg>
      );

    case "bed":
      return (
        <svg {...common}>
          <path d="M21 10.5V7c0-1.1-.9-2-2-2H5C3.9 5 3 5.9 3 7v3.5c0 .83.67 1.5 1.5 1.5H5v1H3v6h2v-2h14v2h2v-6h-2v-1h.5c.83 0 1.5-.67 1.5-1.5zM5 7h14v3H5V7z" />
        </svg>
      );

    case "king_bed":
      return (
        <svg {...common}>
          <path d="M21 10V7c0-1.1-.9-2-2-2H5C3.9 5 3 5.9 3 7v3c0 1.1.9 2 2 2h.5v1H3v6h2v-2h14v2h2v-6h-2.5v-1H19c1.1 0 2-.9 2-2zM5 7h14v3H5V7z" />
        </svg>
      );

    case "bathtub":
      return (
        <svg {...common}>
          <path d="M7 6c0-1.66 1.34-3 3-3h2v2h-2c-.55 0-1 .45-1 1v2h9V6h2v4H4V8c0-1.1.9-2 2-2h1V6zm14 6H3v2c0 2.21 1.79 4 4 4h10c2.21 0 4-1.79 4-4v-2z" />
        </svg>
      );

    case "directions_car":
      return (
        <svg {...common}>
          <path d="M18.92 6.01A2 2 0 0 0 17.04 5H6.96a2 2 0 0 0-1.88 1.01L3 10v9c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-1h12v1c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-9l-2.08-3.99zM6.5 15A1.5 1.5 0 1 1 8 13.5 1.5 1.5 0 0 1 6.5 15zm11 0A1.5 1.5 0 1 1 19 13.5 1.5 1.5 0 0 1 17.5 15zM5.81 10l1.04-2h10.3l1.04 2H5.81z" />
        </svg>
      );

    default:
      return null;
  }
};

export function Icon({ name, size = 18, className, title }: IconProps) {
  // whatsapp já era svg
  if (name === "whatsapp") {
    return (
      <span
        className={className}
        title={title}
        aria-hidden={title ? undefined : true}
        style={{
          width: size,
          height: size,
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <svg
          width={size}
          height={size}
          viewBox="0 0 24 24"
          fill="currentColor"
          xmlns="http://www.w3.org/2000/svg"
          aria-hidden="true"
        >
          <path d="M12.04 2C6.58 2 2.16 6.42 2.16 11.88c0 2.1.55 4.15 1.6 5.95L2 22l4.29-1.73a9.82 9.82 0 005.75 1.82h.01c5.46 0 9.88-4.42 9.88-9.88C21.93 6.42 17.5 2 12.04 2zm0 17.93h-.01a8.1 8.1 0 01-4.13-1.13l-.3-.18-2.55 1.03.84-2.63-.2-.31a8.02 8.02 0 01-1.24-4.83c0-4.45 3.62-8.07 8.08-8.07 4.45 0 8.07 3.62 8.07 8.07 0 4.46-3.62 8.08-8.06 8.08zm4.43-6.02c-.24-.12-1.42-.7-1.64-.78-.22-.08-.38-.12-.54.12-.16.24-.62.78-.76.94-.14.16-.28.18-.52.06-.24-.12-1-.37-1.9-1.18-.7-.63-1.18-1.41-1.32-1.65-.14-.24-.01-.37.11-.49.11-.11.24-.28.36-.42.12-.14.16-.24.24-.4.08-.16.04-.3-.02-.42-.06-.12-.54-1.3-.74-1.78-.2-.48-.4-.42-.54-.43l-.46-.01c-.16 0-.42.06-.64.3-.22.24-.84.82-.84 2s.86 2.32.98 2.48c.12.16 1.7 2.6 4.12 3.64.58.25 1.03.4 1.38.51.58.18 1.1.15 1.52.09.46-.07 1.42-.58 1.62-1.14.2-.56.2-1.04.14-1.14-.06-.1-.22-.16-.46-.28z" />
        </svg>
      </span>
    );
  }

  // ✅ tenta SVG primeiro
  const svg = <SvgIcon name={name} size={size} />;
  if ((svg as any).type) {
    return (
      <span
        className={className}
        title={title}
        aria-hidden={title ? undefined : true}
        style={{
          width: size,
          height: size,
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          lineHeight: 1,
        }}
      >
        {svg}
      </span>
    );
  }

  // fallback (dev/local)
  const style: React.CSSProperties = {
    fontSize: size,
    lineHeight: 1,
    display: "inline-flex",
    alignItems: "center",
  };

  return (
    <span
      className={`material-symbols-rounded${className ? ` ${className}` : ""}`}
      style={style}
      aria-hidden={title ? undefined : true}
      title={title}
    >
      {name}
    </span>
  );
}
