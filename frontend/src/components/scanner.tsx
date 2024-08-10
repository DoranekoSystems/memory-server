import axios from "axios";
import React, { useState, useEffect, useRef } from "react";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import ScanTable from "./ui/scantable";

import {
  getByteLengthFromScanType,
  arrayBufferToLittleEndianHexString,
  convertFromLittleEndianHex,
  convertToLittleEndianHex,
} from "../lib/converter";

import { getMemoryRegions, readProcessMemory } from "../lib/api";

const TabBar = ({ tabs, activeTab, onAddTab, onSwitchTab, onCloseTab }) => {
  const [showScrollButtons, setShowScrollButtons] = useState(false);
  const tabsRef = useRef(null);
  const containerRef = useRef(null);

  useEffect(() => {
    const checkScroll = () => {
      if (tabsRef.current && containerRef.current) {
        setShowScrollButtons(
          tabsRef.current.scrollWidth > containerRef.current.clientWidth
        );
      }
    };

    checkScroll();
    window.addEventListener("resize", checkScroll);
    return () => window.removeEventListener("resize", checkScroll);
  }, [tabs]);

  const scroll = (direction) => {
    if (tabsRef.current) {
      const scrollAmount = direction === "left" ? -200 : 200;
      tabsRef.current.scrollBy({ left: scrollAmount, behavior: "smooth" });
    }
  };

  const handleCloseTab = (e, tabId) => {
    e.stopPropagation();
    if (tabs.length > 1) {
      onCloseTab(tabId);
    }
  };

  return (
    <div
      ref={containerRef}
      className="relative w-full bg-[#dee1e6] dark:bg-gray-800 mb-[5px]"
    >
      <div className="flex items-end">
        {showScrollButtons && (
          <button
            className="flex-shrink-0 p-2 text-gray-600 dark:text-gray-400 hover:bg-gray-300 dark:hover:bg-gray-700 focus:outline-none"
            onClick={() => scroll("left")}
          >
            ◀
          </button>
        )}
        <div
          ref={tabsRef}
          className="flex overflow-x-auto scrollbar-hide flex-grow"
          style={{ scrollBehavior: "smooth" }}
        >
          {tabs.map((tab, index) => (
            <div
              key={tab.id}
              className={`group relative flex-shrink-0 flex items-center h-9 px-3 mr-1 rounded-t-lg cursor-pointer transition-all duration-200 ease-in-out ${
                activeTab === tab.id
                  ? "bg-white dark:bg-gray-700 text-gray-800 dark:text-white"
                  : "bg-[#f1f3f4] dark:bg-gray-600 text-gray-600 dark:text-gray-300 hover:bg-[#e8eaed] dark:hover:bg-gray-500"
              }`}
              style={{
                minWidth: "28px",
                maxWidth: "240px",
              }}
              onClick={() => onSwitchTab(tab.id)}
            >
              <span className="text-sm font-medium truncate flex-grow">
                {tab.label}
              </span>
              {tabs.length > 1 && (
                <button
                  className={`ml-2 w-4 h-4 rounded-full flex items-center justify-center ${
                    activeTab === tab.id
                      ? "text-gray-500 hover:text-gray-700 hover:bg-gray-200"
                      : "text-gray-400 hover:text-gray-600 hover:bg-gray-300"
                  } opacity-0 group-hover:opacity-100 transition-opacity focus:outline-none`}
                  onClick={(e) => handleCloseTab(e, tab.id)}
                >
                  ×
                </button>
              )}
              {index < tabs.length - 1 && (
                <div className="absolute right-0 top-1/4 bottom-1/4 w-px bg-gray-300 dark:bg-gray-600"></div>
              )}
            </div>
          ))}
        </div>
        {showScrollButtons && (
          <button
            className="flex-shrink-0 p-2 text-gray-600 dark:text-gray-400 hover:bg-gray-300 dark:hover:bg-gray-700 focus:outline-none"
            onClick={() => scroll("right")}
          >
            ▶
          </button>
        )}
        <button
          className="flex-shrink-0 w-9 h-9 flex items-center justify-center text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700 focus:outline-none rounded-t-lg"
          onClick={onAddTab}
        >
          +
        </button>
      </div>
    </div>
  );
};

export function Scanner({ currentPage }) {
  const [tabs, setTabs] = useState([{ id: "Scan 1", label: "Scan 1" }]);
  const [activeTab, setActiveTab] = useState("Scan 1");
  const [tabStates, setTabStates] = useState({
    "Scan 1": {
      addressRanges: [[BigInt(0), BigInt("0x7FFFFFFFFFFFFF")]],
      scanResults: [],
      scanResultsCount: 0,
      isScanRounded: false,
      scanValue: "0",
      dataType: "int32",
      findType: "exact",
      filterType: "exact",
      protection: "r+w*x-",
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

  const ipAddress = useStore((state) => state.ipAddress);
  const serverMode = useStore((state) => state.serverMode);
  const targetOS = useStore((state) => state.targetOS);
  const [loading, setLoading] = useState(true);
  const tableRef = useRef(null);

  useEffect(() => {}, [loading, tabStates, ipAddress]);

  const getCurrentTabState = () => tabStates[activeTab];

  const updateTabState = (updates) => {
    setTabStates((prev) => ({
      ...prev,
      [activeTab]: { ...prev[activeTab], ...updates },
    }));
  };

  const addTab = () => {
    let newNumber = nextScanNumber;
    while (closedNumbers.has(newNumber)) {
      newNumber++;
    }
    const newId = `Scan ${newNumber}`;
    setTabs([...tabs, { id: newId, label: newId }]);
    setActiveTab(newId);
    setTabStates((prev) => ({
      ...prev,
      [newId]: {
        addressRanges: [[BigInt(0), BigInt("0x7FFFFFFFFFFFFF")]],
        scanResults: [],
        scanResultsCount: 0,
        isScanRounded: false,
        scanValue: "0",
        dataType: "int32",
        findType: "exact",
        filterType: "exact",
        protection: "r+w*x-",
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
      const newState = { ...prev };
      delete newState[tabId];
      return newState;
    });
    const closedNumber = parseInt(tabId.split(" ")[1]);
    setClosedNumbers((prev) => new Set(prev).add(closedNumber));
  };

  const handleSelect = (index, address) => {
    updateTabState((prevState) => {
      const newSelectedIndices = prevState.selectedIndices.includes(index)
        ? prevState.selectedIndices.filter((i) => i !== index)
        : [...prevState.selectedIndices, index];
      const newSelectedAddresses = prevState.selectedAddresses.includes(address)
        ? prevState.selectedAddresses.filter((a) => a !== address)
        : [...prevState.selectedAddresses, address];
      return {
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
    if (currentState.dataType == "regex") {
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

  const handleDeselect = async () => {
    updateTabState({
      selectedIndices: [],
      selectedAddresses: [],
    });
  };

  const handleInit = async () => {
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
    try {
      if (currentState.scanValue == "" && currentState.findType != "unknown") {
        return;
      }
      let align = currentState.scanAlign;
      if (currentState.scanAlign == "") {
        align = 1;
      }
      updateTabState({
        isFirstScan: false,
        isLoading: true,
        isFinding: true,
        selectedIndices: [],
      });
      const pattern = convertToLittleEndianHex(
        currentState.scanValue,
        currentState.dataType
      );
      const filteredRegions = await getMemoryRegions(
        ipAddress,
        currentState.protection
      );

      const scanRanges = filteredRegions.map((region) => [
        parseInt(region.start_address, 16),
        parseInt(region.end_address, 16),
      ]);

      const _addressRanges = scanRanges.filter(([start, end]) =>
        currentState.addressRanges.some(
          ([rangeStart, rangeEnd]) =>
            BigInt(start) >= BigInt(rangeStart) &&
            BigInt(end) <= BigInt(rangeEnd)
        )
      );

      const response = await axios.post(`http://${ipAddress}:3030/memoryscan`, {
        pattern: pattern,
        address_ranges: _addressRanges,
        find_type: currentState.findType,
        data_type: currentState.dataType,
        align: align,
        scan_id: activeTab,
        return_as_json: true,
        do_suspend: currentState.doSuspend,
      });

      if (response.status === 200) {
        const scanResults = response.data.matched_addresses || [];
        updateTabState({
          scanResults: scanResults,
          scanResultsCount: response.data.found,
          isScanRounded: response.data.is_rounded,
        });
        console.log(`Pattern found ${response.data.found} times`);
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
    try {
      updateTabState({
        isLoading: true,
        isFiltering: true,
        selectedIndices: [],
        selectedAddresses: [],
      });
      const pattern = convertToLittleEndianHex(
        currentState.scanValue,
        currentState.dataType
      );
      const response = await axios.post(
        `http://${ipAddress}:3030/memoryfilter`,
        {
          pattern: pattern,
          data_type: currentState.dataType,
          scan_id: activeTab,
          filter_method: currentState.filterType,
          return_as_json: true,
          do_suspend: currentState.doSuspend,
        }
      );
      if (response.status === 200) {
        const scanResults = response.data.matched_addresses || [];
        updateTabState({
          scanResults: scanResults,
          scanResultsCount: response.data.found,
          isScanRounded: response.data.is_rounded,
        });
        console.log(`Pattern found ${response.data.found} times`);
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

  const clickReset = async () => {
    updateTabState({
      addressRanges: [[BigInt(0), BigInt("0x7FFFFFFFFFFFFF")]],
    });
  };

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
                  getCurrentTabState().findType == "unknown"
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
                      ) : (
                        <></>
                      )}
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
                defaultState={
                  getCurrentTabState().protection.includes("r+")
                    ? 2
                    : getCurrentTabState().protection.includes("r-")
                    ? 0
                    : 1
                }
                onStateChange={(state) => {
                  updateTabState((prevState) => ({
                    protection:
                      state === 0
                        ? prevState.protection.replace("r+", "r-")
                        : state === 1
                        ? prevState.protection.replace("r-", "r*")
                        : prevState.protection.replace("r*", "r+"),
                  }));
                }}
              />
              <TriStateCheckbox
                id="write"
                label="Write"
                defaultState={
                  getCurrentTabState().protection.includes("w+")
                    ? 2
                    : getCurrentTabState().protection.includes("w-")
                    ? 0
                    : 1
                }
                onStateChange={(state) => {
                  updateTabState((prevState) => ({
                    protection:
                      state === 0
                        ? prevState.protection.replace("w+", "w-")
                        : state === 1
                        ? prevState.protection.replace("w-", "w*")
                        : prevState.protection.replace("w*", "w+"),
                  }));
                }}
              />
              <TriStateCheckbox
                id="execute"
                label="Execute"
                defaultState={
                  getCurrentTabState().protection.includes("x+")
                    ? 2
                    : getCurrentTabState().protection.includes("x-")
                    ? 0
                    : 1
                }
                onStateChange={(state) => {
                  updateTabState((prevState) => ({
                    protection:
                      state === 0
                        ? prevState.protection.replace("x+", "x-")
                        : state === 1
                        ? prevState.protection.replace("x-", "x*")
                        : prevState.protection.replace("x*", "x+"),
                  }));
                }}
              />
            </div>
            <div className="flex flex-col space-y-2 md:flex-row md:space-x-2 md:space-y-0">
              <Input
                placeholder="0"
                value={getCurrentTabState().addressRanges[0][0].toString(16)}
                onChange={(e) =>
                  updateTabState((prevState) => ({
                    addressRanges: [
                      [
                        BigInt(parseInt(e.target.value, 16)),
                        prevState.addressRanges[0][1],
                      ],
                    ],
                  }))
                }
                disabled={!getCurrentTabState().isFirstScan}
              />
              <Input
                placeholder="0x7FFFFFFFFFFFFF"
                value={getCurrentTabState()
                  .addressRanges[0][1].toString(16)
                  .toUpperCase()}
                onChange={(e) =>
                  updateTabState((prevState) => ({
                    addressRanges: [
                      [
                        prevState.addressRanges[0][0],
                        BigInt(parseInt(e.target.value, 16)),
                      ],
                    ],
                  }))
                }
                disabled={!getCurrentTabState().isFirstScan}
              />
              <Button
                variant="destructive"
                onClick={clickReset}
                disabled={!getCurrentTabState().isFirstScan}
              >
                Reset
              </Button>
            </div>
            <div className="space-y-2">
              <Label htmlFor="filter-type">Alignment(Hex)</Label>
              <Input
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
            {serverMode != "embedded" && (
              <NormalCheckbox
                id="suspend"
                label="Suspend the process during scanning"
                defaultState={getCurrentTabState().doSuspend ? 1 : 0}
                onStateChange={(state) => {
                  updateTabState({
                    doSuspend: state === 1,
                  });
                }}
              ></NormalCheckbox>
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
