import * as React from "react"
import { Input as InputPrimitive } from "@base-ui/react/input"

import { cn } from "@/lib/utils"

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <InputPrimitive
      type={type}
      data-slot="input"
      className={cn(
        "h-[26px] w-full min-w-0 rounded-[2px] px-2 py-0.5 transition-colors outline-none file:inline-flex file:h-5 file:border-0 file:bg-transparent file:text-[13px] bg-fc-grey-80 border border-fc-dark-40 text-[13px] text-fc-dark-100 placeholder:text-fc-dark-40 hover:border-fc-dark-60 focus-visible:border-fc-light-60 disabled:pointer-events-none disabled:cursor-not-allowed disabled:border-fc-dark-10 disabled:text-fc-dark-20 aria-invalid:border-fc-danger",
        className
      )}
      {...props}
    />
  )
}

export { Input }
