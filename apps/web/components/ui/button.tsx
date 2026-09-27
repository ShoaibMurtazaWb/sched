import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm font-medium transition-[background-color,border-color,color,box-shadow,opacity,transform] duration-150 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-1 disabled:pointer-events-none disabled:opacity-40 select-none cursor-pointer",
  {
    variants: {
      variant: {
        default:
          "bg-blue-600 text-white hover:bg-blue-700 shadow-xs active:scale-[0.98] dark:bg-blue-600 dark:hover:bg-blue-500",
        secondary:
          "bg-blue-50 text-blue-700 hover:bg-blue-100 shadow-2xs active:scale-[0.98] dark:bg-blue-950/60 dark:text-blue-300 dark:hover:bg-blue-900/60",
        outline:
          "border border-neutral-300 bg-white text-neutral-800 hover:bg-neutral-50 hover:border-neutral-400 shadow-2xs active:scale-[0.98] dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-200 dark:hover:bg-neutral-800 dark:hover:border-neutral-600",
        destructive:
          "bg-rose-600 text-white hover:bg-rose-700 shadow-xs active:scale-[0.98] dark:bg-rose-600 dark:hover:bg-rose-500",
        ghost:
          "text-neutral-700 hover:text-blue-600 hover:bg-blue-50/50 dark:text-neutral-300 dark:hover:text-blue-400 dark:hover:bg-neutral-800/60",
        link:
          "text-blue-600 underline-offset-4 hover:underline p-0 h-auto dark:text-blue-400",
      },
      size: {
        default: "h-9 px-4 py-2",
        sm: "h-8 px-3 text-xs",
        lg: "h-10 px-5 text-sm font-medium",
        icon: "h-8 w-8 p-0",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export function Button({
  className,
  variant,
  size,
  asChild = false,
  ...props
}: React.ComponentProps<"button"> & VariantProps<typeof buttonVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot : "button";
  return <Comp className={cn(buttonVariants({ variant, size, className }))} {...props} />;
}
