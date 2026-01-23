"use client";

import { useEffect, useState } from "react";

export function ClientDate({
  iso,
  locale = "pt-BR",
  options,
}: {
  iso: string | null | undefined;
  locale?: string;
  options?: Intl.DateTimeFormatOptions;
}) {
  const [text, setText] = useState<string>("—");

  useEffect(() => {
    if (!iso) {
      setText("—");
      return;
    }
    const d = new Date(iso);
    setText(d.toLocaleDateString(locale, options));
  }, [iso, locale, options]);

  return <span suppressHydrationWarning>{text}</span>;
}
