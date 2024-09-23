import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import { MemoryApi } from "@/lib/api";
import { useStore } from "zustand";

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

export async function getMemoryRegions(
  memoryApi: MemoryApi,
  protection: string
) {
  const response = await memoryApi.enumRegions();
  if (response.success) {
    const regions = response.data.regions;
    const filteredRegions = regions.filter((region: any) => {
      const hasReadPermission = protection.includes("r+");
      const hasWritePermission = protection.includes("w+");
      const hasExecutePermission = protection.includes("x+");
      const hasNegativeReadPermission = protection.includes("r-");
      const hasNegativeWritePermission = protection.includes("w-");
      const hasNegativeExecutePermission = protection.includes("x-");

      const regionProtection = region.protection.toLowerCase();

      let f1 = true;
      let f2 = true;
      let f3 = true;

      if (regionProtection.includes("r")) {
        if (hasReadPermission) {
          f1 = true;
        }
        if (hasNegativeReadPermission) {
          f1 = false;
        }
      } else {
        if (hasReadPermission) {
          f1 = false;
        }
        if (hasNegativeReadPermission) {
          f1 = true;
        }
      }

      if (regionProtection.includes("w")) {
        if (hasWritePermission) {
          f2 = true;
        }
        if (hasNegativeWritePermission) {
          f2 = false;
        }
      } else {
        if (hasWritePermission) {
          f2 = false;
        }
        if (hasNegativeWritePermission) {
          f2 = true;
        }
      }

      if (regionProtection.includes("x")) {
        if (hasExecutePermission) {
          f3 = true;
        }
        if (hasNegativeExecutePermission) {
          f3 = false;
        }
      } else {
        if (hasExecutePermission) {
          f3 = false;
        }
        if (hasNegativeExecutePermission) {
          f3 = true;
        }
      }

      return f1 && f2 && f3;
    });

    return filteredRegions;
  }
}
