import { Palette } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

/** A compact shortcut to the image-free appearance settings. */
export function ThemeMenu({ onOpenAppearanceSettings }: { onOpenAppearanceSettings?: () => void }) {
  if (!onOpenAppearanceSettings) return null;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          className="appearance-menu-trigger"
          variant="ghost"
          size="icon-sm"
          aria-label="外观设置"
          onClick={onOpenAppearanceSettings}
        >
          <Palette aria-hidden="true" />
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom">外观设置</TooltipContent>
    </Tooltip>
  );
}