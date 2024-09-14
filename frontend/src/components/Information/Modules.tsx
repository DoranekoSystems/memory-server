import React, { useState, useCallback, useEffect } from "react";
import axios from "axios";
import { useStore } from "@/lib/global-store";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/common/Card";
import {
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
  IconButton,
  ThemeProvider,
  createTheme,
  Collapse,
  Box,
  Button,
  Autocomplete,
  TextField,
  InputAdornment,
} from "@mui/material";
import { styled } from "@mui/system";
import { tableCellClasses } from "@mui/material/TableCell";
import {
  Refresh as RefreshIcon,
  KeyboardArrowDown,
  KeyboardArrowUp,
  Search as SearchIcon,
} from "@mui/icons-material";
import path from "path";

const theme = createTheme({
  palette: {
    primary: {
      main: "#1976d2",
    },
  },
  components: {
    MuiCard: {
      styleOverrides: {
        root: {
          borderRadius: 0,
        },
      },
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
    padding: "7px 16px",
  },
}));

const StyledTableRow = styled(TableRow)(({ theme }) => ({
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

const ModuleRow = ({ module, index }) => {
  const [open, setOpen] = useState(false);

  return (
    <>
      <StyledTableRow>
        <StyledTableCell>{index}</StyledTableCell>
        <StyledTableCell className="font-mono text-left">
          0x{BigInt(module.start).toString(16).toUpperCase()}
        </StyledTableCell>
        <StyledTableCell className="font-mono text-left">
          0x{BigInt(module.end).toString(16).toUpperCase()}
        </StyledTableCell>
        <StyledTableCell>{path.basename(module.modulename)}</StyledTableCell>
        <StyledTableCell align="center">
          <IconButton
            aria-label="expand row"
            size="small"
            onClick={() => setOpen(!open)}
          >
            {open ? <KeyboardArrowUp /> : <KeyboardArrowDown />}
          </IconButton>
        </StyledTableCell>
      </StyledTableRow>
      <TableRow>
        <TableCell style={{ paddingBottom: 0, paddingTop: 0 }} colSpan={5}>
          <Collapse in={open} timeout="auto" unmountOnExit>
            <Box sx={{ margin: 1 }}>
              <Typography variant="h6" gutterBottom component="div">
                Details
              </Typography>
              <Table size="small" aria-label="details">
                <TableBody>
                  <TableRow>
                    <TableCell component="th" scope="row">
                      Size
                    </TableCell>
                    <TableCell>
                      0x{BigInt(module.size).toString(16).toUpperCase()}
                    </TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell component="th" scope="row">
                      Is 64bit
                    </TableCell>
                    <TableCell>{module.is64bit}</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell component="th" scope="row">
                      Full Path
                    </TableCell>
                    <TableCell
                      style={{ wordBreak: "break-word", maxWidth: "300px" }}
                    >
                      {module.modulename}
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </Box>
          </Collapse>
        </TableCell>
      </TableRow>
    </>
  );
};

export function Modules({ currentPage }) {
  const [modules, setModules] = useState([]);
  const [filteredModules, setFilteredModules] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const ipAddress = useStore((state) => state.ipAddress);
  const [refreshing, setRefreshing] = useState(false);
  const [filterValue, setFilterValue] = useState("");

  const handleRefresh = async () => {
    setRefreshing(true);
    setModules([]);
    await fetchModules();
    setRefreshing(false);
  };

  const fetchModules = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await axios.get(`http://${ipAddress}:3030/enummodule`);
      const moduleData = response.data.modules;
      const formattedModules = moduleData.map((module, index) => ({
        index: index + 1,
        start: module.base,
        end: BigInt(module.base) + BigInt(module.size),
        size: module.size,
        is64bit: module.is_64bit ? "Yes" : "No",
        modulename: module.modulename || "Unknown",
      }));
      setModules(formattedModules);
      setFilteredModules(formattedModules);
    } catch (error) {
      console.error("Error fetching modules:", error);
      setError("Failed to fetch modules. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const filtered = modules.filter((module) =>
      path
        .basename(module.modulename)
        .toLowerCase()
        .includes(filterValue.toLowerCase())
    );
    setFilteredModules(filtered);
  }, [filterValue, modules]);

  const handleFilterChange = (event) => {
    setFilterValue(event.target.value);
  };

  return (
    <ThemeProvider theme={theme}>
      <div className="flex flex-col items-center flex-grow mt-8 px-4">
        <Card className="w-full max-w-4xl mb-6">
          <CardHeader className="flex justify-between">
            <CardTitle className="text-2xl mb-2">Module</CardTitle>
            <Button
              onClick={handleRefresh}
              className="w-1/6 text-gray-100 bg-blue-800 hover:bg-blue-900"
            >
              Get
            </Button>
          </CardHeader>
          <CardContent>
            <Paper
              elevation={3}
              sx={{ width: "100%", overflow: "hidden", borderRadius: 2 }}
            >
              <Box
                sx={{
                  p: 2,
                  bgcolor: "primary.main",
                  color: "primary.contrastText",
                  display: "flex",
                  alignItems: "center",
                }}
              >
                <Typography variant="h6" sx={{ flexGrow: 1 }}>
                  Modules
                </Typography>
                <TextField
                  sx={{
                    width: 300,
                    mr: 2,
                    bgcolor: "white",
                    borderRadius: 1,
                    "& .MuiInputLabel-root": {
                      color: "rgba(0, 0, 0, 0.6)",
                    },
                    "& .MuiOutlinedInput-root": {
                      "& fieldset": {
                        borderColor: "rgba(0, 0, 0, 0.23)",
                      },
                      "&:hover fieldset": {
                        borderColor: "rgba(0, 0, 0, 0.23)",
                      },
                      "&.Mui-focused fieldset": {
                        borderColor: "primary.main",
                      },
                    },
                  }}
                  InputProps={{
                    startAdornment: (
                      <InputAdornment position="start">
                        <SearchIcon />
                      </InputAdornment>
                    ),
                  }}
                  InputLabelProps={{
                    shrink: false,
                  }}
                  placeholder="Filter modules"
                  variant="outlined"
                  size="small"
                  value={filterValue}
                  onChange={handleFilterChange}
                />
                <IconButton
                  color="inherit"
                  onClick={handleRefresh}
                  disabled={refreshing}
                >
                  <RefreshIcon />
                </IconButton>
              </Box>
              <StyledTableContainer>
                <Table stickyHeader aria-label="modules table">
                  <TableHead>
                    <TableRow>
                      <StyledTableCell>Index</StyledTableCell>
                      <StyledTableCell>Start</StyledTableCell>
                      <StyledTableCell>End</StyledTableCell>
                      <StyledTableCell>Module Name</StyledTableCell>
                      <StyledTableCell align="center">Details</StyledTableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {filteredModules.map((module, index) => (
                      <ModuleRow
                        key={module.index}
                        module={module}
                        index={index + 1}
                      />
                    ))}
                  </TableBody>
                </Table>
              </StyledTableContainer>
            </Paper>
            {error && (
              <Typography color="error" sx={{ mt: 2 }}>
                {error}
              </Typography>
            )}
          </CardContent>
        </Card>
      </div>
    </ThemeProvider>
  );
}
