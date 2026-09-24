import * as React from "react"

import { cn } from "@/lib/utils"

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "flex field-sizing-content min-h-16 w-full rounded-[2px] px-2 py-1.5 leading-5 transition-colors outline-none bg-fc-grey-80 border border-fc-dark-40 text-[13px] text-fc-dark-100 placeholder:text-fc-dark-40 hover:border-fc-dark-60 focus-visible:border-fc-light-60 disabled:pointer-events-none disabled:cursor-not-allowed disabled:border-fc-dark-10 disabled:text-fc-dark-20 aria-invalid:border-fc-danger",
        className
      )}
      {...props}
    />
  )
}

export { Textarea }
