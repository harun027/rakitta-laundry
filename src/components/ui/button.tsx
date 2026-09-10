import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

/* Pill buttons, editorial contrast. Every size clears the 44px touch target
   except `sm`, which is for dense desktop toolbars only. */
const buttonVariants = cva(
  "press-fx inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full font-bold tracking-tight transition-colors disabled:pointer-events-none disabled:border-line disabled:bg-sunken disabled:text-ink-faint disabled:shadow-none [&_svg]:pointer-events-none [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        solid: "bg-ink text-white shadow-card hover:bg-ink-soft",
        accent: "bg-accent text-ink shadow-card hover:brightness-95",
        outline: "border border-line-strong bg-surface text-ink hover:bg-ink hover:text-white hover:border-ink",
        subtle: "bg-sunken text-ink hover:bg-line",
        ghost: "text-ink-muted hover:bg-sunken hover:text-ink",
        success: "bg-ok text-white shadow-card hover:brightness-110",
        danger: "bg-danger text-white shadow-card hover:brightness-110",
        invert: "bg-white text-ink shadow-card hover:bg-sunken",
      },
      size: {
        sm: "h-10 px-4 text-xs",
        md: "h-11 px-6 text-xs sm:text-sm",
        lg: "h-14 px-8 text-sm",
        icon: "size-11",
        block: "h-14 w-full px-8 text-sm",
      },
    },
    defaultVariants: { variant: "solid", size: "md" },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />;
  }
);
Button.displayName = "Button";

export { Button, buttonVariants };
