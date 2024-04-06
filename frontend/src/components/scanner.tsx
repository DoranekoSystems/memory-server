import axios from "axios";
import { useState, useEffect } from "react";
import { useStore } from "./global-store";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
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

const TriStateCheckbox = ({ id, label, defaultState, onStateChange }) => {
  const [state, setState] = useState(defaultState);

  const handleClick = () => {
    const newState = (state + 1) % 3;
    setState(newState);
    onStateChange(newState);
  };

  return (
    <div className="flex items-center space-x-2">
      <div
        className={`w-4 h-4 border border-gray-300 rounded-sm cursor-pointer ${
          state === 1 ? "bg-gray-300" : state === 2 ? "bg-blue-500" : ""
        }`}
        onClick={handleClick}
      />
      <Label htmlFor={id}>{label}</Label>
    </div>
  );
};

export function Scanner() {
  const [addressRanges, setAddressRanges] = useState<[bigint, bigint][]>([
    [BigInt(0), BigInt("0x7FFFFFFFFFFFFF")],
  ]);
  const [scanResults, setScanResults] = useState<any[]>([]);
  const [scanValue, setScanValue] = useState("0");
  const [scanType, setScanType] = useState("int32");
  const [filterType, setFilterType] = useState("exact");
  const [protection, setProtection] = useState<string>("r+w*x-");
  const [isLoading, setIsLoading] = useState(false);
  const [isFinding, setIsFinding] = useState(false);
  const [isFiltering, setIsFiltering] = useState(false);
  const ipAddress = useStore((state) => state.ipAddress);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(false);
  }, [loading, scanResults]);

  const convertFromLittleEndianHex = (hex: string, type: string) => {
    const buffer = new ArrayBuffer(hex.length / 2);
    const view = new DataView(buffer);

    hex.match(/.{1,2}/g)?.forEach((byte, i) => {
      view.setUint8(i, parseInt(byte, 16));
    });

    switch (type) {
      case "int8":
        return view.getInt8(0);
      case "uint8":
        return view.getUint8(0);
      case "int16":
        return view.getInt16(0, true);
      case "uint16":
        return view.getUint16(0, true);
      case "int32":
        return view.getInt32(0, true);
      case "uint32":
        return view.getUint32(0, true);
      case "int64":
        return view.getBigInt64(0, true).toString();
      case "uint64":
        return view.getBigUint64(0, true).toString();
      case "float":
        return view.getFloat32(0, true);
      case "double":
        return view.getFloat64(0, true);
      case "utf-8":
        return new TextDecoder().decode(view);
      case "utf-16":
        const utf16 = new Uint16Array(buffer);
        return String.fromCharCode.apply(null, Array.from(utf16));
      case "aob":
      case "regex":
        return hex;
      default:
        return hex;
    }
  };

  const convertToLittleEndianHex = (value: string, type: string) => {
    let buffer: ArrayBuffer;
    let view: DataView;

    switch (type) {
      case "int8":
        buffer = new ArrayBuffer(1);
        view = new DataView(buffer);
        view.setInt8(0, parseInt(value, 10));
        break;
      case "uint8":
        buffer = new ArrayBuffer(1);
        view = new DataView(buffer);
        view.setUint8(0, parseInt(value, 10));
        break;
      case "int16":
        buffer = new ArrayBuffer(2);
        view = new DataView(buffer);
        view.setInt16(0, parseInt(value, 10), true);
        break;
      case "uint16":
        buffer = new ArrayBuffer(2);
        view = new DataView(buffer);
        view.setUint16(0, parseInt(value, 10), true);
        break;
      case "int32":
        buffer = new ArrayBuffer(4);
        view = new DataView(buffer);
        view.setInt32(0, parseInt(value, 10), true);
        break;
      case "uint32":
        buffer = new ArrayBuffer(4);
        view = new DataView(buffer);
        view.setUint32(0, parseInt(value, 10), true);
        break;
      case "int64":
        buffer = new ArrayBuffer(8);
        view = new DataView(buffer);
        view.setBigInt64(0, BigInt(value), true);
        break;
      case "uint64":
        buffer = new ArrayBuffer(8);
        view = new DataView(buffer);
        view.setBigUint64(0, BigInt(value), true);
        break;
      case "float":
        buffer = new ArrayBuffer(4);
        view = new DataView(buffer);
        view.setFloat32(0, parseFloat(value), true);
        break;
      case "double":
        buffer = new ArrayBuffer(8);
        view = new DataView(buffer);
        view.setFloat64(0, parseFloat(value), true);
        break;
      case "utf-8":
        return Array.from(new TextEncoder().encode(value))
          .map((charCode) => charCode.toString(16).padStart(2, "0"))
          .join("");
      case "utf-16":
        const utf16 = new Uint16Array(new TextEncoder().encode(value).buffer);
        return Array.from(utf16)
          .map((b) => b.toString(16).padStart(4, "0"))
          .join(" ");
      case "aob":
      case "regex":
        return value;
      default:
        return value;
    }

    return Array.from(new Uint8Array(buffer))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  };

  const getMemoryRegions = async (protection: string[]) => {
    try {
      const response = await axios.get(`http://${ipAddress}:3030/enumregions`);
      if (response.status === 200) {
        const regions = response.data.regions;
        const filteredRegions = regions.filter((region: any) => {
          const hasReadPermission = protection.includes("r+");
          const hasWritePermission = protection.includes("w+");
          const hasExecutePermission = protection.includes("x+");
          const hasNegativeReadPermission = protection.includes("r-");
          const hasNegativeWritePermission = protection.includes("w-");
          const hasNegativeExecutePermission = protection.includes("x-");

          const regionProtection = region.protection.toLowerCase();

          let f1 = true;
          let f2 = true;
          let f3 = true;

          if (regionProtection.includes("r")) {
            if (hasReadPermission) {
              f1 = true;
            }
            if (hasNegativeReadPermission) {
              f1 = false;
            }
          } else {
            if (hasReadPermission) {
              f1 = false;
            }
            if (hasNegativeReadPermission) {
              f1 = true;
            }
          }

          if (regionProtection.includes("w")) {
            if (hasWritePermission) {
              f2 = true;
            }
            if (hasNegativeWritePermission) {
              f2 = false;
            }
          } else {
            if (hasWritePermission) {
              f2 = false;
            }
            if (hasNegativeWritePermission) {
              f2 = true;
            }
          }

          if (regionProtection.includes("x")) {
            if (hasExecutePermission) {
              f3 = true;
            }
            if (hasNegativeExecutePermission) {
              f3 = false;
            }
          } else {
            if (hasExecutePermission) {
              f3 = false;
            }
            if (hasNegativeExecutePermission) {
              f3 = true;
            }
          }

          return f1 && f2 && f3;
        });

        return filteredRegions;
      } else {
        console.error(`Enumerate regions failed: ${response.status}`);
        return [];
      }
    } catch (error) {
      console.error("Error enumerating regions:", error);
      return [];
    }
  };

  const handleFind = async () => {
    try {
      setIsLoading(true);
      setIsFinding(true);
      const pattern = convertToLittleEndianHex(scanValue, scanType);
      const filteredRegions = await getMemoryRegions(protection);

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
        scan_type: scanType,
        scan_id: "Scan 1",
        return_as_json: true,
      });

      if (response.status === 200) {
        const scanResults = response.data.matched_addresses || [];
        console.log(scanResults);
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
      const pattern = convertToLittleEndianHex(scanValue, scanType);
      const response = await axios.post(
        `http://${ipAddress}:3030/memoryfilter`,
        {
          pattern: pattern,
          scan_type: scanType,
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
                placeholder="0"
                value={scanValue}
                onChange={(e) => setScanValue(e.target.value)}
              />
            </div>
            <div className="flex flex-col space-y-2 md:flex-row md:space-x-2 md:space-y-0">
              <Button
                className="w-full bg-blue-700 hover:bg-blue-800 text-white"
                variant="secondary"
                onClick={handleFind}
                disabled={isLoading}
              >
                {isFinding ? "Finding..." : "Find"}
              </Button>
              <Button
                className="w-full bg-green-700 hover:bg-green-800 text-white"
                variant="secondary"
                onClick={handleFilter}
                disabled={isLoading}
              >
                {isFiltering ? "Filtering..." : "Filter"}
              </Button>
            </div>
            <div className="space-y-2">
              <Label htmlFor="scan-type">Scan Type</Label>
              <Select value={scanType} onValueChange={setScanType}>
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
                  <SelectItem value="aob">aob</SelectItem>
                  <SelectItem value="regex">regex</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="filter-type">Filter Type</Label>
              <Select value={filterType} onValueChange={setFilterType}>
                <SelectTrigger>
                  <SelectValue placeholder="exact" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="exact">exact</SelectItem>
                  <SelectItem value="changed">changed</SelectItem>
                  <SelectItem value="unchanged">unchanged</SelectItem>
                  <SelectItem value="bigger">bigger</SelectItem>
                  <SelectItem value="smaller">smaller</SelectItem>
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
              />
              <Input
                placeholder="0x7FFFFFFFFFFFFF"
                value={addressRanges[0][1].toString(16)}
                onChange={(e) =>
                  setAddressRanges([
                    [addressRanges[0][0], BigInt(parseInt(e.target.value, 16))],
                  ])
                }
              />
              <Button variant="destructive">Reset</Button>
            </div>
          </CardContent>
        </Card>
        <Card className="w-full max-w-4xl">
          <CardHeader>
            <CardTitle className="text-2xl">Scan Data List</CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">
              Showing {scanResults.slice(0, 1000).length} of{" "}
              {scanResults.length} results
            </p>
          </CardHeader>
          <CardContent className="overflow-y-auto max-h-[500px]">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Index</TableHead>
                  <TableHead>Address</TableHead>
                  <TableHead>Value</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {scanResults.slice(0, 1000).map((result, index) => (
                  <TableRow key={index}>
                    <TableCell>{index + 1}</TableCell>
                    <TableCell>{`0x${BigInt(result.address)
                      .toString(16)
                      .toUpperCase()}`}</TableCell>
                    <TableCell>
                      {convertFromLittleEndianHex(result.value, scanType)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
