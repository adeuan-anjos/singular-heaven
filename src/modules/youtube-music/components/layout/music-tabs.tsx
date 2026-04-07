import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Search } from "lucide-react";

interface MusicTabsProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
  onSearchClick: () => void;
}

export function MusicTabs({ activeTab, onTabChange, onSearchClick }: MusicTabsProps) {
  return (
    <div className="flex items-center justify-between border-b border-border px-4 py-2">
      <Tabs value={activeTab} onValueChange={(value) => onTabChange(value as string)}>
        <TabsList>
          <TabsTrigger value="home">Início</TabsTrigger>
          <TabsTrigger value="explore">Explorar</TabsTrigger>
          <TabsTrigger value="library">Biblioteca</TabsTrigger>
        </TabsList>
      </Tabs>
      <Tooltip>
        <TooltipTrigger render={<Button variant="ghost" size="icon" onClick={onSearchClick} />}>
          <Search className="h-5 w-5" />
        </TooltipTrigger>
        <TooltipContent>Buscar</TooltipContent>
      </Tooltip>
    </div>
  );
}
