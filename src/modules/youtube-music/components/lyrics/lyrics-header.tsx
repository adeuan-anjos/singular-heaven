// src/modules/youtube-music/components/lyrics/lyrics-header.tsx
import React from "react";
import { Button } from "@/components/ui/button";
import { SheetClose } from "@/components/ui/sheet";
import { ChevronDown } from "lucide-react";

export const LyricsHeader = React.memo(function LyricsHeader() {
  return (
    <div className="flex h-14 items-center px-4">
      <SheetClose
        render={
          <Button variant="ghost" size="icon" aria-label="Fechar letra" />
        }
      >
        <ChevronDown />
      </SheetClose>
    </div>
  );
});
