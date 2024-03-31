import create from 'zustand';

interface globalState {
    ipAddress: string;
    setIpAddress: (ipAddress: string) => void;
    openProcessId: Number;
    setOpenProcessId: (openProcessId: Number) => void;
    openProcessName: string;
    setOpenProcessName: (openProcessName: string) => void;
}

export const useStore = create<globalState>((set) => ({
  ipAddress: '',
  setIpAddress: (ip:string) => set({ ipAddress:ip }),
  openProcessId: 0,
  setOpenProcessId: (id:Number) => set({ openProcessId:id }),
  openProcessName: '',
  setOpenProcessName: (name:string) => set({ openProcessName:name }),
}));