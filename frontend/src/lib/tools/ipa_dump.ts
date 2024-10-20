import { MemoryApi } from "../api";
import JSZip from "jszip";

class AppDumper {
  private memoryApi: MemoryApi;
  private appInfo: any;
  private modules: any[];
  private zip: JSZip;

  constructor(ipAddress: string) {
    this.memoryApi = new MemoryApi(ipAddress);
    this.appInfo = null;
    this.modules = [];
    this.zip = new JSZip();
  }

  async readFile(srcItemPath: string) {
    const response = await this.memoryApi.readFile(srcItemPath);
    if (response.success) {
      return response.data;
    }
    return [];
  }

  async exploreDirectory(srcPath: string) {
    const response = await this.memoryApi.exploreDirectory(srcPath);
    if (response.success) {
      return response.data;
    }
    return [];
  }

  async fetchAppInfo(pid: number) {
    const response = await this.memoryApi.fetchApplicationInfo(pid);
    if (response.success) {
      this.appInfo = response.data.info;
    }
    return this.appInfo;
  }

  async getAllModules() {
    const response = await this.memoryApi.enumModules();
    if (response.success) {
      this.modules = response.data.modules;
    }
    return this.modules;
  }

  parseModuleName(fullPath: string): string {
    return fullPath.split("/").pop() || "";
  }

  async dumpModule(module: any): Promise<any> {
    const moduleBase = module.base;
    const moduleSize = module.size;
    const modulePath = module.modulename;
    const moduleName = this.parseModuleName(modulePath);

    const memoryResponse = await this.memoryApi.readProcessMemory(
      moduleBase,
      moduleSize
    );
    if (!memoryResponse.success) {
      return {
        success: false,
        message: `Failed to read memory: ${memoryResponse.message}`,
      };
    }

    let moduleData = new Uint8Array(memoryResponse.data);

    const dataView = new DataView(moduleData.buffer);
    const magic = dataView.getUint32(0, true);
    const is64bit = magic === 0xfeedfacf;

    const headerSize = is64bit ? 32 : 28;
    let loadCommandOffset = headerSize;
    const ncmds = dataView.getUint32(16, true);

    let offsetCryptid = -1;
    let cryptOff = 0;
    let cryptSize = 0;

    for (let i = 0; i < ncmds; i++) {
      const cmd = dataView.getUint32(loadCommandOffset, true);
      const cmdsize = dataView.getUint32(loadCommandOffset + 4, true);
      if (cmd === 0x21 || cmd === 0x2c) {
        // LC_ENCRYPTION_INFO or LC_ENCRYPTION_INFO_64
        offsetCryptid = loadCommandOffset + 16;
        cryptOff = dataView.getUint32(loadCommandOffset + 8, true);
        cryptSize = dataView.getUint32(loadCommandOffset + 12, true);
      }
      loadCommandOffset += cmdsize;
    }

    if (offsetCryptid !== -1) {
      const newModuleData = new Uint8Array(moduleData.length);
      newModuleData.set(moduleData);
      newModuleData.set(new Uint8Array(4), offsetCryptid);
      moduleData = newModuleData;

      const decryptedSection = await this.memoryApi.readProcessMemory(
        moduleBase + cryptOff,
        cryptSize
      );
      if (decryptedSection.success) {
        moduleData.set(new Uint8Array(decryptedSection.data), cryptOff);
      } else {
        console.warn(
          `Warning: Failed to read decrypted section: ${decryptedSection.message}`
        );
      }
    }

    return {
      success: true,
      name: moduleName,
      path: modulePath,
      data: moduleData,
    };
  }

  async dumpApp(pid: number, updateProgress: (progress: number) => void) {
    updateProgress(0);
    await this.fetchAppInfo(pid);
    if (!this.appInfo) {
      console.log("Failed to fetch app info");
      return null;
    }

    const appPath = this.appInfo.BundlePath;
    const appName = this.parseModuleName(appPath);

    // Dump static files (50% of total progress)
    await this.copyDirectory(appPath, "", (staticProgress) => {
      updateProgress(staticProgress * 0.5);
    });

    // Dump dynamic libraries (50% of total progress)
    await this.getAllModules();
    if (this.modules) {
      const totalModules = this.modules.length;
      let processedModules = 0;

      for (const module of this.modules) {
        if (module.modulename.startsWith(appPath)) {
          console.log(module.modulename);
          const dumpedModule = await this.dumpModule(module);
          if (dumpedModule.success) {
            console.log("dump success!");
            const relativePath = dumpedModule.path.replace(appPath, "");
            this.zip.file(
              `Payload/${appName}${relativePath}`,
              dumpedModule.data
            );
          }
        }
        processedModules++;
        const moduleProgress = (processedModules / totalModules) * 0.5;
        updateProgress(0.5 + moduleProgress);
      }
    }

    updateProgress(1);
    return appName;
  }

  async copyDirectory(
    srcPath: string,
    destPath: string,
    updateProgress?: (progress: number) => void
  ) {
    const items = await this.exploreDirectory(srcPath);
    const totalItems = items.length;
    let processedItems = 0;

    for (const item of items) {
      const srcItemPath = `${srcPath}/${item.name}`;
      const destItemPath = `${destPath}/${item.name}`;

      if (item.item_type === "file") {
        const response = await this.memoryApi.readFile(srcItemPath);
        if (response.success && response.data) {
          const fileContent = response.data;
          if (fileContent instanceof Blob) {
            this.zip.file(`Payload/${destItemPath}`, fileContent);
          } else {
            console.error(`Unexpected file content type for ${srcItemPath}`);
          }
        } else {
          console.error(`Failed to read file: ${srcItemPath}`);
        }
      } else if (item.item_type === "directory") {
        await this.copyDirectory(srcItemPath, destItemPath);
      }

      processedItems++;
      if (updateProgress) {
        updateProgress(processedItems / totalItems);
      }
    }
  }

  async createIpa(appName: string): Promise<Blob> {
    console.log(`Generating ${appName}.ipa`);
    return await this.zip.generateAsync({ type: "blob" });
  }
}

export async function dumpApp(
  ipAddress: string,
  pid: number,
  progressRef: React.MutableRefObject<{
    setProgress: (progress: number) => void;
  }>
) {
  const dumper = new AppDumper(ipAddress);

  const updateProgress = (progress: number) => {
    progressRef.current.setProgress(Math.round(progress * 100));
  };

  const appName = await dumper.dumpApp(pid, updateProgress);

  if (appName) {
    const ipaBlob = await dumper.createIpa(appName);
    updateProgress(1);
    return { success: true, appName, ipaBlob };
  } else {
    updateProgress(1);
    return { success: false };
  }
}
