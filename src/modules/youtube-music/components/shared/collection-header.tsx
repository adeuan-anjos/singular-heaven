import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ButtonGroup } from "@/components/ui/button-group";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Ellipsis } from "lucide-react";

function CollectionHeader({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="collection-header"
      className={cn("space-y-4", className)}
      {...props}
    />
  );
}

function CollectionHeaderInfo({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="collection-header-info"
      className={cn("flex items-start gap-6", className)}
      {...props}
    />
  );
}

function CollectionHeaderThumbnail({
  className,
  src,
  alt,
  fallback,
  ...props
}: React.ComponentProps<"div"> & {
  src?: string;
  alt?: string;
  fallback?: string;
}) {
  return (
    <div
      data-slot="collection-header-thumbnail"
      className={cn(
        "flex h-48 w-48 shrink-0 items-center justify-center overflow-hidden rounded-sm bg-muted",
        className
      )}
      {...props}
    >
      {src ? (
        <img
          referrerPolicy="no-referrer"
          src={src}
          alt={alt ?? ""}
          className="h-full w-full object-cover"
        />
      ) : (
        <span className="text-4xl text-muted-foreground">
          {fallback ?? ""}
        </span>
      )}
    </div>
  );
}

function CollectionHeaderContent({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="collection-header-content"
      className={cn("flex flex-1 flex-col gap-2", className)}
      {...props}
    />
  );
}

function CollectionHeaderActions({
  className,
  ...props
}: React.ComponentProps<typeof ButtonGroup>) {
  return (
    <ButtonGroup
      data-slot="collection-header-actions"
      className={className}
      {...props}
    />
  );
}

function CollectionHeaderMenu({
  contentClassName,
  children,
}: {
  contentClassName?: string;
  children: ReactNode;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="outline" size="icon" aria-label="Mais opções" />}>
        <Ellipsis />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className={contentClassName}>
        {children}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export {
  CollectionHeader,
  CollectionHeaderInfo,
  CollectionHeaderThumbnail,
  CollectionHeaderContent,
  CollectionHeaderActions,
  CollectionHeaderMenu,
};
