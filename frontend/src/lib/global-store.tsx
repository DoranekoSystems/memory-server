import { create } from "zustand";
import { MemoryApi } from "@/lib/api";

type RegisterInfo = {
  [key: string]: number;
};

type Watchpoint = {
  address: number;
  size: number;
  type: string;
  id: string;
};

type WatchpointHit = {
  pcAddress: number;
  count: number;
  opcode: string;
};

type WatchpointHits = {
  watchpoint: Watchpoint;
  hits: WatchpointHit[];
};

type WatchpointStore = {
  watchpoints: Watchpoint[];
  watchpointHitsList: WatchpointHits[];
  addWatchpoint: (watchpoint: Watchpoint) => void;
  removeWatchpoint: (address: number) => void;
  addWatchpointHit: (
    watchpoint: Watchpoint,
    pcAddress: number,
    opcode: string
  ) => void;
};

type Breakpoint = {
  address: number;
  hitCount: number;
};

type BreakpointStore = {
  breakpoints: Breakpoint[];
  addBreakpoint: (breakpoint: Breakpoint) => void;
  removeBreakpoint: (address: number) => void;
  updateBreakpointHitCount: (address: number, hitCount: number) => void;
};

interface GlobalState {
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
  memoryApi: MemoryApi;
  setMemoryApi: (memoryApi: MemoryApi) => void;
}

export const useStore = create<GlobalState>((set) => ({
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
  memoryApi: new MemoryApi("127.0.0.1"),
  setMemoryApi: (api: MemoryApi) => set({ memoryApi: api }),
}));

export const useWatchpointStore = create<WatchpointStore>((set) => ({
  watchpoints: [],
  watchpointHitsList: [],

  addWatchpoint: (watchpoint) =>
    set((state) => ({
      watchpoints: [...state.watchpoints, watchpoint],
    })),

  removeWatchpoint: (address) =>
    set((state) => ({
      watchpoints: state.watchpoints.filter((wp) => wp.address !== address),
      watchpointHitsList: state.watchpointHitsList.filter(
        (wh) => wh.watchpoint.address !== address
      ),
    })),

  addWatchpointHit: (watchpoint, pcAddress, opcode) =>
    set((state) => {
      const existingWatchpointHits = state.watchpointHitsList.find(
        (wh) => wh.watchpoint.address === watchpoint.address
      );

      if (existingWatchpointHits) {
        const existingHit = existingWatchpointHits.hits.find(
          (hit) => hit.pcAddress === pcAddress
        );

        if (existingHit) {
          return {
            watchpointHitsList: state.watchpointHitsList.map((wh) =>
              wh.watchpoint.address === watchpoint.address
                ? {
                    ...wh,
                    hits: wh.hits.map((hit) =>
                      hit.pcAddress === pcAddress
                        ? { ...hit, count: hit.count + 1 }
                        : hit
                    ),
                  }
                : wh
            ),
          };
        } else {
          return {
            watchpointHitsList: state.watchpointHitsList.map((wh) =>
              wh.watchpoint.address === watchpoint.address
                ? {
                    ...wh,
                    hits: [...wh.hits, { pcAddress, count: 1, opcode }],
                  }
                : wh
            ),
          };
        }
      } else {
        return {
          watchpointHitsList: [
            ...state.watchpointHitsList,
            { watchpoint, hits: [{ pcAddress, count: 1, opcode }] },
          ],
        };
      }
    }),
}));

export const useBreakpointStore = create<BreakpointStore>((set) => ({
  breakpoints: [],
  addBreakpoint: (breakpoint) =>
    set((state) => ({
      breakpoints: [...state.breakpoints, breakpoint],
    })),
  removeBreakpoint: (address) =>
    set((state) => ({
      breakpoints: state.breakpoints.filter((bp) => bp.address !== address),
    })),
  updateBreakpointHitCount: (address, hitCount) =>
    set((state) => ({
      breakpoints: state.breakpoints.map((bp) =>
        bp.address === address ? { ...bp, hitCount } : bp
      ),
    })),
}));
