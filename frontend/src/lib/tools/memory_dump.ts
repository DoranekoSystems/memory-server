import { MemoryApi } from "../api";
import JSZip from "jszip";

interface MemoryRegion {
  start_address: string;
  end_address: string;
  protection: string;
}

class MemoryDumper {
  private memoryApi: MemoryApi;
  private zip: JSZip;

  constructor(ipAddress: string) {
    this.memoryApi = new MemoryApi(ipAddress);
    this.zip = new JSZip();
  }

  private parseProtection(protection: string): {
    readable: boolean;
    writable: boolean;
    executable: boolean;
  } {
    return {
      readable: protection.includes("r"),
      writable: protection.includes("w"),
      executable: protection.includes("x"),
    };
  }

  private matchesProtectionFilter(
    regionProtection: string,
    filterProtection: { r: number; w: number; x: number }
  ): boolean {
    const region = this.parseProtection(regionProtection);

    // For each protection flag:
    // 0 = must not have permission
    // 1 = don't care (match anything)
    // 2 = must have permission
    const matches = (flag: boolean, filter: number) => {
      if (filter === 0) return !flag;
      if (filter === 1) return true;
      if (filter === 2) return flag;
      return false;
    };

    return (
      matches(region.readable, filterProtection.r) &&
      matches(region.writable, filterProtection.w) &&
      matches(region.executable, filterProtection.x)
    );
  }

  private formatAddress(address: number): string {
    return `0x${address.toString(16).padStart(16, "0")}`;
  }

  async getAllRegions(): Promise<MemoryRegion[]> {
    const response = await this.memoryApi.enumRegions();
    if (response.success) {
      return response.data.regions;
    }
    return [];
  }

  async dumpRegion(region: MemoryRegion): Promise<{
    success: boolean;
    data?: Uint8Array;
    message?: string;
  }> {
    const size =
      parseInt(region.end_address, 16) - parseInt(region.start_address, 16);
    const response = await this.memoryApi.readProcessMemory(
      parseInt(region.start_address, 16),
      size
    );

    if (!response.success) {
      return {
        success: false,
        message: `Failed to read memory at ${this.formatAddress(
          region.start_address
        )}: ${response.message}`,
      };
    }

    return {
      success: true,
      data: new Uint8Array(response.data),
    };
  }

  async dumpMemory(
    pid: number,
    protection: { r: number; w: number; x: number },
    updateProgress: (progress: number) => void
  ): Promise<boolean> {
    // Open process first
    const processResponse = await this.memoryApi.openProcess(pid);
    if (!processResponse.success) {
      console.error("Failed to open process:", processResponse.message);
      return false;
    }

    // Get all memory regions
    const regions = await this.getAllRegions();
    const filteredRegions = regions.filter((region) =>
      this.matchesProtectionFilter(region.protection, protection)
    );

    let processedRegions = 0;
    const totalRegions = filteredRegions.length;

    // Create a directory for the process dump
    const processDir = `pid_${pid}_dump`;

    for (const region of filteredRegions) {
      const dumpResult = await this.dumpRegion(region);

      if (dumpResult.success && dumpResult.data) {
        // Create filename with address range and protection
        const fileName = `${this.formatAddress(
          region.start_address
        )}-${this.formatAddress(region.end_address)}_${region.protection}.bin`;

        // Add to zip file
        this.zip.file(`${processDir}/${fileName}`, dumpResult.data);
      } else {
        console.warn(dumpResult.message);
      }

      processedRegions++;
      updateProgress(processedRegions / totalRegions);
    }

    return true;
  }

  async createDumpArchive(pid: number): Promise<Blob> {
    const filename = `memory_dump_${pid}.zip`;
    console.log(`Generating ${filename}`);
    return await this.zip.generateAsync({ type: "blob" });
  }
}

export async function dumpProcessMemory(
  ipAddress: string,
  pid: number,
  protection: { r: number; w: number; x: number },
  progressRef: React.MutableRefObject<{
    setProgress: (progress: number) => void;
  }>
): Promise<{
  success: boolean;
  dumpBlob?: Blob;
}> {
  const dumper = new MemoryDumper(ipAddress);

  const updateProgress = (progress: number) => {
    progressRef.current.setProgress(Math.round(progress * 100));
  };

  const success = await dumper.dumpMemory(pid, protection, updateProgress);

  if (success) {
    const dumpBlob = await dumper.createDumpArchive(pid);
    updateProgress(1);
    return { success: true, dumpBlob };
  } else {
    updateProgress(1);
    return { success: false };
  }
}
