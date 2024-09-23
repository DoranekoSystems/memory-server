import React, { useState, useEffect } from "react";
import { useStore } from "@/lib/global-store";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/common/Card";
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
  Collapse,
  Box,
  createTheme,
  ThemeProvider,
  TextField,
  Button,
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
    fontSize: 13,
    padding: "6px 16px",
    fontFamily: "font-mono",
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
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
  height: "32px",
}));

const IndexCell = styled(StyledTableCell)({
  textAlign: "center",
});

function trimLeadingZeros(hexStr) {
  if (hexStr.startsWith("0x")) {
    hexStr = hexStr.slice(2);
  }

  const retStr = hexStr.replace(/^0+/, "");
  if (retStr == "") {
    return "0";
  } else {
    return retStr;
  }
}

function getFileName(filePath) {
  if (!filePath) return "";
  const parts = filePath.split(/[\/\\]/);
  return parts[parts.length - 1];
}

const RegionRow = ({ region, index }) => {
  const [open, setOpen] = useState(false);

  return (
    <>
      <StyledTableRow>
        <IndexCell style={{ width: "5%" }}>{index}</IndexCell>
        <StyledTableCell style={{ width: "15%" }}>
          0x{trimLeadingZeros(region.start_address.toUpperCase())}
        </StyledTableCell>
        <StyledTableCell style={{ width: "15%" }}>
          0x{trimLeadingZeros(region.end_address.toUpperCase())}
        </StyledTableCell>
        <StyledTableCell style={{ width: "15%" }}>
          {region.protection}
        </StyledTableCell>
        <StyledTableCell style={{ width: "30%" }}>
          {getFileName(region.file_path)}
        </StyledTableCell>
        <StyledTableCell style={{ width: "5%" }} align="center">
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
        <TableCell style={{ paddingBottom: 0, paddingTop: 0 }} colSpan={6}>
          <Collapse in={open} timeout="auto" unmountOnExit>
            <Box sx={{ margin: 1 }}>
              <Typography variant="h6" gutterBottom component="div">
                Details
              </Typography>
              <Table size="small" aria-label="details">
                <TableBody>
                  <TableRow>
                    <TableCell component="th" scope="row">
                      Full Path
                    </TableCell>
                    <TableCell
                      style={{ wordBreak: "break-word", maxWidth: "300px" }}
                    >
                      {region.file_path || "N/A"}
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

export function Regions() {
  const memoryApi = useStore((state) => state.memoryApi);
  const [regions, setRegions] = useState([]);
  const [filteredRegions, setFilteredRegions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const ipAddress = useStore((state) => state.ipAddress);
  const [refreshing, setRefreshing] = useState(false);
  const [filterValue, setFilterValue] = useState("");

  const handleRefresh = async () => {
    setRefreshing(true);
    setRegions([]);
    await fetchRegions();
    setRefreshing(false);
  };

  const fetchRegions = async () => {
    setLoading(true);
    setError(null);

    const result = await memoryApi.enumRegions();
    if (result.success) {
      const regionData = result.data.regions;
      const formattedRegions = regionData
        .filter((region) => region.protection !== "---")
        .map((region, index) => ({
          ...region,
          index: index + 1,
        }));
      setRegions(formattedRegions);
      setFilteredRegions(formattedRegions);
    } else {
      console.error("Error fetching regions:", error);
      setError("Failed to fetch regions. Please try again.");
    }
    setLoading(false);
  };

  const handleFilterChange = (event) => {
    setFilterValue(event.target.value);
  };

  const filterRegions = (regions, filterValue) => {
    return regions.filter((region) => {
      const protectionMatch = region.protection
        .toLowerCase()
        .split("")
        .some((flag) => filterValue.toLowerCase().includes(flag));
      const fileNameMatch = getFileName(region.file_path)
        .toLowerCase()
        .includes(filterValue.toLowerCase());
      return protectionMatch || fileNameMatch;
    });
  };

  useEffect(() => {
    const filtered = filterRegions(regions, filterValue);
    setFilteredRegions(filtered);
  }, [filterValue, regions]);

  return (
    <ThemeProvider theme={theme}>
      <div className="flex flex-col items-center flex-grow mt-8 px-4">
        <Card className="w-full max-w-4xl mb-6">
          <CardHeader className="flex justify-between">
            <CardTitle className="text-2xl mb-2">Region</CardTitle>
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
                  Regions
                </Typography>
                <IconButton
                  color="inherit"
                  onClick={handleRefresh}
                  disabled={refreshing}
                >
                  <RefreshIcon />
                </IconButton>
              </Box>
              <StyledTableContainer>
                <Table stickyHeader aria-label="regions table">
                  <TableHead>
                    <StyledTableRow>
                      <StyledTableCell style={{ width: "5%" }}>
                        Index
                      </StyledTableCell>
                      <StyledTableCell style={{ width: "15%" }}>
                        Start
                      </StyledTableCell>
                      <StyledTableCell style={{ width: "15%" }}>
                        End
                      </StyledTableCell>
                      <StyledTableCell style={{ width: "15%" }}>
                        Protection
                      </StyledTableCell>
                      <StyledTableCell style={{ width: "30%" }}>
                        File Name
                      </StyledTableCell>
                      <StyledTableCell style={{ width: "5%" }} align="center">
                        Details
                      </StyledTableCell>
                    </StyledTableRow>
                  </TableHead>
                  <TableBody>
                    {filteredRegions.map((region, index) => (
                      <RegionRow
                        key={region.index}
                        region={region}
                        index={index + 1}
                      />
                    ))}
                  </TableBody>
                </Table>
              </StyledTableContainer>
              {error && (
                <Typography color="error" sx={{ mt: 2, p: 2 }}>
                  {error}
                </Typography>
              )}
            </Paper>
          </CardContent>
        </Card>
      </div>
    </ThemeProvider>
  );
}
