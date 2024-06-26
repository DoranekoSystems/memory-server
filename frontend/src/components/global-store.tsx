import create from "zustand";

interface globalState {
  ipAddress: string;
  setIpAddress: (ipAddress: string) => void;
  openProcessId: Number;
  setOpenProcessId: (openProcessId: Number) => void;
  openProcessName: string;
  setOpenProcessName: (openProcessName: string) => void;
  serverMode: string;
  setServerMode: (serverMode: string) => void;
  targetOS: string;
  setTargetOS: (targetOS: string) => void;
}

export const useStore = create<globalState>((set) => ({
  ipAddress: "",
  setIpAddress: (ip: string) => set({ ipAddress: ip }),
  openProcessId: 0,
  setOpenProcessId: (id: Number) => set({ openProcessId: id }),
  openProcessName: "",
  setOpenProcessName: (name: string) => set({ openProcessName: name }),
  serverMode: "",
  setServerMode: (mode: string) => set({ serverMode: mode }),
  targetOS: "",
  setTargetOS: (name: string) => set({ targetOS: name }),
}));
