import React, { useState } from "react";
import { useStore, useBreakpointStore } from "@/lib/global-store";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/common/Card";
import { Label } from "@/components/common/Label";
import { Input } from "@/components/common/Input";
import { Button } from "@/components/common/Button";
import BreakTraceTable from "./BreakTraceTable";
import { isHexadecimal } from "@/lib/utils";
import { setBreakPoint } from "@/lib/api";

const BreakPointView = ({ breakpointData }) => {
  const [newAddress, setNewAddress] = useState("");
  const [newHitCount, setNewHitCount] = useState("10");
  const addBreakpoint = useBreakpointStore((state) => state.addBreakpoint);
  const ipAddress = useStore((state) => state.ipAddress);

  const handleAddressChange = (e) => {
    setNewAddress(e.target.value);
  };

  const handleHitCountChange = (e) => {
    setNewHitCount(e.target.value);
  };

  const handleAddNewBreakpoint = async () => {
    let resolveAddr = newAddress;
    if (!isHexadecimal(newAddress)) {
      let tmp = await resolveAddress(ipAddress, newAddress);
      resolveAddr = BigInt(tmp).toString(16);
    }
    addBreakpoint({
      address: parseInt(resolveAddr, 16),
      hitCount: parseInt(newHitCount, 10),
    });
    await setBreakPoint(
      ipAddress,
      parseInt(resolveAddr, 16),
      parseInt(newHitCount, 10)
    );
    setNewAddress("");
    setNewHitCount("10");
  };

  return (
    <div className="flex flex-col min-h-screen">
      <main className="flex flex-col items-center flex-grow mt-8 px-4">
        <Card className="w-full max-w-4xl mb-6">
          <CardHeader>
            <CardTitle className="text-2xl mb-2">BreakTrace</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="mb-6">
              <Label htmlFor="address">Address</Label>
              <Input
                id="address"
                value={newAddress}
                onChange={handleAddressChange}
                className="mb-2"
              />
              <Label htmlFor="hitCount">Hit Count</Label>
              <Input
                id="hitCount"
                value={newHitCount}
                onChange={handleHitCountChange}
                className="mb-2"
              />
              <Button
                onClick={handleAddNewBreakpoint}
                className="bg-blue-600 hover:bg-blue-700 text-white"
              >
                Set Breakpoint
              </Button>
            </div>
            {breakpointData && <BreakTraceTable data={breakpointData} />}
          </CardContent>
        </Card>
      </main>
    </div>
  );
};

export default BreakPointView;
