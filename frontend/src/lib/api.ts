import axios from "axios";

export async function getMemoryRegions(
  ipAddress: string,
  protection: string[]
) {
  try {
    const response = await axios.get(`http://${ipAddress}:3030/enumregions`);
    if (response.status === 200) {
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
    } else {
      console.error(`Enumerate regions failed: ${response.status}`);
      return [];
    }
  } catch (error) {
    console.error("Error enumerating regions:", error);
    return [];
  }
}

export async function readProcessMemory(
  ipAddress: String,
  address: Number,
  size: Number
) {
  try {
    const response = await axios.get(`http://${ipAddress}:3030/readmemory`, {
      params: { address, size },
      responseType: "arraybuffer",
    });
    if (response.status === 200) {
      const memoryData = response.data;
      if (memoryData.byteLength === 0) {
        return null;
      } else {
        return response.data;
      }
    } else {
      console.error("Unexpected status code:", response.status);
    }
  } catch (error) {
    console.error("Error in readProcessMemory:", error);
  }
}

export async function resolveAddress(ipAddress: String, query: String) {
  try {
    const response = await axios.get(`http://${ipAddress}:3030/resolveaddr`, {
      params: { query },
    });
    if (response.status === 200) {
      return response.data.address.toString(10);
    } else {
      console.error("Unexpected status code:", response.status);
    }
  } catch (error) {
    console.error("Error in resolveAddress:", error);
  }
}
