import axios from "axios";
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

export function MemoryView({ currentPage }) {
  const [isMobile, setIsMobile] = useState(false);
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
  const [selectedCell, setSelectedCell] = useState({
    regionId: null,
    index: 0,
  });
  const [cellPosition, setCellPosition] = useState(0);
  const [isProcessing, setIsProcessing] = useState(false);

  function intToString(value, dataType) {
    const buffer = new ArrayBuffer(8);
    const view = new DataView(buffer);

    switch (dataType) {
      case "int8":
        view.setInt8(0, value);
        return view.getInt8(0).toString();
      case "int16":
        view.setInt16(0, value, true);
        return view.getInt16(0, true).toString();
      case "int32":
        view.setInt32(0, value, true);
        return view.getInt32(0, true).toString();
      case "int64":
        view.setBigInt64(0, BigInt(value), true);
        return view.getBigInt64(0, true).toString();
      default:
        return value.toString();
    }
  }

  const handleCloseRegion = (regionId) => {
    setRegions((prevRegions) =>
      prevRegions.filter((region) => region.id !== regionId)
    );
    if (selectedRegion === regionId) {
      setSelectedRegion(null);
      setSelectedCell({ regionId: null, index: 0 });
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
    setIsMobile(window.innerWidth < 640);

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
          }, 100);
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

  useEffect(() => {
    const handleKeyDown = async (event) => {
      if (currentPage != "memoryview") {
        return () => {
          window.removeEventListener("keydown", handleKeyDown);
        };
      }
      if (isProcessing) return;
      if (selectedCell.regionId !== null) {
        const cellIndex = selectedCell.index;

        let rowLength = window.innerWidth >= 640 ? 16 : 8;
        let adjust = 1;
        const region = regions.find((r) => r.id === selectedCell.regionId);

        switch (region.dataType) {
          case "int8":
            rowLength = 16;
            break;
          case "int16":
            rowLength = 8;
            adjust = 2;
            break;
          case "int32":
            rowLength = 4;
            adjust = 4;
            break;
          case "int64":
            rowLength = 2;
            adjust = 8;
            break;
          case "uint8":
            rowLength = 16;
            break;
          case "uint16":
            rowLength = 8;
            adjust = 2;
            break;
          case "uint32":
            rowLength = 4;
            adjust = 4;
            break;
          case "uint64":
            rowLength = 2;
            adjust = 8;
            break;
          case "float":
            rowLength = 4;
            adjust = 4;
            break;
          case "double":
            rowLength = 2;
            adjust = 8;
          default:
            rowLength = 16;
        }

        setIsProcessing(true);
        try {
          switch (event.key) {
            case "ArrowUp":
              event.preventDefault();
              setSelectedCell((prevCell) => ({
                ...prevCell,
                index: Math.max(0, cellIndex - rowLength),
              }));
              setCellPosition(0);
              break;
            case "ArrowDown":
              event.preventDefault();
              setSelectedCell((prevCell) => ({
                ...prevCell,
                index: Math.min(
                  Math.floor(region.memoryData.byteLength / adjust) - 1,
                  cellIndex + rowLength
                ),
              }));
              setCellPosition(0);
              break;
            case "ArrowLeft":
              setSelectedCell((prevCell) => ({
                ...prevCell,
                index: Math.max(0, cellIndex - 1),
              }));
              setCellPosition(0);
              break;
            case "ArrowRight":
              setSelectedCell((prevCell) => ({
                ...prevCell,
                index: Math.min(
                  Math.floor(region.memoryData.byteLength / adjust) - 1,
                  cellIndex + 1
                ),
              }));
              setCellPosition(0);
              break;
            case "1":
            case "2":
            case "3":
            case "4":
            case "5":
            case "6":
            case "7":
            case "8":
            case "9":
            case "0":
            case "a":
            case "b":
            case "c":
            case "d":
            case "e":
            case "f":
              if (region.displayType == "hex") {
                await handleEdit(selectedCell.regionId, cellIndex, event.key);
                if (cellPosition == adjust * 2 - 1) {
                  setSelectedCell((prevCell) => ({
                    ...prevCell,
                    index: Math.min(
                      Math.floor(region.memoryData.byteLength / adjust) - 1,
                      cellIndex + 1
                    ),
                  }));
                  setCellPosition(0);
                } else {
                  setCellPosition(
                    (prevPosition) =>
                      ((prevPosition % (adjust * 2)) + 1) % (adjust * 2)
                  );
                }
              }
              break;
            default:
              break;
          }
        } finally {
          setIsProcessing(false);
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [selectedCell, regions, isProcessing]);

  const addRegion = () => {
    const newRegion = {
      id: Date.now(),
      address: "",
      memoryData: null,
      prevMemoryData: null,
      encoding: "utf-8",
      dataType: "uint8",
      displayType: "hex",
    };
    setRegions([...regions, newRegion]);
    setSelectedRegion(newRegion.id);
    setSelectedCell({ regionId: newRegion.id, index: 0 });
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

  const handleCellClick = (regionId, index) => {
    setSelectedCell({ regionId, index });
    setCellPosition(0);
  };

  const renderMemoryData = (region) => {
    if (!region || !region.memoryData) return null;

    const bytes = new Uint8Array(region.memoryData);
    const prevBytes = region.prevMemoryData
      ? new Uint8Array(region.prevMemoryData)
      : null;
    const lines = [];

    let loopCount;
    let length;
    if (window.innerWidth >= 640) {
      loopCount = 0x1ff;
      length = 16;
    } else {
      loopCount = 0xff;
      length = 8;
    }

    let adjust = 1;
    switch (region.dataType) {
      case "int8":
        adjust = 1;
        break;
      case "int16":
        adjust = 2;
        break;
      case "int32":
        adjust = 4;
        break;
      case "int64":
        adjust = 8;
        break;
      case "uint8":
        adjust = 1;
        break;
      case "uint16":
        adjust = 2;
        break;
      case "uint32":
        adjust = 4;
        break;
      case "uint64":
        adjust = 8;
        break;
      case "float":
        adjust = 4;
        break;
      case "double":
        adjust = 8;
      default:
    }

    for (let i = 0; i < loopCount; i += length) {
      let hexBytes;
      let hexBytesWidth;

      switch (region.dataType) {
        case "int8":
        case "uint8":
          hexBytes = Array.from(bytes.slice(i, i + length), (byte, index) => {
            const prevByte = prevBytes ? prevBytes[i + index] : null;
            const color =
              prevByte !== null && prevByte !== byte && !isAddressChanged
                ? "text-red-500"
                : "text-white";
            const background =
              selectedCell.regionId === region.id &&
              selectedCell.index === i + index
                ? "bg-blue-500"
                : "";
            return (
              <span
                key={index}
                className={`${color} ${background}`}
                onClick={() =>
                  handleCellClick(region.id, Math.floor(i / adjust) + index)
                }
                style={{ marginRight: "6px" }}
              >
                {region.displayType === "hex"
                  ? byte.toString(16).padStart(2, "0").toUpperCase()
                  : region.dataType == "int8"
                  ? intToString(byte, "int8").padStart(4, " ")
                  : byte.toString(10).padStart(3, " ")}
              </span>
            );
          });
          hexBytesWidth =
            window.innerWidth >= 640
              ? region.displayType === "hex"
                ? "w-96"
                : "w-128"
              : region.displayType === "hex"
              ? "w-48"
              : "w-64";
          break;
        case "int16":
        case "uint16":
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
              const background =
                selectedCell.regionId === region.id &&
                selectedCell.index * adjust === i + index * adjust
                  ? "bg-blue-500"
                  : "";
              return (
                <span
                  key={index}
                  className={`${color} ${background}`}
                  onClick={() =>
                    handleCellClick(region.id, Math.floor(i / adjust) + index)
                  }
                  style={{ marginRight: "14px" }}
                >
                  {region.displayType === "hex"
                    ? word.toString(16).padStart(4, "0").toUpperCase()
                    : region.dataType == "int16"
                    ? intToString(word, "int16").padStart(6, " ")
                    : word.toString(10).padStart(5, " ")}
                </span>
              );
            }
          );
          hexBytesWidth =
            window.innerWidth >= 640
              ? region.displayType === "hex"
                ? "w-96"
                : "w-160"
              : region.displayType === "hex"
              ? "w-48"
              : "w-54";
          break;
        case "int32":
        case "uint32":
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
              const background =
                selectedCell.regionId === region.id &&
                selectedCell.index * adjust === i + index * adjust
                  ? "bg-blue-500"
                  : "";
              return (
                <span
                  key={index}
                  className={`${color} ${background}`}
                  onClick={() =>
                    handleCellClick(region.id, Math.floor(i / adjust) + index)
                  }
                  style={{ marginRight: "20px" }}
                >
                  {region.displayType === "hex"
                    ? dword.toString(16).padStart(8, "0").toUpperCase()
                    : region.dataType == "int32"
                    ? intToString(dword, "int32").padStart(11, " ")
                    : dword.toString(10).padStart(10, " ")}
                </span>
              );
            }
          );
          hexBytesWidth =
            window.innerWidth >= 640
              ? region.displayType === "hex"
                ? "w-96"
                : "w-256"
              : region.displayType === "hex"
              ? "w-36"
              : "w-128";
          break;
        case "int64":
        case "uint64":
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
              const background =
                selectedCell.regionId === region.id &&
                selectedCell.index * adjust === i + index * adjust
                  ? "bg-blue-500"
                  : "";
              return (
                <span
                  key={index}
                  className={`${color} ${background}`}
                  onClick={() =>
                    handleCellClick(region.id, Math.floor(i / adjust) + index)
                  }
                  style={{ marginRight: "26px" }}
                >
                  {region.displayType === "hex"
                    ? qword.toString(16).padStart(16, "0").toUpperCase()
                    : region.dataType == "int64"
                    ? intToString(qword, "int64").padStart(21, " ")
                    : qword.toString(10).padStart(20, " ")}
                </span>
              );
            }
          );
          hexBytesWidth =
            window.innerWidth >= 640
              ? region.displayType === "hex"
                ? "w-96"
                : "w-512"
              : region.displayType === "hex"
              ? "w-36"
              : "w-48";
          break;
        case "float":
          if (region.displayType !== "hex") {
            hexBytes = Array.from(
              new Float32Array(bytes.slice(i, i + length).buffer),
              (float, index) => {
                const prevFloat = prevBytes
                  ? new Float32Array(prevBytes.slice(i, i + length).buffer)[
                      index
                    ]
                  : null;
                const color =
                  prevFloat !== null && prevFloat !== float && !isAddressChanged
                    ? "text-red-500"
                    : "text-white";
                const background =
                  selectedCell.regionId === region.id &&
                  selectedCell.index * adjust === i + index * adjust
                    ? "bg-blue-500"
                    : "";
                return (
                  <span
                    key={index}
                    className={`${color} ${background}`}
                    onClick={() =>
                      handleCellClick(region.id, Math.floor(i / adjust) + index)
                    }
                    style={{ marginRight: "20px" }}
                  >
                    {float.toFixed(8).padStart(11, " ")}
                  </span>
                );
              }
            );
            hexBytesWidth = window.innerWidth >= 640 ? "w-104" : "w-128";
          }
          break;
        case "double":
          if (region.displayType !== "hex") {
            hexBytes = Array.from(
              new Float64Array(bytes.slice(i, i + length).buffer),
              (double, index) => {
                const prevDouble = prevBytes
                  ? new Float64Array(prevBytes.slice(i, i + length).buffer)[
                      index
                    ]
                  : null;
                const color =
                  prevDouble !== null &&
                  prevDouble !== double &&
                  !isAddressChanged
                    ? "text-red-500"
                    : "text-white";
                const background =
                  selectedCell.regionId === region.id &&
                  selectedCell.index * adjust === i + index * adjust
                    ? "bg-blue-500"
                    : "";
                return (
                  <span
                    key={index}
                    className={`${color} ${background}`}
                    onClick={() =>
                      handleCellClick(region.id, Math.floor(i / adjust) + index)
                    }
                    style={{ marginRight: "20px" }}
                  >
                    {double.toFixed(16).padStart(20, " ")}
                  </span>
                );
              }
            );
            hexBytesWidth = window.innerWidth >= 640 ? "w-96" : "w-128";
          }
          break;
        default:
          hexBytes = Array.from(bytes.slice(i, i + length), (byte, index) => {
            const prevByte = prevBytes ? prevBytes[i + index] : null;
            const color =
              prevByte !== null && prevByte !== byte && !isAddressChanged
                ? "text-red-500"
                : "text-white";
            const background =
              selectedCell.regionId === region.id &&
              selectedCell.index === i + index
                ? "bg-blue-500"
                : "";
            return (
              <span
                key={index}
                className={`${color} ${background}`}
                onClick={() => handleCellClick(region.id, i + index)}
              >
                {region.displayType === "hex"
                  ? byte.toString(16).padStart(2, "0").toUpperCase()
                  : byte.toString(10).padStart(3, " ")}
              </span>
            );
          });
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
          const background =
            selectedCell.regionId === region.id &&
            selectedCell.index === Math.floor((i + index) / adjust)
              ? "bg-blue-500"
              : "";
          return (
            <span
              key={index}
              className={`${color} ${background}`}
              onClick={() =>
                handleCellClick(region.id, Math.floor((i + index) / adjust))
              }
            >
              {byte >= 32 && byte <= 126 ? String.fromCharCode(byte) : "."}
            </span>
          );
        });
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
            const background =
              selectedCell.regionId === region.id &&
              (region.dataType === "uint8" || region.dataType === "int8"
                ? Math.floor(selectedCell.index / 2) ===
                  Math.floor((i + index * 2) / 2)
                : Math.floor((selectedCell.index / adjust) * adjust) ===
                  Math.floor((i + index * 2) / adjust))
                ? "bg-blue-500"
                : "";
            return (
              <span
                key={index}
                className={`${color} ${background}`}
                onClick={() =>
                  handleCellClick(
                    region.id,
                    Math.floor((i + index * 2) / adjust)
                  )
                }
              >
                {word >= 32 && word <= 126 ? String.fromCharCode(word) : "."}
              </span>
            );
          }
        );
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
            <pre className={`tabular-nums ${hexBytesWidth}`}>{hexBytes}</pre>
            <pre className="ml-2">{asciiBytes}</pre>
          </div>
        );
      } else {
        lines.push(
          <div key={i} className="flex text-sm">
            <pre className="tabular-nums w-10 mr-2">
              {"+" + i.toString(16).padStart(3, "0").toUpperCase()}
            </pre>
            <pre className={`tabular-nums ${hexBytesWidth}`}>{hexBytes}</pre>
            <pre className="ml-2">{asciiBytes}</pre>
          </div>
        );
      }
    }

    return <div className="font-mono text-sm">{lines}</div>;
  };

  const handleEdit = async (regionId, cellIndex, key) => {
    const region = getSelectedRegion();
    let adjust = 0;
    switch (region.dataType) {
      case "uint8":
        adjust = 1;
        break;
      case "uint16":
        adjust = 2;
        break;
      case "uint32":
        adjust = 4;
        break;
      case "uint64":
        adjust = 8;
        break;
      default:
    }
    const address =
      parseInt(region.address) +
      cellIndex * adjust +
      adjust -
      Math.floor(cellPosition / 2) -
      1;
    const buffer = new Uint8Array(region.memoryData);

    const newValue = parseInt(key, 16);
    const currentByteValue =
      buffer[cellIndex * adjust + adjust - Math.floor(cellPosition / 2) - 1];
    let newByteValue = 0;
    if (cellPosition % 2 == 0) {
      newByteValue = newValue * 0x10 + (currentByteValue & 0x0f);
    } else {
      newByteValue = (currentByteValue & 0xf0) + newValue;
    }
    const response = await axios.post(`http://${ipAddress}:3030/writememory`, {
      address: address,
      buffer: [newByteValue],
    });
    // update
    if (response.status === 200) {
      buffer[cellIndex * adjust + adjust - Math.floor(cellPosition / 2) - 1] =
        newByteValue;
      const updatedRegions = regions.map((r) => {
        if (r.id === regionId) {
          return {
            ...r,
            memoryData: buffer,
          };
        }
        return r;
      });
      setRegions(updatedRegions);
    }
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
          {regions.map((region) => (
            <div
              key={region.id}
              className={`inline-block p-2 resize-container draggableregion region ${
                region.id === selectedRegion ? "selected" : ""
              } ${isDragging && region.id !== isDraggingId ? "inactive" : ""}`}
              ref={(ref) => {
                scrollableRefs.current[region.id] = ref;
              }}
              onMouseDown={(event) => handleMouseDown(event, region.id)}
              onMouseMove={(event) => handleMouseMove(event, region.id)}
              onMouseUp={handleMouseUp}
              onMouseLeave={handleMouseUp}
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
                <SelectItem value="hex">Hexadecimal(Editable)</SelectItem>
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
              {getSelectedRegion()?.displayType === "hex" ? (
                <SelectContent>
                  <SelectItem value="uint8">BYTE</SelectItem>
                  <SelectItem value="uint16">WORD</SelectItem>
                  <SelectItem value="uint32">DWORD</SelectItem>
                  <SelectItem value="uint64">QWORD</SelectItem>
                </SelectContent>
              ) : (
                <SelectContent>
                  <SelectItem value="int8">Int8</SelectItem>
                  <SelectItem value="int16">Int16</SelectItem>
                  <SelectItem value="int32">Int32</SelectItem>
                  <SelectItem value="int64">Int64</SelectItem>
                  <SelectItem value="uint8">UInt8</SelectItem>
                  <SelectItem value="uint16">UInt16</SelectItem>
                  <SelectItem value="uint32">UInt32</SelectItem>
                  <SelectItem value="uint64">UInt64</SelectItem>
                  <SelectItem value="float">Float</SelectItem>
                  <SelectItem value="double">Double</SelectItem>
                </SelectContent>
              )}
            </Select>
          </div>
        </aside>
      </div>
    </div>
  );
}

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
