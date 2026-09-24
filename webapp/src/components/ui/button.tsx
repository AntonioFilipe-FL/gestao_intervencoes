import { Button as ButtonPrimitive } from "@base-ui/react/button"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

/**
 * Botões — FROTCOM Styleguide v0.5
 * default = PRIMARY (blue-light-100) · secondary = SECONDARY (blue-dark-100)
 * outline = DEFAULT (branco, borda blue-light-100) · inverse = INVERSE (borda blue-dark-100)
 * destructive = DANGER (red) · link = LINK · ghost = sem fundo (navegação)
 */
const buttonVariants = cva(
  "group/button inline-flex shrink-0 cursor-pointer items-center justify-center gap-1.5 rounded-[2px] border border-transparent font-normal whitespace-nowrap uppercase tracking-[0.02em] transition-colors outline-none select-none focus-visible:ring-2 focus-visible:ring-fc-light-60/60 disabled:pointer-events-none disabled:border-transparent disabled:bg-fc-dark-20 disabled:text-white aria-invalid:border-destructive [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-3.5",
  {
    variants: {
      variant: {
        default: "bg-fc-light-100 text-white hover:bg-[#0090e0]",
        secondary: "bg-fc-dark-100 text-white hover:bg-[#304457]",
        outline: "border-fc-light-100 bg-white text-fc-light-100 hover:border-[#0090e0] hover:text-[#0090e0]",
        inverse: "border-fc-dark-100 bg-white text-fc-dark-100 hover:border-[#304457] hover:text-[#304457]",
        destructive: "bg-fc-red text-white hover:bg-[#e70b31]",
        ghost: "text-fc-dark-100 hover:bg-fc-grey-100",
        link: "px-0 text-fc-light-100 hover:text-fc-light-60",
      },
      size: {
        default: "h-[26px] px-3 text-[11px]",
        xs: "h-[22px] px-2 text-[11px]",
        sm: "h-[22px] px-2.5 text-[12px] normal-case tracking-normal",
        lg: "h-[34px] px-4 text-[13px]",
        icon: "size-[26px]",
        "icon-xs": "size-[22px]",
        "icon-sm": "size-[22px]",
        "icon-lg": "size-[34px]",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant = "default",
  size = "default",
  ...props
}: ButtonPrimitive.Props & VariantProps<typeof buttonVariants>) {
  return (
    <ButtonPrimitive
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
