import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function isHexadecimal(value: string | number): boolean {
  if (typeof value === "number") {
    return Number.isInteger(value);
  }

  if (typeof value === "string") {
    const hexPattern = /^0x[0-9a-fA-F]+$/;
    const plainHexPattern = /^[0-9a-fA-F]+$/;
    return hexPattern.test(value) || plainHexPattern.test(value);
  }

  return false;
}
