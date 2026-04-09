"use client"

import * as React from "react"
import { Button as ButtonPrimitive } from "@base-ui/react/button"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

function Sidebar({ className, ...props }: React.ComponentProps<"aside">) {
  return (
    <aside
      data-slot="sidebar"
      className={cn(
        "flex h-full w-64 shrink-0 flex-col border-r border-border bg-background pt-4",
        className
      )}
      {...props}
    />
  )
}

function SidebarHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sidebar-header"
      className={cn("flex shrink-0 flex-col gap-0.5 px-2", className)}
      {...props}
    />
  )
}

function SidebarContent({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sidebar-content"
      className={cn("flex min-h-0 flex-1 flex-col", className)}
      {...props}
    />
  )
}

function SidebarGroup({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <section
      data-slot="sidebar-group"
      className={cn("flex min-h-0 flex-1 flex-col", className)}
      {...props}
    />
  )
}

function SidebarGroupHeader({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sidebar-group-header"
      className={cn("flex shrink-0 items-center justify-between px-4 pb-1", className)}
      {...props}
    />
  )
}

function SidebarGroupLabel({
  className,
  ...props
}: React.ComponentProps<"h3">) {
  return (
    <h3
      data-slot="sidebar-group-label"
      className={cn(
        "text-xs font-semibold uppercase tracking-wider text-muted-foreground",
        className
      )}
      {...props}
    />
  )
}

function SidebarGroupAction({
  className,
  ...props
}: ButtonPrimitive.Props) {
  return (
    <ButtonPrimitive
      data-slot="sidebar-group-action"
      className={cn(
        "inline-flex size-7 shrink-0 items-center justify-center rounded-[min(var(--radius-md),12px)] text-muted-foreground transition-colors outline-none hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0",
        className
      )}
      {...props}
    />
  )
}

function SidebarMenu({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sidebar-menu"
      className={cn("flex flex-col gap-0.5", className)}
      {...props}
    />
  )
}

function SidebarMenuItem({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sidebar-menu-item"
      className={cn("min-w-0", className)}
      {...props}
    />
  )
}

const sidebarMenuButtonVariants = cva(
  "group/sidebar-menu-button flex w-full items-center gap-3 rounded-lg text-left text-sm font-medium transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0",
  {
    variants: {
      tone: {
        nav: "text-muted-foreground hover:bg-accent hover:text-foreground",
        playlist: "text-foreground hover:bg-accent",
      },
      size: {
        default: "h-10 px-3",
        playlist: "h-12 px-2.5",
      },
      active: {
        true: "bg-accent text-foreground",
        false: "",
      },
    },
    defaultVariants: {
      tone: "nav",
      size: "default",
      active: false,
    },
  }
)

function SidebarMenuButton({
  className,
  tone = "nav",
  size = "default",
  active = false,
  ...props
}: ButtonPrimitive.Props & VariantProps<typeof sidebarMenuButtonVariants>) {
  return (
    <ButtonPrimitive
      data-slot="sidebar-menu-button"
      data-active={active}
      className={cn(
        sidebarMenuButtonVariants({ tone, size, active, className })
      )}
      {...props}
    />
  )
}

export {
  Sidebar,
  SidebarHeader,
  SidebarContent,
  SidebarGroup,
  SidebarGroupHeader,
  SidebarGroupLabel,
  SidebarGroupAction,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
}
