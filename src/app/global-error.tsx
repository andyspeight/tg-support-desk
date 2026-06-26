"use client";

import { useEffect } from "react";

// Ultimate backstop: replaces the root layout if it ever throws. Rarely hit, so
// it uses inline styles (the app stylesheet may not have loaded) and renders its
// own <html>/<body> as Next requires.
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("Global error boundary:", error);
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: "ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
          background: "#f8fafc",
          color: "#0f172a",
          padding: "24px",
        }}
      >
        <div
          style={{
            maxWidth: "28rem",
            width: "100%",
            textAlign: "center",
            border: "1px solid #e2e8f0",
            borderRadius: "12px",
            background: "#ffffff",
            padding: "24px",
            boxShadow: "0 1px 2px rgba(0,0,0,0.05)",
          }}
        >
          <h1 style={{ fontSize: "1rem", fontWeight: 600, margin: "0 0 6px" }}>Something went wrong</h1>
          <p style={{ fontSize: "0.875rem", color: "#475569", margin: "0 0 20px" }}>
            That didn’t go through. Please try again.
          </p>
          <button
            onClick={reset}
            style={{
              border: "none",
              borderRadius: "6px",
              background: "#2563eb",
              color: "#ffffff",
              fontSize: "0.875rem",
              fontWeight: 500,
              padding: "8px 14px",
              cursor: "pointer",
            }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
