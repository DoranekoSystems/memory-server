import * as React from "react";
import { cn } from "@/lib/utils";
import { useState, useEffect } from "react";
import { Label } from "@/components/ui/label";

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
));

Checkbox.displayName = "Checkbox";

const TriStateCheckbox = ({ id, label, defaultState, onStateChange }) => {
  const [state, setState] = useState(defaultState);

  const handleClick = () => {
    const newState = (state + 1) % 3;
    setState(newState);
    onStateChange(newState);
  };

  return (
    <div className="flex items-center space-x-2">
      <div
        className={`w-4 h-4 border border-gray-300 rounded-sm cursor-pointer ${
          state === 1 ? "bg-gray-300" : state === 2 ? "bg-blue-500" : ""
        }`}
        onClick={handleClick}
      />
      <Label htmlFor={id}>{label}</Label>
    </div>
  );
};
export { Checkbox, TriStateCheckbox };
