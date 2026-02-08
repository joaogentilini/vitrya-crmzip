import React from "react";

type IconProps = {
  name: string;
  size?: number;
  className?: string;
  fill?: 0 | 1;
  weight?: number;
  grade?: number;
  title?: string;
};

export function Icon({
  name,
  size = 18,
  className,
  fill = 0,
  weight = 400,
  grade = 0,
  title,
}: IconProps) {
  /* ===============================
   * ÍCONE ESPECIAL: WHATSAPP
   * =============================== */
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

  /* ===============================
   * MATERIAL SYMBOLS (DEFAULT)
   * =============================== */
  const style: React.CSSProperties = {
    fontVariationSettings: `'FILL' ${fill}, 'wght' ${weight}, 'GRAD' ${grade}, 'opsz' ${size}`,
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
