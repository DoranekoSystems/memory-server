import React, { useEffect, useState } from "react";
import axios from "axios";
import {
  useStore,
  useWatchpointStore,
  useBreakpointStore,
} from "@/lib/global-store";
import WatchPointTable from "./WatchPointTable";
import BreakPointView from "./BreakPointView";
import {
  Card,
  CardContent,
  CardHeader,
  Typography,
  Tabs,
  Tab,
  Box,
} from "@mui/material";
import { styled } from "@mui/material/styles";

const StyledTabs = styled(Tabs)({
  borderBottom: "1px solid #e8e8e8",
  "& .MuiTabs-indicator": {
    backgroundColor: "#1890ff",
  },
});

const StyledTab = styled((props) => <Tab disableRipple {...props} />)(
  ({ theme }) => ({
    textTransform: "none",
    minWidth: 0,
    [theme.breakpoints.up("sm")]: {
      minWidth: 0,
    },
    fontWeight: theme.typography.fontWeightRegular,
    marginRight: theme.spacing(1),
    color: "rgba(0, 0, 0, 0.85)",
    fontFamily: [
      "-apple-system",
      "BlinkMacSystemFont",
      '"Segoe UI"',
      "Roboto",
      '"Helvetica Neue"',
      "Arial",
      "sans-serif",
      '"Apple Color Emoji"',
      '"Segoe UI Emoji"',
      '"Segoe UI Symbol"',
    ].join(","),
    "&:hover": {
      color: "#40a9ff",
      opacity: 1,
    },
    "&.Mui-selected": {
      color: "#1890ff",
      fontWeight: theme.typography.fontWeightMedium,
    },
    "&.Mui-focusVisible": {
      backgroundColor: "#d1eaff",
    },
  })
);

export function Debugger({ currentPage }) {
  const ipAddress = useStore((state) => state.ipAddress);
  const watchpoints = useWatchpointStore((state) => state.watchpoints);
  const breakpoints = useBreakpointStore((state) => state.breakpoints);
  const updateBreakpointHitCount = useBreakpointStore(
    (state) => state.updateBreakpointHitCount
  );
  const [watchpointData, setWatchpointData] = useState({});
  const [breakpointData, setBreakpointData] = useState([]);
  const [isVisible, setIsVisible] = useState(currentPage === "debugger");
  const [activeTab, setActiveTab] = useState(0);

  useEffect(() => {
    setIsVisible(currentPage === "debugger");
  }, [currentPage]);

  useEffect(() => {
    if (!isVisible) return;

    const pollException = async () => {
      try {
        const response = await axios.get(
          `http://${ipAddress}:3030/exceptioninfo`
        );
        const exceptions = response.data;
        exceptions.forEach((exceptionInfo) => {
          const registerInfo = {};
          for (let i = 0; i < 31; i++) {
            const regName = `x${i}`;
            if (regName in exceptionInfo) {
              registerInfo[regName] = BigInt(exceptionInfo[regName]);
            }
          }
          if ("pc" in exceptionInfo)
            registerInfo["pc"] = BigInt(exceptionInfo.pc);
          if ("sp" in exceptionInfo)
            registerInfo["sp"] = BigInt(exceptionInfo.sp);
          if ("lr" in exceptionInfo)
            registerInfo["lr"] = BigInt(exceptionInfo.lr);

          if (exceptionInfo.memory) {
            // Watchpoint handling
            const memoryAddress = BigInt(exceptionInfo.memory);
            const matchingWatchpoint = watchpoints.find(
              (wp) => BigInt(wp.address) === memoryAddress
            );
            if (matchingWatchpoint) {
              setWatchpointData((prevData) => {
                const newData = { ...prevData };
                if (!newData[memoryAddress]) {
                  newData[memoryAddress] = {
                    address: memoryAddress,
                    size: matchingWatchpoint.size,
                    type: matchingWatchpoint.type,
                    hits: [],
                    register: registerInfo,
                  };
                }
                const pcAddress = BigInt(exceptionInfo.pc);
                const instruction =
                  exceptionInfo.instruction.split(": ")[1] ||
                  exceptionInfo.instruction;
                const existingHit = newData[memoryAddress].hits.find(
                  (hit) => hit.address === pcAddress
                );
                if (existingHit) {
                  existingHit.count += 1;
                } else {
                  newData[memoryAddress].hits.push({
                    count: 1,
                    address: pcAddress,
                    opcode: instruction.trim(),
                    register: registerInfo,
                  });
                }
                return newData;
              });
            }
          } else {
            // Breakpoint handling
            const pcAddress = BigInt(exceptionInfo.pc);
            const matchingBreakpoint = breakpoints[0];
            if (matchingBreakpoint) {
              const newHitCount = matchingBreakpoint.hitCount + 1;
              updateBreakpointHitCount(matchingBreakpoint.address, newHitCount);
              setBreakpointData((prevData) => {
                const instructionParts = (
                  exceptionInfo.instruction.split(": ")[1] ||
                  exceptionInfo.instruction
                )
                  .trim()
                  .split(/\s+/);
                const mnemonic = instructionParts[0];
                const operands = instructionParts.slice(1).join(" ");

                const newBreakpointEntry = {
                  address: pcAddress,
                  hits: newHitCount,
                  mnemonic: mnemonic,
                  operands: operands,
                  register: registerInfo,
                };

                return [...prevData, newBreakpointEntry];
              });
            }
          }
        });
      } catch (error) {
        console.error("Error polling /exception:", error);
      }
    };

    const intervalId = setInterval(pollException, 100);
    return () => clearInterval(intervalId);
  }, [
    ipAddress,
    watchpoints,
    breakpoints,
    isVisible,
    updateBreakpointHitCount,
  ]);

  const handleDeleteWatchpoint = (address) => {
    setWatchpointData((prevData) => {
      const newData = { ...prevData };
      delete newData[address];
      return newData;
    });
  };

  const handleTabChange = (event, newValue) => {
    setActiveTab(newValue);
  };

  return (
    <Box className="flex flex-col min-h-screen">
      <Box className="flex-grow p-8">
        <Card className="w-full">
          <CardHeader title={<Typography variant="h5">Debugger</Typography>} />
          <CardContent>
            <StyledTabs
              value={activeTab}
              onChange={handleTabChange}
              aria-label="debugger tabs"
            >
              <StyledTab label="Watchpoints" />
              <StyledTab label="Breakpoints" />
            </StyledTabs>
            <Box sx={{ p: 3 }}>
              {activeTab === 0 && (
                <Box className="overflow-y-auto max-h-[700px]">
                  {Object.values(watchpointData).map((data: any) => (
                    <WatchPointTable
                      key={data.address.toString()}
                      watchpointData={data}
                      onDelete={handleDeleteWatchpoint}
                    />
                  ))}
                </Box>
              )}
              {activeTab === 1 && (
                <Box className="overflow-y-auto max-h-[700px]">
                  <BreakPointView breakpointData={breakpointData} />
                </Box>
              )}
            </Box>
          </CardContent>
        </Card>
      </Box>
    </Box>
  );
}

export default Debugger;
