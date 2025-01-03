import React, { useEffect, useState, useCallback } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Checkbox,
  Typography,
  IconButton,
  Tooltip,
  useTheme,
  useMediaQuery,
  ThemeProvider,
  createTheme,
  Select,
  MenuItem,
  TextField,
  Button,
  ButtonGroup,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  FormControl,
  FormLabel,
  Radio,
  RadioGroup,
} from "@mui/material";
import { styled } from "@mui/system";
import { tableCellClasses } from "@mui/material/TableCell";
import {
  Refresh as RefreshIcon,
  Delete as DeleteIcon,
  Edit as EditIcon,
  Save as SaveIcon,
  Cancel as CancelIcon,
  BugReport as BugReportIcon,
  Done as DoneIcon,
  Check as CheckIcon,
  CheckCircle as CheckCircleIcon,
} from "@mui/icons-material";
import {
  getByteLengthFromScanType,
  arrayBufferToLittleEndianHexString,
  convertFromLittleEndianHex,
} from "@/lib/converter";
import { useBookmarkStore } from "../../lib/global-store";
import { isHexadecimal } from "@/lib/utils";
import { useStore, useWatchpointStore } from "@/lib/global-store";
import { v4 as uuidv4 } from "uuid";

const theme = createTheme({
  palette: {
    primary: {
      main: "#1976d2",
    },
  },
});

const StyledTableContainer = styled(TableContainer)(({ theme }) => ({
  maxHeight: "70vh",
  "&::-webkit-scrollbar": {
    width: "0.4em",
  },
  "&::-webkit-scrollbar-track": {
    boxShadow: "inset 0 0 6px rgba(0,0,0,0.00)",
    webkitBoxShadow: "inset 0 0 6px rgba(0,0,0,0.00)",
  },
  "&::-webkit-scrollbar-thumb": {
    backgroundColor: "rgba(0,0,0,.1)",
    outline: "1px solid slategrey",
    borderRadius: "4px",
  },
}));

const StyledTableCell = styled(TableCell)(({ theme }) => ({
  [`&.${tableCellClasses.head}`]: {
    backgroundColor: theme.palette.primary.main,
    color: theme.palette.common.white,
  },
  [`&.${tableCellClasses.body}`]: {
    fontSize: 14,
    padding: "6px 16px",
  },
}));

const StyledTableRow = styled(TableRow)(({ theme }) => ({
  height: "26px",
  "&:nth-of-type(odd)": {
    backgroundColor: theme.palette.action.hover,
  },
  "&:last-child td, &:last-child th": {
    border: 0,
  },
  "&:hover": {
    backgroundColor: theme.palette.action.selected,
  },
}));

const BookmarkTable = ({ isVisible }) => {
  const memoryApi = useStore((state) => state.memoryApi);
  const targetOS = useStore((state) => state.targetOS);
  const serverMode = useStore((state) => state.serverMode);
  const { bookmarkLists, addBookmark, updateBookmark, removeBookmark } =
    useBookmarkStore();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));
  const ipAddress = useStore((state) => state.ipAddress);
  const toggleFreeze = useBookmarkStore((state) => state.toggleFreeze);
  const [refreshing, setRefreshing] = useState(false);
  const [frozenValues, setFrozenValues] = useState({});
  const [frozenRows, setFrozenRows] = useState({});
  const [editingIndex, setEditingIndex] = useState(null);
  const [editedType, setEditedType] = useState("");
  const [editedValue, setEditedValue] = useState("");
  const [editedBase, setEditedBase] = useState({});
  const [open, setOpen] = useState(false);
  const [selectedSize, setSelectedSize] = useState("1");
  const [selectedType, setSelectedType] = useState("r");

  const isRowFrozen = useCallback(
    (index) => bookmarkLists[index].isFrozen,
    [bookmarkLists]
  );

  const handleFreezeToggle = useCallback(
    (index: number) => {
      toggleFreeze(index);
    },
    [bookmarkLists]
  );

  const updateDisplayedRows = useCallback(async () => {
    if (!isVisible) return;
    const length = bookmarkLists.length;
    await Promise.all(
      bookmarkLists.map(async (bookmark, index) => {
        try {
          let resolveAddr = bookmark.address;
          if (!isHexadecimal(bookmark.query)) {
            let result = await memoryApi.resolveAddress(bookmark.query);
            if (result.success) {
              resolveAddr = result.data.address;
            } else {
              return;
            }
          }
          const result = await memoryApi.readProcessMemory(
            resolveAddr,
            getByteLengthFromScanType(bookmark.type, bookmark.value)
          );
          if (result.success) {
            const memoryData = result.data;
            const updatedValue = memoryData
              ? arrayBufferToLittleEndianHexString(memoryData)
              : "???????";

            const finalValue = isRowFrozen(index)
              ? bookmark.value
              : updatedValue;

            if (bookmarkLists.length == length) {
              updateBookmark(index, {
                ...bookmark,
                address: resolveAddr,
                value: finalValue,
              });
            }
          }
        } catch (error) {
          console.error("Error updating memory value:", error);
          return bookmark;
        }
      })
    );
    setRefreshing(false);
  }, [bookmarkLists, ipAddress, frozenValues, isRowFrozen, isVisible]);

  const freezeMemory = useCallback(async () => {
    for (const [index, bookmark] of bookmarkLists.entries()) {
      if (isRowFrozen(index)) {
        try {
          const buffer = new ArrayBuffer(
            getByteLengthFromScanType(bookmark.type, bookmark.value)
          );
          const view = new DataView(buffer);
          const value = convertFromLittleEndianHex(
            bookmark.value,
            bookmark.type
          );

          switch (bookmark.type) {
            case "int8":
              view.setInt8(0, value);
              break;
            case "uint8":
              view.setUint8(0, value);
              break;
            case "int16":
              view.setInt16(0, value, true);
              break;
            case "uint16":
              view.setUint16(0, value, true);
              break;
            case "int32":
              view.setInt32(0, value, true);
              break;
            case "uint32":
              view.setUint32(0, value, true);
              break;
            case "int64":
              view.setBigInt64(0, BigInt(value), true);
              break;
            case "uint64":
              view.setBigUint64(0, BigInt(value), true);
              break;
            case "float":
              view.setFloat32(0, value, true);
              break;
            case "double":
              view.setFloat64(0, value, true);
              break;
            default:
              console.error("Unsupported type:", bookmark.type);
              return;
          }
          let resolveAddr = bookmark.address;
          if (!isHexadecimal(bookmark.query)) {
            const ret = await memoryApi.resolveAddress(bookmark.query);
            if (ret.success) {
              resolveAddr = ret.data.addres;
            } else {
              return;
            }
          }
          const ret = await memoryApi.writeProcessMemory(resolveAddr, buffer);
          if (ret.success) {
            console.log(
              `Memory frozen successfully for address: 0x${BigInt(
                bookmark.address
              )
                .toString(16)
                .toUpperCase()}`
            );
          } else {
            console.log(ret.message);
          }

          setFrozenValues((prev) => ({
            ...prev,
            [bookmark.address]: bookmark.value,
          }));
        } catch (error) {
          console.error("Error freezing memory:", error);
        }
      }
    }
  }, [bookmarkLists, ipAddress, isRowFrozen]);

  useEffect(() => {
    const interval = setInterval(() => {
      updateDisplayedRows();
      freezeMemory();
    }, 600);
    return () => clearInterval(interval);
  }, [updateDisplayedRows, freezeMemory]);

  const handleRefresh = useCallback(() => {
    setRefreshing(true);
    updateDisplayedRows();
  }, [updateDisplayedRows]);

  const handleDelete = useCallback(
    (index) => {
      removeBookmark(index);
    },
    [removeBookmark]
  );

  const handleEdit = (event, index) => {
    event.stopPropagation();
    setEditingIndex(index);
    setEditedType(bookmarkLists[index].type);
    setEditedValue(
      convertFromLittleEndianHex(
        bookmarkLists[index].value,
        bookmarkLists[index].type
      )
    );
    setEditedBase({ ...editedBase, [index]: "dec" });
  };

  const handleCancel = (event, index) => {
    event.stopPropagation();
    setEditingIndex(null);
  };

  const handleSetWatchPoint = async (event, index) => {
    const address = bookmarkLists[index].address;
    const result = await memoryApi.setWatchPoint(
      address,
      parseInt(selectedSize),
      selectedType
    );
    if (result.success) {
      const uuid = uuidv4();
      useWatchpointStore.getState().addWatchpoint({
        address,
        size: parseInt(selectedSize),
        type: selectedType,
        id: uuid,
      });
    }
    setOpen(false);
  };

  const handleSave = async (event, index) => {
    event.stopPropagation();
    const updatedBookmark = { ...bookmarkLists[index] };
    updatedBookmark.type = editedType;

    let valueToConvert = editedValue;
    if (editedBase[index] === "hex") {
      valueToConvert = parseInt(editedValue, 16).toString();
    }

    const buffer = new ArrayBuffer(
      getByteLengthFromScanType(editedType, valueToConvert)
    );
    const view = new DataView(buffer);

    switch (editedType) {
      case "int8":
        view.setInt8(0, parseInt(valueToConvert));
        break;
      case "uint8":
        view.setUint8(0, parseInt(valueToConvert));
        break;
      case "int16":
        view.setInt16(0, parseInt(valueToConvert), true);
        break;
      case "uint16":
        view.setUint16(0, parseInt(valueToConvert), true);
        break;
      case "int32":
        view.setInt32(0, parseInt(valueToConvert), true);
        break;
      case "uint32":
        view.setUint32(0, parseInt(valueToConvert), true);
        break;
      case "int64":
        view.setBigInt64(0, BigInt(valueToConvert), true);
        break;
      case "uint64":
        view.setBigUint64(0, BigInt(valueToConvert), true);
        break;
      case "float":
        view.setFloat32(0, parseFloat(valueToConvert), true);
        break;
      case "double":
        view.setFloat64(0, parseFloat(valueToConvert), true);
        break;
      default:
        console.error("Unsupported type:", editedType);
        return;
    }
    updatedBookmark.value = arrayBufferToLittleEndianHexString(buffer);
    try {
      let resolveAddr = updatedBookmark.address;
      if (!isHexadecimal(updatedBookmark.query)) {
        const ret = await memoryApi.resolveAddress(updatedBookmark.query);
        if (!ret.success) {
          return;
        }
        resolveAddr = ret.data.address;
      }

      const ret = await memoryApi.writeProcessMemory(resolveAddr, buffer);
      if (ret.success) {
        console.log(
          `Memory updated successfully for address: 0x${BigInt(resolveAddr)
            .toString(16)
            .toUpperCase()}`
        );
      } else {
        console.log(ret.message);
      }

      updateBookmark(index, updatedBookmark);
      setEditingIndex(null);
    } catch (error) {
      console.error("Error updating memory:", error);
    }
  };

  const toggleBase = (index) => {
    setEditedBase((prev) => ({
      ...prev,
      [index]: prev[index] === "dec" ? "hex" : "dec",
    }));

    if (editedBase[index] === "dec") {
      // Convert to hex based on the type
      switch (editedType) {
        case "float":
        case "double":
          setEditedValue(Number(editedValue).toString(16));
          break;
        default:
          setEditedValue(BigInt(editedValue).toString(16));
      }
    } else {
      // Convert to dec based on the type
      switch (editedType) {
        case "float":
        case "double":
          setEditedValue(Number(`0x${editedValue}`).toString());
          break;
        default:
          setEditedValue(BigInt(`0x${editedValue}`).toString());
      }
    }
  };

  return (
    <ThemeProvider theme={theme}>
      <Paper
        elevation={3}
        sx={{ width: "100%", overflow: "hidden", borderRadius: 2 }}
      >
        <Typography
          variant="h6"
          sx={{ p: 2, bgcolor: "primary.main", color: "primary.contrastText" }}
        >
          Bookmarks
          <IconButton
            color="inherit"
            onClick={handleRefresh}
            disabled={refreshing}
            sx={{ ml: 2 }}
          >
            <RefreshIcon />
          </IconButton>
        </Typography>
        <StyledTableContainer>
          <Table stickyHeader aria-label="bookmark table">
            <TableHead>
              <TableRow>
                {!isMobile && <StyledTableCell>Index</StyledTableCell>}
                <StyledTableCell>Address</StyledTableCell>
                <StyledTableCell>Type</StyledTableCell>
                <StyledTableCell>Value</StyledTableCell>
                <StyledTableCell align="center">Freeze</StyledTableCell>
                <StyledTableCell align="center">Actions</StyledTableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {bookmarkLists.map((row, index) => (
                <StyledTableRow
                  key={row.address + "-" + index}
                  selected={isRowFrozen(index)}
                  hover
                >
                  {!isMobile && (
                    <StyledTableCell
                      component="th"
                      scope="row"
                      onClick={(event) => event.stopPropagation()}
                    >
                      {index + 1}
                    </StyledTableCell>
                  )}
                  <StyledTableCell
                    onClick={(event) => event.stopPropagation()}
                  >{`0x${BigInt(row.address)
                    .toString(16)
                    .toUpperCase()}`}</StyledTableCell>
                  <StyledTableCell onClick={(event) => event.stopPropagation()}>
                    {editingIndex === index ? (
                      <Select
                        value={editedType}
                        onChange={(e) => setEditedType(e.target.value)}
                        onClick={(e) => e.stopPropagation()}
                      >
                        <MenuItem value="int8">int8</MenuItem>
                        <MenuItem value="uint8">uint8</MenuItem>
                        <MenuItem value="int16">int16</MenuItem>
                        <MenuItem value="uint16">uint16</MenuItem>
                        <MenuItem value="int32">int32</MenuItem>
                        <MenuItem value="uint32">uint32</MenuItem>
                        <MenuItem value="int64">int64</MenuItem>
                        <MenuItem value="uint64">uint64</MenuItem>
                        <MenuItem value="float">float</MenuItem>
                        <MenuItem value="double">double</MenuItem>
                      </Select>
                    ) : (
                      row.type
                    )}
                  </StyledTableCell>
                  <StyledTableCell onClick={(event) => event.stopPropagation()}>
                    {editingIndex === index ? (
                      <>
                        <TextField
                          value={editedValue}
                          onChange={(e) => setEditedValue(e.target.value)}
                          onClick={(e) => e.stopPropagation()}
                        />
                        {/*<ButtonGroup size="small">
                          <Button onClick={() => toggleBase(index)}>
                            {editedBase[index] === "dec" ? "DEC" : "HEX"}
                          </Button>
                        </ButtonGroup>*/}
                      </>
                    ) : (
                      convertFromLittleEndianHex(row.value, row.type)
                    )}
                  </StyledTableCell>
                  <StyledTableCell
                    align="center"
                    onClick={(event) => event.stopPropagation()}
                  >
                    <Checkbox
                      checked={isRowFrozen(index)}
                      onChange={() => handleFreezeToggle(index)}
                    />
                  </StyledTableCell>
                  <StyledTableCell
                    align="center"
                    onClick={(event) => event.stopPropagation()}
                  >
                    {editingIndex === index ? (
                      <>
                        <Tooltip title="Save">
                          <IconButton
                            onClick={(e) => handleSave(e, index)}
                            size="small"
                          >
                            <SaveIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                        <Tooltip title="Cancel">
                          <IconButton
                            onClick={(e) => handleCancel(e, index)}
                            size="small"
                          >
                            <CancelIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      </>
                    ) : (
                      <>
                        <Tooltip title="Edit">
                          <IconButton
                            onClick={(e) => handleEdit(e, index)}
                            size="small"
                          >
                            <EditIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                        {targetOS === "ios" ||
                        (targetOS === "macos" && serverMode == "normal") ? (
                          <Tooltip title="Watch">
                            <IconButton
                              onClick={(e) => {
                                e.stopPropagation();
                                {
                                  setOpen(true);
                                }
                              }}
                              size="small"
                            >
                              <BugReportIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                        ) : (
                          ""
                        )}
                        <Tooltip title="Delete">
                          <IconButton
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDelete(index);
                            }}
                            size="small"
                          >
                            <DeleteIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>{" "}
                        <Dialog open={open} onClose={() => {}}>
                          <DialogTitle>
                            Select watchpoint size and type
                          </DialogTitle>
                          <DialogContent>
                            <FormControl component="fieldset">
                              <FormLabel component="legend">Size</FormLabel>
                              <RadioGroup
                                value={selectedSize}
                                onChange={(e) =>
                                  setSelectedSize(e.target.value)
                                }
                              >
                                <FormControlLabel
                                  value="1"
                                  control={<Radio />}
                                  label="1"
                                />
                                <FormControlLabel
                                  value="2"
                                  control={<Radio />}
                                  label="2"
                                />
                                <FormControlLabel
                                  value="4"
                                  control={<Radio />}
                                  label="4"
                                />
                                <FormControlLabel
                                  value="8"
                                  control={<Radio />}
                                  label="8"
                                />
                              </RadioGroup>

                              <FormLabel component="legend">Type</FormLabel>
                              <RadioGroup
                                value={selectedType}
                                onChange={(e) =>
                                  setSelectedType(e.target.value)
                                }
                              >
                                <FormControlLabel
                                  value="r"
                                  control={<Radio />}
                                  label="Read"
                                />
                                <FormControlLabel
                                  value="w"
                                  control={<Radio />}
                                  label="Write"
                                />
                                <FormControlLabel
                                  value="a"
                                  control={<Radio />}
                                  label="Access"
                                />
                              </RadioGroup>
                            </FormControl>
                          </DialogContent>
                          <DialogActions>
                            <Tooltip title="Set">
                              <IconButton
                                onClick={(e) => handleSetWatchPoint(e, index)}
                                size="small"
                              >
                                <CheckCircleIcon fontSize="small" />
                              </IconButton>
                            </Tooltip>
                            <Tooltip title="Cancel">
                              <IconButton
                                onClick={(e) => {
                                  {
                                    setOpen(false);
                                  }
                                }}
                                size="small"
                              >
                                <CancelIcon fontSize="small" />
                              </IconButton>
                            </Tooltip>
                          </DialogActions>
                        </Dialog>
                      </>
                    )}
                  </StyledTableCell>
                </StyledTableRow>
              ))}
            </TableBody>
          </Table>
        </StyledTableContainer>
      </Paper>
    </ThemeProvider>
  );
};

export default BookmarkTable;
