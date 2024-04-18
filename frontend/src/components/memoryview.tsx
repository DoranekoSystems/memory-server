import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useStore } from "./global-store";
import {
  SelectValue,
  SelectTrigger,
  SelectItem,
  SelectContent,
  Select,
} from "@/components/ui/select";
import { getMemoryRegions, readProcessMemory } from "../lib/api";

export function MemoryView() {
  const ipAddress = useStore((state) => state.ipAddress);
  const [inputAddress, setInputAddress] = useState("");
  const [address, setAddress] = useState("");
  const [memoryData, setMemoryData] = useState(null);
  const [prevMemoryData, setPrevMemoryData] = useState(null);
  const [scrollOffset, setScrollOffset] = useState(0);
  const [encoding, setEncoding] = useState("utf-8");
  const [dataType, setDataType] = useState("byte");
  const [displayType, setDisplayType] = useState("hex");
  useEffect(() => {
    let intervalId;

    if (ipAddress && address) {
      intervalId = setInterval(async () => {
        const data = await readProcessMemory(
          ipAddress,
          parseInt(address, 16),
          1024
        );
        setPrevMemoryData(memoryData);
        setMemoryData(data);
      }, 500);
    }

    return () => {
      clearInterval(intervalId);
    };
  }, [ipAddress, address, memoryData]);

  useEffect(() => {
    const newAddress =
      "0x" + (parseInt(address, 16) + scrollOffset).toString(16);
    setAddress(newAddress.toUpperCase());
  }, [scrollOffset]);

  const handleScroll = (event) => {
    event.preventDefault();
    const delta = event.deltaY;
    const newOffset = scrollOffset + (delta > 0 ? 0x10 : -0x10);
    setScrollOffset(newOffset);
  };

  const handleGoClick = () => {
    let ip = inputAddress.startsWith("0x") ? inputAddress : "0x" + inputAddress;
    setAddress(ip.toUpperCase());
  };

  const renderMemoryData = () => {
    if (!memoryData) return null;

    const bytes = new Uint8Array(memoryData);
    const prevBytes = prevMemoryData ? new Uint8Array(prevMemoryData) : null;
    const lines = [];

    for (let i = 0; i < bytes.length; i += 16) {
      let hexBytes;
      let hexBytesWidth;

      switch (dataType) {
        case "byte":
          hexBytes = Array.from(bytes.slice(i, i + 16), (byte, index) => {
            const prevByte = prevMemoryData
              ? new Uint8Array(prevMemoryData)[i + index]
              : null;
            const color =
              prevByte !== null && prevByte !== byte
                ? "text-red-500"
                : "text-white";
            return `<span class="${color}">${
              displayType === "hex"
                ? byte.toString(16).padStart(2, "0")
                : byte.toString(10).padStart(3, " ")
            }</span>`;
          }).join(" ");
          hexBytesWidth = displayType === "hex" ? "w-96" : "w-128";
          break;
        case "word":
          hexBytes = Array.from(
            new Uint16Array(bytes.slice(i, i + 16).buffer),
            (word, index) => {
              const prevWord = prevBytes
                ? new Uint16Array(prevBytes.slice(i, i + 16).buffer)[index]
                : null;
              const color =
                prevWord !== null && prevWord !== word
                  ? "text-red-500"
                  : "text-white";
              return `<span class="${color}">${
                displayType === "hex"
                  ? word.toString(16).padStart(4, "0")
                  : word.toString(10).padStart(5, " ")
              }</span>`;
            }
          ).join(" ");
          hexBytesWidth = displayType === "hex" ? "w-96" : "w-160";
          break;
        case "dword":
          hexBytes = Array.from(
            new Uint32Array(bytes.slice(i, i + 16).buffer),
            (dword, index) => {
              const prevDword = prevBytes
                ? new Uint32Array(prevBytes.slice(i, i + 16).buffer)[index]
                : null;
              const color =
                prevDword !== null && prevDword !== dword
                  ? "text-red-500"
                  : "text-white";
              return `<span class="${color}">${
                displayType === "hex"
                  ? dword.toString(16).padStart(8, "0")
                  : dword.toString(10).padStart(10, " ")
              }</span>`;
            }
          ).join(" ");
          hexBytesWidth = displayType === "hex" ? "w-96" : "w-256";
          break;
        case "qword":
          hexBytes = Array.from(
            new BigUint64Array(bytes.slice(i, i + 16).buffer),
            (qword, index) => {
              const prevQword = prevBytes
                ? new BigUint64Array(prevBytes.slice(i, i + 16).buffer)[index]
                : null;
              const color =
                prevQword !== null && prevQword !== qword
                  ? "text-red-500"
                  : "text-white";
              return `<span class="${color}">${
                displayType === "hex"
                  ? qword.toString(16).padStart(16, "0")
                  : qword.toString(10).padStart(20, " ")
              }</span>`;
            }
          ).join(" ");
          hexBytesWidth = displayType === "hex" ? "w-96" : "w-512";
          break;
        default:
          hexBytes = Array.from(bytes.slice(i, i + 16), (byte, index) => {
            const prevByte = prevMemoryData
              ? new Uint8Array(prevMemoryData)[i + index]
              : null;
            const color =
              prevByte !== null && prevByte !== byte
                ? "text-red-500"
                : "text-white";
            return `<span class="${color}">${
              displayType === "hex"
                ? byte.toString(16).padStart(2, "0")
                : byte.toString(10).padStart(3, "0")
            }</span>`;
          }).join(" ");
          hexBytesWidth = displayType === "hex" ? "w-96" : "w-128";
      }

      let asciiBytes;

      if (encoding === "utf-8") {
        asciiBytes = Array.from(bytes.slice(i, i + 16), (byte, index) => {
          const prevByte = prevMemoryData
            ? new Uint8Array(prevMemoryData)[i + index]
            : null;
          const color =
            prevByte !== null && prevByte !== byte
              ? "text-red-500"
              : "text-white";
          return `<span class="${color}">${
            byte >= 32 && byte <= 126 ? String.fromCharCode(byte) : "."
          }</span>`;
        }).join("");
      } else if (encoding === "utf-16") {
        asciiBytes = Array.from(
          new Uint16Array(bytes.slice(i, i + 16).buffer),
          (word, index) => {
            const prevWord = prevBytes
              ? new Uint16Array(prevBytes.slice(i, i + 16).buffer)[index]
              : null;
            const color =
              prevWord !== null && prevWord !== word
                ? "text-red-500"
                : "text-white";
            return `<span class="${color}">${
              word >= 32 && word <= 126 ? String.fromCharCode(word) : "."
            }</span>`;
          }
        ).join("");
      }

      lines.push(
        <div key={i}>
          <pre className="tabular-nums inline-block w-32">
            {(parseInt(address) + i).toString(16).padStart(8, "0")}
          </pre>
          <pre
            className={`tabular-nums inline-block ${hexBytesWidth}`}
            dangerouslySetInnerHTML={{ __html: hexBytes }}
          ></pre>
          <pre
            className="inline-block w-16"
            dangerouslySetInnerHTML={{ __html: asciiBytes }}
          ></pre>
        </div>
      );
    }

    return <div className="font-mono text-sm">{lines}</div>;
  };

  return (
    <div className="dark min-h-screen flex flex-col bg-gray-900 text-gray-200">
      <header className="flex items-center justify-between px-4 py-2 border-b border-gray-700">
        <div className="flex gap-4">
          <Button size="sm" variant="ghost">
            <SaveIcon className="w-5 h-5" /> Save
          </Button>
        </div>
        <div className="flex mt-2">
          <Input
            className="pl-10 bg-gray-800 border-gray-700 flex-1"
            placeholder="Memory Address (Hex)"
            value={inputAddress}
            onChange={(e) => setInputAddress(e.target.value)}
          />
          <Button className="ml-2" onClick={handleGoClick}>
            Go
          </Button>
        </div>
      </header>
      <div className="flex flex-1 overflow-hidden">
        <main className="flex-1 overflow-auto p-4" onWheel={handleScroll}>
          <div className="overflow-auto">{renderMemoryData()}</div>
        </main>
        <aside className="w-64 border-l border-gray-700 p-4">
          <h2 className="text-lg font-semibold mt-4 mb-2">Settings</h2>

          <div>
            <Label className="font-medium mt-4" htmlFor="displayType">
              Display Type
            </Label>
            <Select
              className="mt-1"
              id="displayType"
              value={displayType}
              onValueChange={(value) => setDisplayType(value)}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select a display type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="hex">Hexadecimal</SelectItem>
                <SelectItem value="dec">Decimal</SelectItem>
              </SelectContent>
            </Select>
            <Label className="font-medium" htmlFor="theme">
              Encoding
            </Label>
            <Select
              className="mt-1"
              id="encoding"
              value={encoding}
              onValueChange={(value) => setEncoding(value)}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="utf-8">UTF-8</SelectItem>
                <SelectItem value="utf-16">UTF-16</SelectItem>
              </SelectContent>
            </Select>
            <Label className="font-medium" htmlFor="theme">
              Data Type
            </Label>
            <Select
              className="mt-1"
              id="dataType"
              value={dataType}
              onValueChange={(value) => setDataType(value)}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="byte">BYTE</SelectItem>
                <SelectItem value="word">WORD</SelectItem>
                <SelectItem value="dword">DWORD</SelectItem>
                <SelectItem value="qword">QWORD</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </aside>
      </div>
    </div>
  );
}

// SaveIcon and SearchIcon components remain the same

function SaveIcon(props) {
  return (
    <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
      <polyline points="17 21 17 13 7 13 7 21" />
      <polyline points="7 3 7 8 15 8" />
    </svg>
  );
}

function SearchIcon(props) {
  return (
    <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="11" cy="11" r="8" />
      <path d="m21 21-4.3-4.3" />
    </svg>
  );
}
