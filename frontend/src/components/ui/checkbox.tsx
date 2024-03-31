import * as React from "react"
import { cn } from "@/lib/utils"

const Checkbox = React.forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement>
>(({ className, ...props }, ref) => (
  <input
    type="checkbox"
    className={cn(
      "rounded border-gray-300 text-blue-600 shadow-sm focus:ring-blue-500 dark:border-gray-700 dark:text-blue-600 dark:focus:ring-blue-600",
      className
    )}
    ref={ref}
    {...props}
  />
))

Checkbox.displayName = "Checkbox"

export { Checkbox }