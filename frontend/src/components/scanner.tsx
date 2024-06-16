import axios from "axios";
import { useState, useEffect, useRef } from "react";
import { useStore } from "./global-store";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { TriStateCheckbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import CustomTable from "../components/ui/customtable";

import {
  getByteLengthFromScanType,
  arrayBufferToLittleEndianHexString,
  convertFromLittleEndianHex,
  convertToLittleEndianHex,
} from "../lib/converter";

import { getMemoryRegions, readProcessMemory } from "../lib/api";

export function Scanner() {
  const [addressRanges, setAddressRanges] = useState<[bigint, bigint][]>([
    [BigInt(0), BigInt("0x7FFFFFFFFFFFFF")],
  ]);
  const [scanResults, setScanResults] = useState<any[]>([]);
  const [scanValue, setScanValue] = useState("0");
  const [dataType, setDataType] = useState("int32");
  const [findType, setFindType] = useState("exact");
  const [filterType, setFilterType] = useState("exact");
  const [protection, setProtection] = useState<string>("r+w*x-");
  const [isFirstScan, setIsFirstScan] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [isFinding, setIsFinding] = useState(false);
  const [isFiltering, setIsFiltering] = useState(false);
  const ipAddress = useStore((state) => state.ipAddress);
  const [loading, setLoading] = useState(true);
  const [selectedIndices, setSelectedIndices] = useState([]);
  const [selectedAddresses, setSelectedAddresses] = useState([]);
  const [patchValue, setPatchValue] = useState("");
  const tableRef = useRef(null);

  useEffect(() => {}, [loading, scanResults, ipAddress, dataType]);

  const handleSelect = (index, address) => {
    setSelectedIndices((prevIndices) => {
      if (prevIndices.includes(index)) {
        return prevIndices.filter((i) => i !== index).sort((a, b) => a - b);
      } else {
        return [...prevIndices, index].sort((a, b) => a - b);
      }
    });
    setSelectedAddresses((prevAddresses) => {
      if (prevAddresses.includes(address)) {
        return prevAddresses.filter((a) => a !== address);
      } else {
        return [...prevAddresses, address];
      }
    });
  };

  const handlePatchValue = (e) => {
    setPatchValue(e.target.value);
  };

  const handlePatch = async () => {
    let hexString = convertToLittleEndianHex(patchValue, dataType);
    if (dataType == "regex") {
      hexString = Array.from(new TextEncoder().encode(hexString))
        .map((charCode) => charCode.toString(16).padStart(2, "0"))
        .join("");
    }
    const buffer = new Uint8Array(
      hexString.match(/.{1,2}/g).map((byte) => parseInt(byte, 16))
    );

    for (const address of selectedAddresses) {
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
    setSelectedIndices([]);
    setSelectedAddresses([]);
  };

  const handleInit = async () => {
    setScanValue("");
    setFindType("exact");
    setIsFirstScan(true);
    setScanResults([]);
    setSelectedIndices([]);
    setSelectedAddresses([]);
  };

  const handleFind = async () => {
    try {
      if (scanValue == "" && findType != "unknown") {
        return;
      }
      setIsFirstScan(false);
      setIsLoading(true);
      setIsFinding(true);
      setSelectedIndices([]);
      const pattern = convertToLittleEndianHex(scanValue, dataType);
      const filteredRegions = await getMemoryRegions(ipAddress, protection);

      const scanRanges = filteredRegions.map((region: any) => [
        parseInt(region.start_address, 16),
        parseInt(region.end_address, 16),
      ]);

      const _addressRanges = scanRanges.filter(([start, end]) =>
        addressRanges.some(
          ([rangeStart, rangeEnd]) =>
            BigInt(start) >= BigInt(rangeStart) &&
            BigInt(end) <= BigInt(rangeEnd)
        )
      );

      const response = await axios.post(`http://${ipAddress}:3030/memoryscan`, {
        pattern: pattern,
        address_ranges: _addressRanges,
        find_type: findType,
        data_type: dataType,
        scan_id: "Scan 1",
        return_as_json: true,
      });

      if (response.status === 200) {
        const scanResults = response.data.matched_addresses || [];
        setScanResults(scanResults);
        console.log(`Pattern found ${response.data.found} times`);
      } else {
        console.error(`Memory scan failed: ${response.status}`);
      }
    } catch (error) {
      console.error("Error scanning memory:", error);
    } finally {
      setIsLoading(false);
      setIsFinding(false);
    }
  };

  const handleFilter = async () => {
    try {
      setIsLoading(true);
      setIsFiltering(true);
      setSelectedIndices([]);
      setSelectedIndices([]);
      const pattern = convertToLittleEndianHex(scanValue, dataType);
      const response = await axios.post(
        `http://${ipAddress}:3030/memoryfilter`,
        {
          pattern: pattern,
          data_type: dataType,
          scan_id: "Scan 1",
          filter_method: filterType,
          return_as_json: true,
        }
      );
      if (response.status === 200) {
        const scanResults = response.data.matched_addresses || [];
        setScanResults(scanResults);
        console.log(`Pattern found ${response.data.found} times`);
      } else {
        console.error(`Memory filter failed: ${response.status}`);
      }
    } catch (error) {
      console.error("Error filtering memory:", error);
    } finally {
      setIsLoading(false);
      setIsFiltering(false);
    }
  };

  const clickReset = async () => {
    setAddressRanges([[BigInt(0), BigInt("0x7FFFFFFFFFFFFF")]]);
  };

  return (
    <div className="flex flex-col min-h-screen">
      <main className="flex flex-col items-center flex-grow mt-8 px-4">
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
                value={scanValue}
                onChange={(e) => setScanValue(e.target.value)}
                disabled={isFirstScan && findType == "unknown"}
                autoComplete="off"
              />
            </div>
            <div className="flex flex-col space-y-2 md:flex-row md:space-x-2 md:space-y-0">
              <Button
                className="w-full bg-blue-700 hover:bg-blue-800 text-white"
                variant="secondary"
                onClick={isFirstScan ? handleFind : handleInit}
                disabled={isLoading}
              >
                {isFinding
                  ? "Finding..."
                  : isFirstScan
                  ? "First Scan"
                  : "New Scan"}
              </Button>
              <Button
                className="w-full bg-green-700 hover:bg-green-800 text-white"
                variant="secondary"
                onClick={handleFilter}
                disabled={isLoading || isFirstScan}
              >
                {isFiltering ? "Filtering..." : "Next Scan"}
              </Button>
            </div>
            <div className="space-y-2">
              <Label htmlFor="filter-type">
                {isFirstScan ? "Find Type" : "Filter Type"}
              </Label>
              <Select
                value={isFirstScan ? findType : filterType}
                onValueChange={isFirstScan ? setFindType : setFilterType}
              >
                <SelectTrigger>
                  <SelectValue placeholder="exact" />
                </SelectTrigger>
                <SelectContent>
                  {isFirstScan ? (
                    <>
                      <SelectItem value="exact">exact</SelectItem>
                      <SelectItem value="unknown">unknown</SelectItem>
                    </>
                  ) : (
                    <>
                      <SelectItem value="exact">exact</SelectItem>
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
                value={dataType}
                onValueChange={setDataType}
                disabled={!isFirstScan}
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
                  protection.includes("r+")
                    ? 2
                    : protection.includes("r-")
                    ? 0
                    : 1
                }
                onStateChange={(state) => {
                  if (state === 0) {
                    setProtection((prevProtection) =>
                      prevProtection.replace("r+", "r-")
                    );
                  } else if (state === 1) {
                    setProtection((prevProtection) =>
                      prevProtection.replace("r-", "r*")
                    );
                  } else {
                    setProtection((prevProtection) =>
                      prevProtection.replace("r*", "r+")
                    );
                  }
                }}
              />
              <TriStateCheckbox
                id="write"
                label="Write"
                defaultState={
                  protection.includes("w+")
                    ? 2
                    : protection.includes("w-")
                    ? 0
                    : 1
                }
                onStateChange={(state) => {
                  if (state === 0) {
                    setProtection((prevProtection) =>
                      prevProtection.replace("w+", "w-")
                    );
                  } else if (state === 1) {
                    setProtection((prevProtection) =>
                      prevProtection.replace("w-", "w*")
                    );
                  } else {
                    setProtection((prevProtection) =>
                      prevProtection.replace("w*", "w+")
                    );
                  }
                }}
              />
              <TriStateCheckbox
                id="execute"
                label="Execute"
                defaultState={
                  protection.includes("x+")
                    ? 2
                    : protection.includes("x-")
                    ? 0
                    : 1
                }
                onStateChange={(state) => {
                  if (state === 0) {
                    setProtection((prevProtection) =>
                      prevProtection.replace("x+", "x-")
                    );
                  } else if (state === 1) {
                    setProtection((prevProtection) =>
                      prevProtection.replace("x-", "x*")
                    );
                  } else {
                    setProtection((prevProtection) =>
                      prevProtection.replace("x*", "x+")
                    );
                  }
                }}
              />
            </div>
            <div className="flex flex-col space-y-2 md:flex-row md:space-x-2 md:space-y-0">
              <Input
                placeholder="0"
                value={addressRanges[0][0].toString(16)}
                onChange={(e) =>
                  setAddressRanges([
                    [BigInt(parseInt(e.target.value, 16)), addressRanges[0][1]],
                  ])
                }
                disabled={!isFirstScan}
              />
              <Input
                placeholder="0x7FFFFFFFFFFFFF"
                value={addressRanges[0][1].toString(16).toUpperCase()}
                onChange={(e) =>
                  setAddressRanges([
                    [addressRanges[0][0], BigInt(parseInt(e.target.value, 16))],
                  ])
                }
                disabled={!isFirstScan}
              />
              <Button
                variant="destructive"
                onClick={clickReset}
                disabled={!isFirstScan}
              >
                Reset
              </Button>
            </div>
          </CardContent>
        </Card>
        <Card className="w-full max-w-4xl mb-6">
          <CardHeader>
            <CardTitle className="text-2xl">Scan Data List</CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">
              Showing {scanResults.length} results
            </p>
          </CardHeader>
          <CardContent className="overflow-y-auto max-h-[500px]">
            <CustomTable
              ref={tableRef}
              scanResults={scanResults}
              setScanResults={setScanResults}
              selectedIndices={selectedIndices}
              handleSelect={handleSelect}
              dataType={dataType}
              convertFromLittleEndianHex={convertFromLittleEndianHex}
            />
          </CardContent>
        </Card>
        <Card className="w-full max-w-4xl">
          <CardHeader>
            <CardTitle className="text-2xl">Memory Editor</CardTitle>
            <p>Selected Indexes: {selectedIndices.join(", ")}</p>
          </CardHeader>
          <CardContent>
            <div className="flex items-center space-x-2">
              <Input
                type="text"
                placeholder="Enter patch value"
                value={patchValue}
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
