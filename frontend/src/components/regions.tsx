import React, { useState, useEffect } from "react";
import axios from "axios";
import { useStore } from "./global-store";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
    padding: "4px 16px",
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

const MonoCell = styled(StyledTableCell)({
  fontFamily: "monospace",
});

const IndexCell = styled(StyledTableCell)({
  textAlign: "center",
});

const RegionRow = ({ region, index }) => (
  <StyledTableRow>
    <IndexCell style={{ width: "5%" }}>{index}</IndexCell>
    <MonoCell style={{ width: "15%" }}>
      0x{region.start_address.toUpperCase()}
    </MonoCell>
    <MonoCell style={{ width: "15%" }}>
      0x{region.end_address.toUpperCase()}
    </MonoCell>
    <MonoCell style={{ width: "15%" }}>{region.protection}</MonoCell>
    <StyledTableCell style={{ width: "50%" }}>
      {region.file_path || ""}
    </StyledTableCell>
  </StyledTableRow>
);

export function Regions() {
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
    try {
      const response = await axios.get(`http://${ipAddress}:3030/enumregions`);
      const regionData = response.data.regions;
      const formattedRegions = regionData
        .filter((region) => region.protection !== "---")
        .map((region, index) => ({
          ...region,
          index: index + 1,
        }));
      setRegions(formattedRegions);
      setFilteredRegions(formattedRegions);
    } catch (error) {
      console.error("Error fetching regions:", error);
      setError("Failed to fetch regions. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const filtered = regions.filter((region) =>
      region.protection.toLowerCase().includes(filterValue.toLowerCase())
    );
    setFilteredRegions(filtered);
  }, [filterValue, regions]);

  const handleFilterChange = (event) => {
    setFilterValue(event.target.value);
  };

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
                      <StyledTableCell style={{ width: "10%" }}>
                        Protection
                      </StyledTableCell>
                      <StyledTableCell style={{ width: "55%" }} align="center">
                        Path
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
