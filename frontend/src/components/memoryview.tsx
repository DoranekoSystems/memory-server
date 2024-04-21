import { useState, useEffect, useRef } from "react";
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
  const [prevAddress, setPrevAddress] = useState("");
  const [memoryData, setMemoryData] = useState(null);
  const [prevMemoryData, setPrevMemoryData] = useState(null);
  const [scrollOffset, setScrollOffset] = useState(0);
  const [scrollStatus, setScrollStatus] = useState(0);
  const [encoding, setEncoding] = useState("utf-8");
  const [dataType, setDataType] = useState("byte");
  const [displayType, setDisplayType] = useState("hex");
  const [showAscii, setShowAscii] = useState(false);
  const scrollableRef = useRef(null);

  useEffect(() => {
    const scrollableElement = scrollableRef.current;
    const handleScroll = (event) => {
      event.preventDefault();
      event.stopPropagation();
      const delta = event.deltaY;
      if (delta < 0) {
        const newAddress =
          "0x" + (parseInt(address, 16) - 0x10).toString(16).toUpperCase();
        setAddress(newAddress);
      } else if (delta > 0) {
        const newAddress =
          "0x" + (parseInt(address, 16) + 0x10).toString(16).toUpperCase();
        setAddress(newAddress);
      }
    };

    scrollableElement.addEventListener("wheel", handleScroll, {
      passive: false,
    });

    return () => {
      scrollableElement.removeEventListener("wheel", handleScroll);
    };
  }, [address]);

  useEffect(() => {
    let intervalId;

    if (ipAddress && address != "") {
      intervalId = setInterval(async () => {
        const data = await readProcessMemory(
          ipAddress,
          parseInt(address, 16),
          1024
        );
        setPrevMemoryData(memoryData);
        setMemoryData(data);
      }, 100);
    }

    return () => {
      clearInterval(intervalId);
    };
  }, [address, memoryData]);

  const handleGoClick = () => {
    let ip = inputAddress.startsWith("0x")
      ? inputAddress.toUpperCase()
      : "0x" + inputAddress.toUpperCase();
    setAddress(ip);
  };

  const renderMemoryData = () => {
    if (!memoryData) return null;

    const bytes = new Uint8Array(memoryData);
    const prevBytes = prevMemoryData ? new Uint8Array(prevMemoryData) : null;
    const lines = [];

    if (window.innerWidth < 640) {
      lines.push(
        <div key="address" className="font-mono text-sm">
          <pre className="tabular-nums w-12 mr-2">
            address {address.toString(16).padStart(8, "0")}
          </pre>
        </div>
      );
    }
    let loopCount;
    let length;
    if (window.innerWidth >= 640) {
      loopCount = 0x1ff;
      length = 16;
    } else {
      loopCount = 0xff;
      length = 8;
    }
    for (let i = 0; i < loopCount; i += length) {
      let hexBytes;
      let hexBytesWidth;

      switch (dataType) {
        case "byte":
          hexBytes = Array.from(bytes.slice(i, i + length), (byte, index) => {
            const prevByte = prevMemoryData
              ? new Uint8Array(prevMemoryData)[i + index]
              : null;
            const color =
              prevByte !== null && prevByte !== byte
                ? "text-red-500"
                : "text-white";
            return `<span class="${color}">${
              displayType === "hex"
                ? byte.toString(16).padStart(2, "0").toUpperCase()
                : byte.toString(10).padStart(3, " ")
            }</span>`;
          }).join(" ");
          hexBytesWidth =
            window.innerWidth >= 640
              ? displayType === "hex"
                ? "w-96"
                : "w-128"
              : displayType === "hex"
              ? "w-48"
              : "w-64";
          break;
        case "word":
          hexBytes = Array.from(
            new Uint16Array(bytes.slice(i, i + length).buffer),
            (word, index) => {
              const prevWord = prevBytes
                ? new Uint16Array(prevBytes.slice(i, i + length).buffer)[index]
                : null;
              const color =
                prevWord !== null && prevWord !== word
                  ? "text-red-500"
                  : "text-white";
              return `<span class="${color}">${
                displayType === "hex"
                  ? word.toString(16).padStart(4, "0").toUpperCase()
                  : word.toString(10).padStart(5, " ")
              }</span>`;
            }
          ).join(" ");
          hexBytesWidth =
            window.innerWidth >= 640
              ? displayType === "hex"
                ? "w-96"
                : "w-160"
              : displayType === "hex"
              ? "w-40"
              : "w-48";
          break;
        case "dword":
          hexBytes = Array.from(
            new Uint32Array(bytes.slice(i, i + length).buffer),
            (dword, index) => {
              const prevDword = prevBytes
                ? new Uint32Array(prevBytes.slice(i, i + length).buffer)[index]
                : null;
              const color =
                prevDword !== null && prevDword !== dword
                  ? "text-red-500"
                  : "text-white";
              return `<span class="${color}">${
                displayType === "hex"
                  ? dword.toString(16).padStart(8, "0").toUpperCase()
                  : dword.toString(10).padStart(10, " ")
              }</span>`;
            }
          ).join(" ");
          hexBytesWidth =
            window.innerWidth >= 640
              ? displayType === "hex"
                ? "w-96"
                : "w-256"
              : displayType === "hex"
              ? "w-36"
              : "w-128";
          break;
        case "qword":
          hexBytes = Array.from(
            new BigUint64Array(bytes.slice(i, i + length).buffer),
            (qword, index) => {
              const prevQword = prevBytes
                ? new BigUint64Array(prevBytes.slice(i, i + length).buffer)[
                    index
                  ]
                : null;
              const color =
                prevQword !== null && prevQword !== qword
                  ? "text-red-500"
                  : "text-white";
              return `<span class="${color}">${
                displayType === "hex"
                  ? qword.toString(16).padStart(16, "0").toUpperCase()
                  : qword.toString(10).padStart(20, " ")
              }</span>`;
            }
          ).join(" ");
          hexBytesWidth =
            window.innerWidth >= 640
              ? displayType === "hex"
                ? "w-96"
                : "w-512"
              : displayType === "hex"
              ? "w-36"
              : "w-48";
          break;
        default:
          hexBytes = Array.from(bytes.slice(i, i + length), (byte, index) => {
            const prevByte = prevMemoryData
              ? new Uint8Array(prevMemoryData)[i + index]
              : null;
            const color =
              prevByte !== null && prevByte !== byte
                ? "text-red-500"
                : "text-white";
            return `<span class="${color}">${
              displayType === "hex"
                ? byte.toString(16).padStart(2, "0").toUpperCase()
                : byte.toString(10).padStart(3, "0")
            }</span>`;
          }).join(" ");
          hexBytesWidth =
            window.innerWidth >= 640
              ? displayType === "hex"
                ? "w-96"
                : "w-128"
              : displayType === "hex"
              ? "w-48"
              : "w-64";
      }

      let asciiBytes;

      if (encoding === "utf-8") {
        asciiBytes = Array.from(bytes.slice(i, i + length), (byte, index) => {
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
          new Uint16Array(bytes.slice(i, i + length).buffer),
          (word, index) => {
            const prevWord = prevBytes
              ? new Uint16Array(prevBytes.slice(i, i + length).buffer)[index]
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

      if (window.innerWidth >= 640) {
        lines.push(
          <div key={i} className="flex">
            <pre className="tabular-nums w-24 mr-2">
              {(parseInt(address) + i)
                .toString(16)
                .padStart(8, "0")
                .toUpperCase()}
            </pre>
            <pre
              className={`tabular-nums${hexBytesWidth}`}
              dangerouslySetInnerHTML={{ __html: hexBytes }}
            ></pre>
            <pre
              className="ml-2"
              dangerouslySetInnerHTML={{ __html: asciiBytes }}
            ></pre>
          </div>
        );
      } else {
        lines.push(
          <div key={i} className="flex text-sm">
            <pre className="tabular-nums w-10 mr-2">
              {"+" + i.toString(16).padStart(3, "0").toUpperCase()}
            </pre>
            <pre
              className={`tabular-nums ${hexBytesWidth}`}
              dangerouslySetInnerHTML={{ __html: hexBytes }}
            ></pre>
            <pre
              className="ml-2"
              dangerouslySetInnerHTML={{ __html: asciiBytes }}
            ></pre>
          </div>
        );
      }
    }

    return <div className="font-mono text-sm">{lines}</div>;
  };
  return (
    <div className="dark min-h-screen flex flex-col bg-gray-900 text-gray-200">
      <header className="flex flex-col sm:flex-row items-center justify-between px-4 py-2 border-b border-gray-700">
        <div className="flex gap-4 mb-2 sm:mb-0">
          <Button size="sm" variant="ghost">
            <SaveIcon className="w-5 h-5" /> Save
          </Button>
        </div>
        <div className="flex flex-row items-center w-full sm:w-auto mt-2 sm:mt-0">
          <Input
            className="pl-10 bg-gray-800 border-gray-700 flex-1 mr-2"
            placeholder="Memory Address (Hex)"
            value={inputAddress}
            onChange={(e) => setInputAddress(e.target.value)}
          />
          <Button className="mt-2 sm:mt-0 sm:ml-2" onClick={handleGoClick}>
            Go
          </Button>
        </div>
      </header>
      <div className="flex flex-col sm:flex-row flex-1 overflow-hidden">
        <main className="flex-1 overflow-auto p-4" ref={scrollableRef}>
          <div className="overflow-auto">{renderMemoryData()}</div>
          <div className="mt-2 text-gray-600">
            Scrolling is not possible in this area.
          </div>
        </main>
        <aside className="sm:w-64 border-t sm:border-t-0 sm:border-l border-gray-700 p-4">
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
