// lib/tools/pointermap_generator.ts
import { MemoryApi } from "../api";

interface PointerMapFormData {
  address: string;
}

class PointerMapGenerator {
  private memoryApi: MemoryApi;

  constructor(ipAddress: string) {
    this.memoryApi = new MemoryApi(ipAddress);
  }

  async generatePointerMap(
    address: number
  ): Promise<{ success: boolean; data?: Blob; error?: string }> {
    try {
      const response = await this.memoryApi.generatePointermap(address);
      if (response.success) {
        const arrayBuffer = await response.data;
        const blob = new Blob([arrayBuffer], {
          type: "application/octet-stream",
        });
        return {
          success: true,
          data: blob,
        };
      } else {
        return {
          success: false,
          error: "Invalid response format",
        };
      }
    } catch (error) {
      return {
        success: false,
        error:
          error instanceof Error ? error.message : "Unknown error occurred",
      };
    }
  }
}

export async function generatePointerMap(
  ipAddress: string,
  address: number,
  progressRef?: { current: { setProgress: (progress: number) => void } }
) {
  const generator = new PointerMapGenerator(ipAddress);

  try {
    progressRef?.current.setProgress(10);
    const result = await generator.generatePointerMap(address);
    progressRef?.current.setProgress(100);

    if (result.success && result.data) {
      return {
        success: true,
        data: result.data,
      };
    } else {
      return {
        success: false,
        error: result.error || "Failed to generate pointer map",
      };
    }
  } catch (error) {
    progressRef?.current.setProgress(0);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error occurred",
    };
  }
}
