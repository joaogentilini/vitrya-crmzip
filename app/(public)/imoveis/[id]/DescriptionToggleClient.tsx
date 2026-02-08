"use client";

import { useState } from "react";

export default function DescriptionToggleClient({ text }: { text: string }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div>
      <div
        style={
          expanded
            ? {
                lineHeight: 1.6,
              }
            : {
                display: "-webkit-box",
                WebkitLineClamp: 4,
                WebkitBoxOrient: "vertical",
                overflow: "hidden",
                lineHeight: 1.6,
              }
        }
      >
        {text}
      </div>

      <div style={{ display: "flex", justifyContent: "center" }}>
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          style={{
            marginTop: 10,
            background: "none",
            border: "none",
            padding: 0,
            color: "var(--primary)",
            fontWeight: 700,
            cursor: "pointer",
          }}
        >
          {expanded ? "Ler menos ▴" : "Ler mais ▾"}
        </button>
      </div>
    </div>
  );
}
