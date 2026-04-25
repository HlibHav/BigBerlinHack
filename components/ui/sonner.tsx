"use client";

import { Toaster as SonnerToaster, toast } from "sonner";

export function Toaster() {
  return (
    <SonnerToaster
      position="bottom-right"
      richColors
      closeButton
      toastOptions={{
        classNames: {
          toast: "bg-background text-foreground border border-border",
        },
      }}
    />
  );
}

export { toast };
