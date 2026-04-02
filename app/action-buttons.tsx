"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function ActionButtons() {
  const router = useRouter();
  const [sharing, setSharing] = useState(false);

  async function shareToWhatsApp() {
    setSharing(true);
    try {
      const res = await fetch("/api/export.xlsx");
      if (!res.ok) throw new Error("Download failed");

      const blob = await res.blob();
      const fileName =
        res.headers
          .get("content-disposition")
          ?.match(/filename="?([^"]+)"?/)?.[1] ?? "export.xlsx";

      const file = new File([blob], fileName, {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });

      // Try native share (works on mobile with WhatsApp)
      let shared = false;
      try {
        if (navigator.canShare?.({ files: [file] })) {
          await navigator.share({ files: [file], title: fileName, text: "Sales report" });
          shared = true;
        }
      } catch (shareErr) {
        if ((shareErr as Error).name === "AbortError") {
          return; // user cancelled — do nothing
        }
        // native share failed, fall through to download fallback
      }

      if (!shared) {
        // Fallback: download file + open WhatsApp Web
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = fileName;
        a.click();
        URL.revokeObjectURL(url);
        setTimeout(() => {
          window.open("https://web.whatsapp.com/", "_blank", "noopener");
        }, 500);
      }
    } catch (err) {
      if ((err as Error).name !== "AbortError") {
        alert("Failed to share file. Try exporting first then sharing manually.");
      }
    } finally {
      setSharing(false);
    }
  }

  return (
    <div className="actions">
      <button className="btn btn-primary" onClick={() => router.refresh()}>
        ↻ Refresh
      </button>
      <button
        className="btn btn-whatsapp"
        onClick={shareToWhatsApp}
        disabled={sharing}
      >
        {sharing ? "Sharing..." : "💬 WhatsApp"}
      </button>
    </div>
  );
}
