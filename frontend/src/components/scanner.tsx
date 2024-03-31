import axios from "axios";
import { useState, useEffect } from "react";
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

const base_url = "http://localhost:3030"; // Set the appropriate backend URL

export function Scanner() {
  const [addressRanges, setAddressRanges] = useState<[bigint, bigint][]>([
    [BigInt(0), BigInt("0x7FFFFFFFFFFFFF")],
  ]);
  const [scanResults, setScanResults] = useState<any[]>([]);
  const [scanValue, setScanValue] = useState("0");
  const [scanType, setScanType] = useState("int32");
  const [protection, setProtection] = useState<string[]>(["r", "w"]);

  useEffect(() => {}, [scanResults]);

  const getMemoryRegions = async (protection: string[]) => {
    try {
      const response = await axios.get(`${base_url}/enumregions`);
      if (response.status === 200) {
        const regions = response.data.regions;
        const filteredRegions = regions.filter((region: any) =>
          protection.some((p) => region.protection.includes(p))
        );
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

  const handleProtectionChange = (protectionType: string) => {
    setProtection((prevProtection) => {
      const updatedProtection = prevProtection.includes(protectionType)
        ? prevProtection.filter((p) => p !== protectionType)
        : [...prevProtection, protectionType];
      return updatedProtection;
    });
  };

  const handleFind = async () => {
    try {
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

      const response = await axios.post(`${base_url}/memoryscan`, {
        pattern: scanValue,
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
    }
  };

  const handleFilter = async () => {
    try {
      const response = await axios.post(`${base_url}/memoryfilter`, {
        pattern: scanValue,
        scan_type: scanType,
        scan_id: "Scan 1",
        filter_method: "exact",
        return_as_json: true,
      });
      if (response.status === 200) {
        setScanResults(response.data.result || []);
        console.log(`Pattern found ${response.data.found} times`);
      } else {
        console.error(`Memory filter failed: ${response.status}`);
      }
    } catch (error) {
      console.error("Error filtering memory:", error);
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
                className="w-full"
                variant="secondary"
                onClick={handleFind}
              >
                Find
              </Button>
              <Button
                className="w-full"
                variant="secondary"
                onClick={handleFilter}
              >
                Filter
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
            <div className="flex flex-wrap items-center space-x-2">
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="read"
                  checked={protection.includes("r")}
                  onCheckedChange={() => handleProtectionChange("r")}
                />
                <Label htmlFor="read">Read</Label>
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="write"
                  checked={protection.includes("w")}
                  onCheckedChange={() => handleProtectionChange("w")}
                />
                <Label htmlFor="write">Write</Label>
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="execute"
                  checked={protection.includes("x")}
                  onCheckedChange={() => handleProtectionChange("x")}
                />
                <Label htmlFor="execute">Execute</Label>
              </div>
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
              Showing {scanResults.slice(0, 1000).length} of {scanResults.length} results
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
                      .padStart(16, "0")}`}</TableCell>
                    <TableCell>{result.value}</TableCell>
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
