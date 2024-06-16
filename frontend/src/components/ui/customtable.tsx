import React, {
  useEffect,
  useRef,
  forwardRef,
  useCallback,
  useState,
} from "react";
import { AutoSizer, Column, Table as RVTable } from "react-virtualized";
import "react-virtualized/styles.css";
import {
  Table,
  TableHeader,
  TableBody,
  TableFooter,
  TableHead,
  TableRow,
  TableCell,
  TableCaption,
} from "./table";
import {
  getByteLengthFromScanType,
  arrayBufferToLittleEndianHexString,
  convertFromLittleEndianHex,
} from "../../lib/converter";
import { readProcessMemory } from "../../lib/api";
import { useStore } from "../global-store";

const CustomTable = forwardRef((props, ref) => {
  const {
    scanResults,
    selectedIndices,
    handleSelect,
    dataType,
    setScanResults,
  } = props;

  const [visibleRange, setVisibleRange] = useState({
    startIndex: 0,
    stopIndex: 0,
  });
  const ipAddress = useStore((state) => state.ipAddress);
  const [isMobile, setIsMobile] = useState(false);

  const rowGetter = ({ index }) => scanResults[index];

  const isRowSelected = (index) => selectedIndices.includes(index + 1);

  const onRowClick = ({ index, rowData }) => {
    handleSelect(index + 1, rowData.address);
  };

  const cellRenderer = useCallback(
    ({ cellData, columnIndex, rowIndex }) => {
      const rowData = scanResults[rowIndex];
      switch (columnIndex) {
        case 0:
          return (
            <TableCell
              className={`${
                isMobile ? "" : "p-4"
              } align-middle text-sm font-sans`}
            >
              {rowIndex + 1}
            </TableCell>
          );
        case 1:
          return (
            <TableCell
              className={`${
                isMobile ? "" : "p-4"
              } align-middle text-sm font-mono`}
            >{`0x${BigInt(rowData.address)
              .toString(16)
              .toUpperCase()}`}</TableCell>
          );
        case 2:
          return (
            <TableCell
              className={`${
                isMobile ? "" : "p-4"
              } align-middle text-sm font-sans`}
            >
              {convertFromLittleEndianHex(rowData.value, dataType)}
            </TableCell>
          );
        default:
          return null;
      }
    },
    [convertFromLittleEndianHex, dataType, scanResults]
  );

  const headerRenderer = ({ label }) => (
    <div
      className={`h-12 ${
        isMobile ? "justify-center" : "px-6"
      } text-center font-medium text-gray-100 bg-blue-800 flex items-center mx-0`}
    >
      {label}
    </div>
  );

  const rowClassName = ({ index }) => {
    const baseClass = "border-b transition-colors";
    const selectedClass =
      "bg-blue-100 dark:bg-blue-900 hover:bg-blue-200 dark:hover:bg-blue-800";
    const defaultClass = "hover:bg-gray-50 dark:hover:bg-gray-900";
    return index !== -1 && isRowSelected(index)
      ? `${baseClass} ${selectedClass}`
      : `${baseClass} ${defaultClass}`;
  };

  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth <= 640);
    };

    window.addEventListener("resize", handleResize);

    handleResize();

    const updateDisplayedRows = async () => {
      const { startIndex, stopIndex } = visibleRange;

      for (let i = startIndex; i <= stopIndex; i++) {
        const result = scanResults[i];
        if (result) {
          try {
            const memoryData = await readProcessMemory(
              ipAddress,
              result.address,
              getByteLengthFromScanType(dataType, result.value)
            );
            let updatedValue = "";
            if (memoryData == null) {
              updatedValue = "???????";
            } else {
              updatedValue = arrayBufferToLittleEndianHexString(memoryData);
            }
            setScanResults((prevResults) =>
              prevResults.map((item) =>
                item.address === result.address
                  ? { ...item, value: updatedValue }
                  : item
              )
            );
          } catch (error) {
            console.error("Error updating memory value:", error);
          }
        }
      }
    };

    const interval = setInterval(updateDisplayedRows, 1000);

    return () => {
      clearInterval(interval);
      window.removeEventListener("resize", handleResize);
    };
  }, [scanResults, dataType, setScanResults, visibleRange]);

  return (
    <div ref={ref} className="w-full h-96">
      <AutoSizer>
        {({ height, width }) => (
          <RVTable
            width={width}
            height={height}
            headerHeight={40}
            rowHeight={40}
            rowCount={scanResults.length}
            rowGetter={rowGetter}
            onRowClick={onRowClick}
            rowClassName={rowClassName}
            onRowsRendered={({ startIndex, stopIndex }) =>
              setVisibleRange({ startIndex, stopIndex })
            }
            gridStyle={{
              overflowX: "hidden",
              overflowY: "auto",
            }}
            className="border-b border-gray-200"
          >
            <Column
              label="Index"
              dataKey="index"
              width={width * 0.2}
              cellRenderer={cellRenderer}
              headerRenderer={headerRenderer}
              className="border-r border-gray-300"
            />
            <Column
              label="Address"
              dataKey="address"
              width={width * 0.4}
              cellRenderer={cellRenderer}
              headerRenderer={headerRenderer}
              className="border-r border-gray-300"
            />
            <Column
              label="Value"
              dataKey="value"
              width={width * 0.4}
              cellRenderer={cellRenderer}
              headerRenderer={headerRenderer}
            />
          </RVTable>
        )}
      </AutoSizer>
    </div>
  );
});

export default CustomTable;
