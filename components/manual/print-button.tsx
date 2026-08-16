"use client";

import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";

/*
 * The browser's own print pipeline plus a print stylesheet gives real,
 * selectable text and sane page breaks — and "Save as PDF" is right there.
 * v1 screenshotted the DOM with html2canvas and pasted the bitmap into jsPDF.
 */
export function PrintButton() {
  return (
    <Button size="sm" onClick={() => window.print()}>
      <Printer /> Print / PDF
    </Button>
  );
}
