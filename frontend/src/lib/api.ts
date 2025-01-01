import axios, { AxiosResponse } from "axios";

export class MemoryApi {
  ipAddress: string;
  baseUrl: string;

  constructor(ipAddress: string) {
    this.ipAddress = ipAddress;
    this.baseUrl = `http://${ipAddress}:3030/`;
  }

  handleResponse(response: AxiosResponse, onSuccess?: (data: any) => any) {
    if (response.status === 200) {
      const data = onSuccess ? onSuccess(response.data) : response.data;
      return {
        success: true,
        status: 200,
        data: data,
        message: "",
      };
    } else {
      return {
        success: false,
        status: response.status,
        data: null,
        message: `Unexpected status code: ${response.status}`,
      };
    }
  }

  handleError(error: any) {
    return {
      success: false,
      status: -1,
      data: null,
      message: `Error: ${error.message}`,
    };
  }

  async readProcessMemory(address: Number, size: Number) {
    try {
      const response = await axios.get(this.baseUrl + "memory", {
        params: { address, size },
        responseType: "arraybuffer",
      });
      return this.handleResponse(response);
    } catch (error) {
      return this.handleError(error);
    }
  }

  async writeProcessMemory(address: Number, buffer: any) {
    try {
      const response = await axios.post(this.baseUrl + "memory", {
        address,
        buffer: Array.from(new Uint8Array(buffer)),
      });
      return this.handleResponse(response);
    } catch (error) {
      return this.handleError(error);
    }
  }

  async memoryScan(
    pattern,
    address_ranges,
    find_type,
    data_type,
    align,
    scan_id,
    return_as_json,
    do_suspend
  ) {
    try {
      const response = await axios.post(this.baseUrl + "memoryscan", {
        pattern,
        address_ranges,
        find_type,
        data_type,
        align,
        scan_id,
        return_as_json,
        do_suspend,
      });

      return this.handleResponse(response);
    } catch (error) {
      return this.handleError(error);
    }
  }

  async memoryFilter(
    pattern,
    data_type,
    scan_id,
    filter_method,
    return_as_json,
    do_suspend
  ) {
    try {
      const response = await axios.post(this.baseUrl + "memoryfilter", {
        pattern,
        data_type,
        scan_id,
        filter_method,
        return_as_json,
        do_suspend,
      });
      return this.handleResponse(response);
    } catch (error) {
      return this.handleError(error);
    }
  }

  async resolveAddress(query: String) {
    try {
      const response = await axios.get(this.baseUrl + "resolveaddr", {
        params: { query },
      });
      return this.handleResponse(response);
    } catch (error) {
      return this.handleError(error);
    }
  }

  async getExceptionInfo() {
    try {
      const response = await axios.get(this.baseUrl + "exceptioninfo");
      return this.handleResponse(response);
    } catch (error) {
      return this.handleError(error);
    }
  }

  async setWatchPoint(address: number, size: number, type: string) {
    try {
      const response = await axios.post(this.baseUrl + "watchpoint", {
        address,
        size,
        _type: type,
      });
      return this.handleResponse(response);
    } catch (error) {
      return this.handleError(error);
    }
  }

  async setBreakPoint(address: number, hit_count: number) {
    try {
      const response = await axios.post(this.baseUrl + "breakpoint", {
        address,
        hit_count,
      });
      return this.handleResponse(response);
    } catch (error) {
      return this.handleError(error);
    }
  }

  async removeBreakPoint(address: number) {
    try {
      const response = await axios.delete(this.baseUrl + "breakpoint", {
        data: { address: address },
      });
      return this.handleResponse(response);
    } catch (error) {
      return this.handleError(error);
    }
  }

  async removeWatchPoint(address: number) {
    try {
      const response = await axios.delete(this.baseUrl + "watchpoint", {
        data: { address: address },
      });
      return this.handleResponse(response);
    } catch (error) {
      return this.handleError(error);
    }
  }

  async exploreDirectory(encodedPath: String) {
    try {
      const response = await axios.get(
        this.baseUrl + `directory?path=${encodedPath}&max_depth=1`
      );
      return this.handleResponse(response);
    } catch (error) {
      return this.handleError(error);
    }
  }

  async readFile(fullPath: String) {
    try {
      const response = await axios.get(this.baseUrl + "file", {
        params: { path: fullPath },
        responseType: "blob",
      });
      return this.handleResponse(response);
    } catch (error) {
      return this.handleError(error);
    }
  }

  async enumModules() {
    try {
      const response = await axios.get(this.baseUrl + "modules");
      return this.handleResponse(response);
    } catch (error) {
      return this.handleError(error);
    }
  }

  async enumRegions() {
    try {
      const response = await axios.get(this.baseUrl + "regions");
      return this.handleResponse(response);
    } catch (error) {
      return this.handleError(error);
    }
  }

  async openProcess(pid: Number) {
    try {
      const response = await axios.post(this.baseUrl + "process", {
        pid,
      });
      return this.handleResponse(response);
    } catch (error) {
      return this.handleError(error);
    }
  }

  async enumProcesses() {
    try {
      const response = await axios.get(this.baseUrl + "processes");
      return this.handleResponse(response);
    } catch (error) {
      return this.handleError(error);
    }
  }

  async fetchApplicationInfo(pid: Number) {
    try {
      const response = await axios.get(this.baseUrl + `appinfo?pid=${pid}`);
      return this.handleResponse(response);
    } catch (error) {
      return this.handleError(error);
    }
  }

  async getServerInfo() {
    try {
      const response = await axios.get(this.baseUrl + "serverinfo");
      return this.handleResponse(response);
    } catch (error) {
      return this.handleError(error);
    }
  }

  async changeProcessState({ doPlay }: { doPlay: boolean }) {
    try {
      const response = await axios.put(this.baseUrl + "process", {
        do_play: doPlay,
      });
      return this.handleResponse(response);
    } catch (error) {
      return this.handleError(error);
    }
  }

  async generatePointermap(address: Number) {
    try {
      const response = await axios.post(
        this.baseUrl + "pointermap",
        { address },
        {
          responseType: "arraybuffer",
        }
      );
      return this.handleResponse(response);
    } catch (error) {
      return this.handleError(error);
    }
  }
}
