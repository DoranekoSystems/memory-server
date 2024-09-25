import { useState, useEffect, useRef } from "react";
import { useStore } from "../../lib/global-store";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/common/Card";
import { Label } from "@/components/common/Label";
import { Input } from "@/components/common/Input";
import { Button } from "@/components/common/Button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/common/Select";
import BookmarkTable from "@/components/Bookmark/BookmarkTable";

import {
  getByteLengthFromScanType,
  arrayBufferToLittleEndianHexString,
  convertFromLittleEndianHex,
  convertToLittleEndianHex,
} from "@/lib/converter";

import { isHexadecimal } from "@/lib/utils";
import { resolve } from "path";

export function Bookmark({ currentPage }) {
  const memoryApi = useStore((state) => state.memoryApi);
  const [addressRanges, setAddressRanges] = useState<[bigint, bigint][]>([
    [BigInt(0), BigInt("0x7FFFFFFFFFFFFF")],
  ]);
  const [bookmarkLists, setBookmarkLists] = useState<any[]>([]);
  const [dataType, setDataType] = useState("int32");
  const ipAddress = useStore((state) => state.ipAddress);
  const serverMode = useStore((state) => state.serverMode);
  const targetOS = useStore((state) => state.targetOS);
  const [loading, setLoading] = useState(true);
  const [selectedIndices, setSelectedIndices] = useState([]);
  const [selectedAddresses, setSelectedAddresses] = useState([]);
  const [patchValue, setPatchValue] = useState("");
  const [scanAlign, setScanAlign] = useState(4);
  const [doSuspend, setDoSuspend] = useState(false);
  const [showAddAddressForm, setShowAddAddressForm] = useState(false);
  const [newAddress, setNewAddress] = useState("");
  const [newDataType, setNewDataType] = useState("int32");
  const tableRef = useRef(null);
  const [isVisible, setIsVisible] = useState(currentPage === "bookmark");

  useEffect(() => {
    setIsVisible(currentPage === "bookmark");
  }, [currentPage]);

  useEffect(() => {}, [loading, bookmarkLists, ipAddress, dataType]);

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
        const ret = await memoryApi.writeProcessMemory(
          address,
          Array.from(buffer)
        );
        if (ret.success) {
          console.log(
            `Memory patched successfully for address: 0x${BigInt(address)
              .toString(16)
              .toUpperCase()}`
          );
        } else {
          console.log(ret.message);
        }
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
    setBookmarkLists([]);
    setSelectedIndices([]);
    setSelectedAddresses([]);
  };

  const handleAddAddress = () => {
    setShowAddAddressForm(true);
  };

  const handleAddressChange = (e) => {
    setNewAddress(e.target.value);
  };

  const handleDataTypeChange = (value) => {
    setNewDataType(value);
  };

  const handleAddNewBookmark = async () => {
    let resolveAddr = newAddress.trim();
    if (!isHexadecimal(resolveAddr)) {
      let ret = await memoryApi.resolveAddress(resolveAddr);
      if (ret.success) {
        resolveAddr = ret.data.address.toString(16);
      } else {
        return;
      }
    }
    setBookmarkLists([
      ...bookmarkLists,
      {
        address: parseInt(resolveAddr, 16),
        type: newDataType,
        query: newAddress,
      },
    ]);
    setNewAddress("");
    setNewDataType("int32");
    setShowAddAddressForm(false);
  };

  const handleCancel = () => {
    setNewAddress("");
    setNewDataType("int32");
    setShowAddAddressForm(false);
  };

  return (
    <div className="flex flex-col min-h-screen">
      <main className="flex flex-col items-center flex-grow mt-8 px-4">
        <Card className="w-full max-w-4xl mb-6">
          <CardHeader className="flex justify-between">
            <CardTitle className="text-2xl mb-2">Bookmark</CardTitle>
            <Button
              onClick={handleAddAddress}
              className="w-1/6 text-gray-100 bg-blue-800 hover:bg-blue-900"
            >
              Add
            </Button>
          </CardHeader>
          <CardContent className="overflow-y-auto max-h-[500px]">
            {showAddAddressForm && (
              <div className="mb-6">
                <Label htmlFor="address">Address</Label>
                <Input
                  id="address"
                  value={newAddress}
                  onChange={handleAddressChange}
                  className="mb-2"
                />
                <Label htmlFor="dataType">Data Type</Label>
                <Select
                  value={newDataType}
                  onValueChange={handleDataTypeChange}
                >
                  <SelectTrigger>
                    <SelectValue>{newDataType}</SelectValue>
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
                  </SelectContent>
                </Select>
                <div className="flex mt-2">
                  <Button
                    onClick={handleAddNewBookmark}
                    className="mr-2 bg-blue-600 hover:bg-blue-700 text-white"
                  >
                    Confirm
                  </Button>
                  <Button
                    onClick={handleCancel}
                    className="bg-blue-600 hover:bg-blue-700 text-white"
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            )}
            <BookmarkTable
              ref={tableRef}
              bookMarkLists={bookmarkLists}
              setBookmarkLists={setBookmarkLists}
              selectedIndices={selectedIndices}
              handleSelect={handleSelect}
              convertFromLittleEndianHex={convertFromLittleEndianHex}
              isVisible={isVisible}
            />
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
