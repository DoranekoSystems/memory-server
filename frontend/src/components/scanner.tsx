import React, { useState, useEffect, useRef } from "react";
import axios from "axios";
import { useStore } from "./global-store";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { TriStateCheckbox, NormalCheckbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import ScanTable from "./ui/scantable";
import TabBar from "@/components/tabbar";

import {
  convertFromLittleEndianHex,
  convertToLittleEndianHex,
} from "../lib/converter";
import { getMemoryRegions } from "../lib/api";

export function Scanner({ currentPage }) {
  // State
  const [tabs, setTabs] = useState([{ id: "Scan 1", label: "Scan 1" }]);
  const [activeTab, setActiveTab] = useState("Scan 1");
  const [tabStates, setTabStates] = useState({
    "Scan 1": {
      addressRange: {
        start: BigInt(0),
        end: BigInt("0x7FFFFFFFFFFFFF"),
      },
      scanResults: [],
      scanResultsCount: 0,
      isScanRounded: false,
      scanValue: "0",
      dataType: "int32",
      findType: "exact",
      filterType: "exact",
      protection: {
        read: 2,
        write: 1,
        execute: 0,
      },
      isFirstScan: true,
      isLoading: false,
      isFinding: false,
      isFiltering: false,
      selectedIndices: [],
      selectedAddresses: [],
      patchValue: "",
      scanAlign: 4,
      doSuspend: false,
    },
  });
  const [nextScanNumber, setNextScanNumber] = useState(2);
  const [closedNumbers, setClosedNumbers] = useState(new Set());

  // Refs
  const tableRef = useRef(null);

  // Global state
  const ipAddress = useStore((state) => state.ipAddress);
  const serverMode = useStore((state) => state.serverMode);

  // Effects
  useEffect(() => {
    const currentState = getCurrentTabState();
    const protectionString = getProtectionString(currentState.protection);
    // Use protectionString as needed
  }, [activeTab, tabStates]);

  // Helper functions
  const getCurrentTabState = () => {
    const state = tabStates[activeTab];
    return state;
  };

  const updateTabState = (updater) => {
    setTabStates((prev) => ({
      ...prev,
      [activeTab]:
        typeof updater === "function"
          ? updater(prev[activeTab])
          : { ...prev[activeTab], ...updater },
    }));
  };

  const getProtectionString = (protection) => {
    const getSymbol = (value) => (value === 0 ? "-" : value === 1 ? "*" : "+");
    return `r${getSymbol(protection.read)}w${getSymbol(
      protection.write
    )}x${getSymbol(protection.execute)}`;
  };

  // Tab management
  const addTab = () => {
    let newNumber = nextScanNumber;
    while (closedNumbers.has(newNumber)) {
      newNumber++;
    }
    const newId = `Scan ${newNumber}`;

    const initialState = {
      addressRange: {
        start: BigInt(0),
        end: BigInt("0x7FFFFFFFFFFFFF"),
      },
      protection: { read: 2, write: 1, execute: 0 },
      scanResults: [],
      scanResultsCount: 0,
      isScanRounded: false,
      scanValue: "0",
      dataType: "int32",
      findType: "exact",
      filterType: "exact",
      isFirstScan: true,
      isLoading: false,
      isFinding: false,
      isFiltering: false,
      selectedIndices: [],
      selectedAddresses: [],
      patchValue: "",
      scanAlign: 4,
      doSuspend: false,
    };

    setTabs([...tabs, { id: newId, label: newId }]);
    setActiveTab(newId);
    setTabStates((prev) => ({
      ...prev,
      [newId]: initialState,
    }));
    setNextScanNumber(newNumber + 1);
  };

  const switchTab = (tabId) => {
    setActiveTab(tabId);
  };

  const closeTab = (tabId) => {
    const newTabs = tabs.filter((tab) => tab.id !== tabId);
    setTabs(newTabs);
    if (activeTab === tabId) {
      setActiveTab(newTabs[newTabs.length - 1].id);
    }
    setTabStates((prev) => {
      const { [tabId]: _, ...rest } = prev;
      return rest;
    });
    const closedNumber = parseInt(tabId.split(" ")[1]);
    setClosedNumbers((prev) => new Set(prev).add(closedNumber));
  };

  // Scan functions
  const handleInit = () => {
    updateTabState({
      scanValue: "",
      findType: "exact",
      isFirstScan: true,
      scanResults: [],
      selectedIndices: [],
      selectedAddresses: [],
      isScanRounded: false,
      scanResultsCount: 0,
    });
  };

  const handleFind = async () => {
    const currentState = getCurrentTabState();
    if (currentState.scanValue === "" && currentState.findType !== "unknown") {
      return;
    }

    updateTabState({
      isFirstScan: false,
      isLoading: true,
      isFinding: true,
      selectedIndices: [],
    });

    try {
      const pattern = convertToLittleEndianHex(
        currentState.scanValue,
        currentState.dataType
      );
      const filteredRegions = await getMemoryRegions(
        ipAddress,
        getProtectionString(currentState.protection)
      );
      const scanRanges = filteredRegions.map((region) => [
        parseInt(region.start_address, 16),
        parseInt(region.end_address, 16),
      ]);
      const _addressRanges = scanRanges.filter(
        ([start, end]) =>
          BigInt(start) >= currentState.addressRange.start &&
          BigInt(end) <= currentState.addressRange.end
      );
      const response = await axios.post(`http://${ipAddress}:3030/memoryscan`, {
        pattern,
        address_ranges: _addressRanges,
        find_type: currentState.findType,
        data_type: currentState.dataType,
        align: currentState.scanAlign || 1,
        scan_id: activeTab,
        return_as_json: true,
        do_suspend: currentState.doSuspend,
      });

      if (response.status === 200) {
        updateTabState({
          scanResults: response.data.matched_addresses || [],
          scanResultsCount: response.data.found,
          isScanRounded: response.data.is_rounded,
        });
      } else {
        console.error(`Memory scan failed: ${response.status}`);
      }
    } catch (error) {
      console.error("Error scanning memory:", error);
    } finally {
      updateTabState({
        isLoading: false,
        isFinding: false,
      });
    }
  };

  const handleFilter = async () => {
    const currentState = getCurrentTabState();
    updateTabState({
      isLoading: true,
      isFiltering: true,
      selectedIndices: [],
      selectedAddresses: [],
    });

    try {
      const pattern = convertToLittleEndianHex(
        currentState.scanValue,
        currentState.dataType
      );
      const response = await axios.post(
        `http://${ipAddress}:3030/memoryfilter`,
        {
          pattern,
          data_type: currentState.dataType,
          scan_id: activeTab,
          filter_method: currentState.filterType,
          return_as_json: true,
          do_suspend: currentState.doSuspend,
        }
      );

      if (response.status === 200) {
        updateTabState({
          scanResults: response.data.matched_addresses || [],
          scanResultsCount: response.data.found,
          isScanRounded: response.data.is_rounded,
        });
      } else {
        console.error(`Memory filter failed: ${response.status}`);
      }
    } catch (error) {
      console.error("Error filtering memory:", error);
    } finally {
      updateTabState({
        isLoading: false,
        isFiltering: false,
      });
    }
  };

  // UI event handlers
  const handleSelect = (index, address) => {
    updateTabState((prevState) => {
      const newSelectedIndices = prevState.selectedIndices.includes(index)
        ? prevState.selectedIndices.filter((i) => i !== index)
        : [...prevState.selectedIndices, index];
      const newSelectedAddresses = prevState.selectedAddresses.includes(address)
        ? prevState.selectedAddresses.filter((a) => a !== address)
        : [...prevState.selectedAddresses, address];

      return {
        ...prevState,
        selectedIndices: newSelectedIndices.sort((a, b) => a - b),
        selectedAddresses: newSelectedAddresses,
      };
    });
  };

  const handlePatchValue = (e) => {
    updateTabState({ patchValue: e.target.value });
  };

  const handlePatch = async () => {
    const currentState = getCurrentTabState();
    let hexString = convertToLittleEndianHex(
      currentState.patchValue,
      currentState.dataType
    );
    if (currentState.dataType === "regex") {
      hexString = Array.from(new TextEncoder().encode(hexString))
        .map((charCode) => charCode.toString(16).padStart(2, "0"))
        .join("");
    }
    const buffer = new Uint8Array(
      hexString.match(/.{1,2}/g).map((byte) => parseInt(byte, 16))
    );

    for (const address of currentState.selectedAddresses) {
      try {
        await axios.post(`http://${ipAddress}:3030/writememory`, {
          address: address,
          buffer: Array.from(buffer),
        });
        console.log(
          `Memory patched successfully for address: 0x${BigInt(address)
            .toString(16)
            .toUpperCase()}`
        );
      } catch (error) {
        console.error("Error patching memory:", error);
      }
    }
  };

  const handleDeselect = () => {
    updateTabState({
      selectedIndices: [],
      selectedAddresses: [],
    });
  };

  const handleProtectionChange = (type) => {
    updateTabState((prevState) => ({
      ...prevState,
      protection: {
        ...prevState.protection,
        [type]: (prevState.protection[type] + 1) % 3,
      },
    }));
  };

  const handleAddressRangeChange = (type, value) => {
    updateTabState((prevState) => {
      let newValue;
      try {
        newValue = value === "" ? BigInt(0) : BigInt(`0x${value}`);
      } catch (error) {
        console.error(`Invalid address value: ${value}`);
        return prevState;
      }

      return {
        ...prevState,
        addressRange: {
          ...prevState.addressRange,
          [type]: newValue,
        },
      };
    });
  };

  const handleResetAddressRange = () => {
    updateTabState({
      addressRange: {
        start: BigInt(0),
        end: BigInt("0x7FFFFFFFFFFFFF"),
      },
    });
  };

  // Render
  return (
    <div className="flex flex-col min-h-screen">
      <main className="flex flex-col items-center flex-grow mt-8 px-4">
        <TabBar
          tabs={tabs}
          activeTab={activeTab}
          onAddTab={addTab}
          onSwitchTab={switchTab}
          onCloseTab={closeTab}
        />
        <Card className="w-full max-w-4xl mb-6">
          <CardHeader>
            <CardTitle className="text-2xl">Memory Scan</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="scan-value">Scan Value</Label>
              <Input
                id="scan-value"
                placeholder=""
                value={getCurrentTabState().scanValue}
                onChange={(e) => updateTabState({ scanValue: e.target.value })}
                disabled={
                  getCurrentTabState().isFirstScan &&
                  getCurrentTabState().findType === "unknown"
                }
                autoComplete="off"
              />
            </div>
            <div className="flex flex-col space-y-2 md:flex-row md:space-x-2 md:space-y-0">
              <Button
                className="w-full bg-blue-700 hover:bg-blue-800 text-white"
                variant="secondary"
                onClick={
                  getCurrentTabState().isFirstScan ? handleFind : handleInit
                }
                disabled={getCurrentTabState().isLoading}
              >
                {getCurrentTabState().isFinding
                  ? "Finding..."
                  : getCurrentTabState().isFirstScan
                  ? "First Scan"
                  : "New Scan"}
              </Button>
              <Button
                className="w-full bg-green-700 hover:bg-green-800 text-white"
                variant="secondary"
                onClick={handleFilter}
                disabled={
                  getCurrentTabState().isLoading ||
                  getCurrentTabState().isFirstScan
                }
              >
                {getCurrentTabState().isFiltering
                  ? "Filtering..."
                  : "Next Scan"}
              </Button>
            </div>
            <div className="space-y-2">
              <Label htmlFor="filter-type">
                {getCurrentTabState().isFirstScan ? "Find Type" : "Filter Type"}
              </Label>
              <Select
                value={
                  getCurrentTabState().isFirstScan
                    ? getCurrentTabState().findType
                    : getCurrentTabState().filterType
                }
                onValueChange={(value) =>
                  updateTabState(
                    getCurrentTabState().isFirstScan
                      ? { findType: value }
                      : { filterType: value }
                  )
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="exact" />
                </SelectTrigger>
                <SelectContent>
                  {getCurrentTabState().isFirstScan ? (
                    <>
                      <SelectItem value="exact">exact</SelectItem>
                      <SelectItem value="unknown">unknown</SelectItem>
                    </>
                  ) : (
                    <>
                      {getCurrentTabState().findType === "exact" ||
                      (getCurrentTabState().findType === "unknown" &&
                        getCurrentTabState().scanResultsCount < 1000000) ? (
                        <SelectItem value="exact">exact</SelectItem>
                      ) : null}
                      <SelectItem value="changed">changed</SelectItem>
                      <SelectItem value="unchanged">unchanged</SelectItem>
                      <SelectItem value="increased">increased</SelectItem>
                      <SelectItem value="decreased">decreased</SelectItem>
                    </>
                  )}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="scan-type">Data Type</Label>
              <Select
                value={getCurrentTabState().dataType}
                onValueChange={(value) => updateTabState({ dataType: value })}
                disabled={!getCurrentTabState().isFirstScan}
              >
                <SelectTrigger>
                  <SelectValue placeholder="int32" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="int8">int8</SelectItem>
                  <SelectItem value="uint8">uint8</SelectItem>
                  <SelectItem value="int16">int16</SelectItem>
                  <SelectItem value="uint16">uint16</SelectItem>
                  <SelectItem value="int32">int32</SelectItem>
                  <SelectItem value="uint32">uint32</SelectItem>
                  <SelectItem value="int64">int64</SelectItem>
                  <SelectItem value="uint64">uint64</SelectItem>
                  <SelectItem value="float">float</SelectItem>
                  <SelectItem value="double">double</SelectItem>
                  <SelectItem value="utf-8">utf-8</SelectItem>
                  <SelectItem value="utf-16">utf-16</SelectItem>
                  <SelectItem value="aob">array of byte</SelectItem>
                  <SelectItem value="regex">regex</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-wrap items-center space-x-2">
              <TriStateCheckbox
                id="read"
                label="Read"
                value={getCurrentTabState().protection.read}
                onStateChange={() => handleProtectionChange("read")}
              />
              <TriStateCheckbox
                id="write"
                label="Write"
                value={getCurrentTabState().protection.write}
                onStateChange={() => handleProtectionChange("write")}
              />
              <TriStateCheckbox
                id="execute"
                label="Execute"
                value={getCurrentTabState().protection.execute}
                onStateChange={() => handleProtectionChange("execute")}
              />
            </div>
            <div className="flex flex-col space-y-2 md:flex-row md:space-x-2 md:space-y-0">
              <Input
                placeholder="0"
                value={getCurrentTabState()
                  .addressRange.start.toString(16)
                  .toUpperCase()}
                onChange={(e) =>
                  handleAddressRangeChange("start", e.target.value)
                }
                disabled={!getCurrentTabState().isFirstScan}
              />
              <Input
                placeholder="0x7FFFFFFFFFFFFF"
                value={getCurrentTabState()
                  .addressRange.end.toString(16)
                  .toUpperCase()}
                onChange={(e) =>
                  handleAddressRangeChange("end", e.target.value)
                }
                disabled={!getCurrentTabState().isFirstScan}
              />
              <Button
                variant="destructive"
                onClick={handleResetAddressRange}
                disabled={!getCurrentTabState().isFirstScan}
              >
                Reset
              </Button>
            </div>
            <div className="space-y-2">
              <Label htmlFor="alignment">Alignment(Hex)</Label>
              <Input
                id="alignment"
                placeholder="1"
                value={getCurrentTabState()
                  .scanAlign.toString(16)
                  .toUpperCase()}
                onChange={(e) => {
                  const value = e.target.value;
                  updateTabState({
                    scanAlign: value === "" ? "" : parseInt(value, 16) || "",
                  });
                }}
                disabled={!getCurrentTabState().isFirstScan}
              />
            </div>
            {serverMode !== "embedded" && (
              <NormalCheckbox
                id="suspend"
                label="Suspend the process during scanning"
                value={getCurrentTabState().doSuspend ? 1 : 0}
                onStateChange={(state) => {
                  updateTabState({
                    doSuspend: state === 1,
                  });
                }}
              />
            )}
          </CardContent>
        </Card>
        <Card className="w-full max-w-4xl mb-6">
          <CardHeader>
            <CardTitle className="text-2xl">Scan Data List</CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">
              {getCurrentTabState().isScanRounded ? (
                <>
                  {getCurrentTabState().findType === "unknown" &&
                  getCurrentTabState().scanResultsCount > 1000000
                    ? `During unknown search: display only if count is less than 1,000,000 (Current count: ${getCurrentTabState().scanResultsCount.toLocaleString()})`
                    : `Results limited to 100,000 (Full set: ${getCurrentTabState().scanResultsCount.toLocaleString()})`}
                </>
              ) : (
                <>
                  Results:{" "}
                  {getCurrentTabState().scanResultsCount.toLocaleString()}
                </>
              )}
            </p>
          </CardHeader>
          <CardContent className="overflow-y-auto max-h-[500px]">
            <ScanTable
              ref={tableRef}
              scanResults={getCurrentTabState().scanResults || []}
              setScanResults={(newResults) =>
                updateTabState({ scanResults: newResults })
              }
              selectedIndices={getCurrentTabState().selectedIndices}
              handleSelect={handleSelect}
              dataType={getCurrentTabState().dataType}
              convertFromLittleEndianHex={convertFromLittleEndianHex}
            />
          </CardContent>
        </Card>
        <Card className="w-full max-w-4xl">
          <CardHeader>
            <CardTitle className="text-2xl">Memory Editor</CardTitle>
            <p>
              Selected Indexes:{" "}
              {getCurrentTabState().selectedIndices.join(", ")}
            </p>
          </CardHeader>
          <CardContent>
            <div className="flex items-center space-x-2">
              <Input
                type="text"
                placeholder="Enter patch value"
                value={getCurrentTabState().patchValue}
                onChange={handlePatchValue}
              />
              <Button onClick={handlePatch}>Patch</Button>
              <Button onClick={handleDeselect}>Deselect</Button>
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
