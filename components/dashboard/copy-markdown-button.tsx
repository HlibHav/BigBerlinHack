"use client";

import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";

export function CopyMarkdownButton({ markdown }: { markdown: string }) {
  const [copied, setCopied] = useState(false);

  async function onCopy() {
    try {
      await navigator.clipboard.writeText(markdown);
      setCopied(true);
      toast.success("Markdown copied to clipboard");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Copy failed — manual select + copy below");
    }
  }

  return (
    <Button type="button" size="sm" variant="outline" onClick={onCopy}>
      {copied ? "✓ Copied" : "⧉ Copy markdown"}
    </Button>
  );
}
