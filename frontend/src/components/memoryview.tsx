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
  const isMobile = window.innerWidth < 640;
  const ipAddress = useStore((state) => state.ipAddress);
  const [inputAddress, setInputAddress] = useState("");
  const [selectedRegion, setSelectedRegion] = useState(null);
  const [regions, setRegions] = useState([]);
  const [isAddressChanged, setIsAddressChanged] = useState(false);
  const scrollableRefs = useRef([]);
  const timeoutId = useRef(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isDraggingId, setIsDraggingId] = useState(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });

  const handleCloseRegion = (regionId) => {
    setRegions((prevRegions) =>
      prevRegions.filter((region) => region.id !== regionId)
    );
    if (selectedRegion === regionId) {
      setSelectedRegion(null);
    }
  };

  const handleMouseDown = (event, regionId) => {
    selectRegion(regionId);
    setIsDraggingId(regionId);
    setIsDragging(true);
    const scrollableElement = scrollableRefs.current[regionId];
    if (scrollableElement) {
      setDragOffset({
        x: event.clientX - scrollableElement.offsetLeft,
        y: event.clientY - scrollableElement.offsetTop,
      });
    }
    scrollableRefs.current.map((element) => {
      if (scrollableRefs.current[regionId] != element) {
        element.style.pointerEvents = "none";
      }
    });
  };

  const handleMouseMove = (event, regionId) => {
    if (isDraggingId === regionId) {
      const scrollableElement = scrollableRefs.current[regionId];
      if (scrollableElement) {
        scrollableElement.style.left = `${event.clientX - dragOffset.x}px`;
        scrollableElement.style.top = `${event.clientY - dragOffset.y}px`;
      }
    }
  };

  const handleMouseUp = () => {
    scrollableRefs.current.map((element) => {
      element.style.pointerEvents = "auto";
    });
    setIsDraggingId(null);
    setIsDragging(false);
  };

  const setIsAddressChangedWithTimeout = () => {
    setIsAddressChanged(true);
    clearTimeout(timeoutId.current);
    timeoutId.current = setTimeout(() => {
      setIsAddressChanged(false);
    }, 1000);
  };

  useEffect(() => {
    const handleScroll = (event) => {
      event.preventDefault();
      event.stopPropagation();
      const delta = event.deltaY;
      if (delta < 0) {
        setRegions((prevRegions) =>
          prevRegions.map((region) =>
            region.id === selectedRegion
              ? {
                  ...region,
                  address:
                    "0x" +
                    (parseInt(region.address, 16) - 0x10)
                      .toString(16)
                      .toUpperCase(),
                }
              : region
          )
        );
      } else if (delta > 0) {
        setRegions((prevRegions) =>
          prevRegions.map((region) =>
            region.id === selectedRegion
              ? {
                  ...region,
                  address:
                    "0x" +
                    (parseInt(region.address, 16) + 0x10)
                      .toString(16)
                      .toUpperCase(),
                }
              : region
          )
        );
      }
      setIsAddressChangedWithTimeout();
    };

    if (selectedRegion) {
      const scrollableElement = scrollableRefs.current[selectedRegion];
      if (scrollableElement) {
        scrollableElement.addEventListener("wheel", handleScroll, {
          passive: false,
        });

        return () => {
          scrollableElement.removeEventListener("wheel", handleScroll);
        };
      }
    }
  }, [selectedRegion]);

  useEffect(() => {
    let intervalIds = [];

    if (ipAddress) {
      intervalIds = regions.map((region) => {
        if (region.address) {
          return setInterval(async () => {
            const data = await readProcessMemory(
              ipAddress,
              parseInt(region.address, 16),
              512
            );
            setRegions((prevRegions) =>
              prevRegions.map((r) =>
                r.id === region.id
                  ? {
                      ...r,
                      prevMemoryData: r.memoryData,
                      memoryData: data,
                    }
                  : r
              )
            );
          }, 200);
        }
        return null;
      });
    }

    return () => {
      intervalIds.forEach((intervalId) => {
        if (intervalId) {
          clearInterval(intervalId);
        }
      });
    };
  }, [ipAddress, regions]);

  const addRegion = () => {
    const newRegion = {
      id: Date.now(),
      address: "",
      memoryData: null,
      prevMemoryData: null,
      encoding: "utf-8",
      dataType: "byte",
      displayType: "hex",
    };
    setRegions([...regions, newRegion]);
    setSelectedRegion(newRegion.id);
  };

  const selectRegion = (regionId) => {
    setSelectedRegion(regionId);
  };

  const updateSelectedRegion = (updatedRegion) => {
    setRegions((prevRegions) =>
      prevRegions.map((region) =>
        region.id === selectedRegion ? { ...region, ...updatedRegion } : region
      )
    );
    setSelectedRegion((prevSelectedRegion) => {
      if (prevSelectedRegion === null) return null;
      return {
        ...updatedRegion,
      };
    });
  };
  const getSelectedRegion = () => {
    return regions.find((region) => region.id === selectedRegion);
  };

  const handleGoClick = () => {
    const ip = inputAddress.startsWith("0x")
      ? inputAddress.toUpperCase()
      : "0x" + inputAddress.toUpperCase();
    setRegions(
      regions.map((region) =>
        region.id === selectedRegion ? { ...region, address: ip } : region
      )
    );
    setIsAddressChangedWithTimeout();
  };

  const renderMemoryData = (region) => {
    if (!region || !region.memoryData) return null;

    const bytes = new Uint8Array(region.memoryData);
    const prevBytes = region.prevMemoryData
      ? new Uint8Array(region.prevMemoryData)
      : null;
    const lines = [];

    if (window.innerWidth < 640) {
      lines.push(
        <div key="address" className="font-mono text-sm">
          <pre className="tabular-nums w-12 mr-2">
            address {region.address.toString(16).padStart(8, "0")}
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

      switch (region.dataType) {
        case "byte":
          hexBytes = Array.from(bytes.slice(i, i + length), (byte, index) => {
            const prevByte = prevBytes ? prevBytes[i + index] : null;
            const color =
              prevByte !== null && prevByte !== byte && !isAddressChanged
                ? "text-red-500"
                : "text-white";
            return `<span class="${color}">${
              region.displayType === "hex"
                ? byte.toString(16).padStart(2, "0").toUpperCase()
                : byte.toString(10).padStart(3, " ")
            }</span>`;
          }).join(" ");
          hexBytesWidth =
            window.innerWidth >= 640
              ? region.displayType === "hex"
                ? "w-96"
                : "w-128"
              : region.displayType === "hex"
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
                prevWord !== null && prevWord !== word && !isAddressChanged
                  ? "text-red-500"
                  : "text-white";
              return `<span class="${color}">${
                region.displayType === "hex"
                  ? word.toString(16).padStart(4, "0").toUpperCase()
                  : word.toString(10).padStart(5, " ")
              }</span>`;
            }
          ).join(" ");
          hexBytesWidth =
            window.innerWidth >= 640
              ? region.displayType === "hex"
                ? "w-96"
                : "w-160"
              : region.displayType === "hex"
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
                prevDword !== null && prevDword !== dword && !isAddressChanged
                  ? "text-red-500"
                  : "text-white";
              return `<span class="${color}">${
                region.displayType === "hex"
                  ? dword.toString(16).padStart(8, "0").toUpperCase()
                  : dword.toString(10).padStart(10, " ")
              }</span>`;
            }
          ).join(" ");
          hexBytesWidth =
            window.innerWidth >= 640
              ? region.displayType === "hex"
                ? "w-96"
                : "w-256"
              : region.displayType === "hex"
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
                prevQword !== null && prevQword !== qword && !isAddressChanged
                  ? "text-red-500"
                  : "text-white";
              return `<span class="${color}">${
                region.displayType === "hex"
                  ? qword.toString(16).padStart(16, "0").toUpperCase()
                  : qword.toString(10).padStart(20, " ")
              }</span>`;
            }
          ).join(" ");
          hexBytesWidth =
            window.innerWidth >= 640
              ? region.displayType === "hex"
                ? "w-96"
                : "w-512"
              : region.displayType === "hex"
              ? "w-36"
              : "w-48";
          break;
        default:
          hexBytes = Array.from(bytes.slice(i, i + length), (byte, index) => {
            const prevByte = prevBytes ? prevBytes[i + index] : null;
            const color =
              prevByte !== null && prevByte !== byte && !isAddressChanged
                ? "text-red-500"
                : "text-white";
            return `<span class="${color}">${
              region.displayType === "hex"
                ? byte.toString(16).padStart(2, "0").toUpperCase()
                : byte.toString(10).padStart(3, "0")
            }</span>`;
          }).join(" ");
          hexBytesWidth =
            window.innerWidth >= 640
              ? region.displayType === "hex"
                ? "w-96"
                : "w-128"
              : region.displayType === "hex"
              ? "w-48"
              : "w-64";
      }

      let asciiBytes;

      if (region.encoding === "utf-8") {
        asciiBytes = Array.from(bytes.slice(i, i + length), (byte, index) => {
          const prevByte = prevBytes ? prevBytes[i + index] : null;
          const color =
            prevByte !== null && prevByte !== byte && !isAddressChanged
              ? "text-red-500"
              : "text-white";
          return `<span class="${color}">${
            byte >= 32 && byte <= 126 ? String.fromCharCode(byte) : "."
          }</span>`;
        }).join("");
      } else if (region.encoding === "utf-16") {
        asciiBytes = Array.from(
          new Uint16Array(bytes.slice(i, i + length).buffer),
          (word, index) => {
            const prevWord = prevBytes
              ? new Uint16Array(prevBytes.slice(i, i + length).buffer)[index]
              : null;
            const color =
              prevWord !== null && prevWord !== word && !isAddressChanged
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
              {(parseInt(region.address) + i)
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
          <Button size="sm" variant="ghost" onClick={addRegion}>
            <PlusIcon className="w-5 h-5" /> Add Region
          </Button>
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
        <main className="flex-1 overflow-auto p-4">
          <div className="flex">
            {regions.map((region) => (
              <div
                key={region.id}
                className={`tab ${
                  region.id === selectedRegion ? "active" : ""
                }`}
                onClick={() => setSelectedRegion(region.id)}
              >
                Region {regions.indexOf(region) + 1}
                <button
                  className="ml-2 text-gray-400 hover:text-white"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleCloseRegion(region.id);
                  }}
                >
                  &times;
                </button>
              </div>
            ))}
          </div>
          {regions.map((region) => (
            <div
              key={region.id}
              className={`inline-block p-2 resize-container draggableregion ${
                region.id === selectedRegion ? "selected" : ""
              } ${isDragging && region.id !== isDraggingId ? "inactive" : ""}`}
              style={{
                maxWidth: isMobile ? "auto" : "auto",
                width: isMobile ? "auto" : "fit-content",
                height: isMobile ? "auto" : "fit-content",
                pointerEvents: isMobile ? "auto" : "none",
              }}
              ref={(ref) => {
                scrollableRefs.current[region.id] = ref;
              }}
              onMouseDown={
                isMobile ? null : (event) => handleMouseDown(event, region.id)
              }
              onMouseMove={
                isMobile ? null : (event) => handleMouseMove(event, region.id)
              }
              onMouseUp={isMobile ? null : handleMouseUp}
              onMouseLeave={isMobile ? null : handleMouseUp}
            >
              <div className={`memory-data ${isDragging ? "inactive" : ""}`}>
                {renderMemoryData(region)}
              </div>
              <div className="flex justify-start">
                <button
                  className="m-3 px-1 py-1 bg-red-800 text-white text-sm rounded hover:bg-red-900 focus:outline-none"
                  onClick={() => handleCloseRegion(region.id)}
                >
                  Close
                </button>
              </div>
            </div>
          ))}
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
              value={getSelectedRegion()?.displayType}
              onValueChange={(value) => {
                updateSelectedRegion({ displayType: value });
                setSelectedRegion(selectedRegion);
              }}
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
              value={getSelectedRegion()?.encoding}
              onValueChange={(value) => {
                updateSelectedRegion({ encoding: value });
                setSelectedRegion(selectedRegion);
              }}
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
              value={getSelectedRegion()?.dataType}
              onValueChange={(value) => {
                updateSelectedRegion({ dataType: value });
                setSelectedRegion(selectedRegion);
              }}
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

// PlusIcon, SaveIcon, and SearchIcon components remain the same

function PlusIcon(props) {
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
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}

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
