import React, { useState, useMemo } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Typography,
  IconButton,
  Collapse,
  Box,
  TextField,
} from "@mui/material";
import KeyboardArrowDownIcon from "@mui/icons-material/KeyboardArrowDown";
import KeyboardArrowUpIcon from "@mui/icons-material/KeyboardArrowUp";

const BreakTraceTable = ({ data }) => {
  const [openRows, setOpenRows] = useState({});
  const [mnemonicFilter, setMnemonicFilter] = useState("");
  const [registerFilter, setRegisterFilter] = useState("");

  const toggleRow = (index) => {
    setOpenRows((prev) => ({ ...prev, [index]: !prev[index] }));
  };

  const compareRegisters = (currentReg, nextReg) => {
    const changedRegs = {};
    for (const reg in currentReg) {
      if (nextReg && currentReg[reg] !== nextReg[reg]) {
        changedRegs[reg] = true;
      }
    }
    return changedRegs;
  };

  const filteredData = useMemo(() => {
    return data.filter((breakpoint, index) => {
      const mnemonicMatch = breakpoint.mnemonic
        .toLowerCase()
        .includes(mnemonicFilter.toLowerCase());

      let registerMatch = true;
      if (registerFilter) {
        const nextBreakpoint = data[index + 1];
        const changedRegs = nextBreakpoint
          ? compareRegisters(breakpoint.register, nextBreakpoint.register)
          : {};
        registerMatch = changedRegs[registerFilter.toLowerCase()];
      }

      return mnemonicMatch && registerMatch;
    });
  }, [data, mnemonicFilter, registerFilter]);

  if (!data || data.length === 0) {
    return <Typography>No breakpoint data available.</Typography>;
  }

  return (
    <Box>
      <TextField
        label="Filter by Mnemonic"
        variant="outlined"
        value={mnemonicFilter}
        onChange={(e) => setMnemonicFilter(e.target.value)}
        style={{ marginBottom: "1rem", marginRight: "1rem" }}
      />
      <TextField
        label="Filter by Changed Register"
        variant="outlined"
        value={registerFilter}
        onChange={(e) => setRegisterFilter(e.target.value)}
        style={{ marginBottom: "1rem" }}
      />
      <TableContainer component={Paper}>
        <Table aria-label="breakpoint trace table" size="small">
          <TableHead>
            <TableRow>
              <TableCell style={{ padding: "6px" }}>Index</TableCell>
              <TableCell style={{ padding: "6px" }}>Address</TableCell>
              <TableCell style={{ padding: "6px" }}>Mnemonic</TableCell>
              <TableCell style={{ padding: "6px" }}>Operands</TableCell>
              <TableCell style={{ padding: "6px" }}>Details</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {filteredData.map((breakpoint, index) => {
              const originalIndex = data.findIndex(
                (item) => item === breakpoint
              );
              const nextBreakpoint = data[originalIndex + 1];
              const changedRegs = nextBreakpoint
                ? compareRegisters(breakpoint.register, nextBreakpoint.register)
                : {};

              return (
                <React.Fragment key={originalIndex}>
                  <TableRow>
                    <TableCell style={{ padding: "6px" }}>
                      {originalIndex + 1}
                    </TableCell>
                    <TableCell style={{ padding: "6px" }}>
                      0x{BigInt(breakpoint.address).toString(16).toUpperCase()}
                    </TableCell>
                    <TableCell style={{ padding: "6px" }}>
                      {breakpoint.mnemonic}
                    </TableCell>
                    <TableCell style={{ padding: "6px" }}>
                      {breakpoint.operands}
                    </TableCell>
                    <TableCell style={{ padding: "6px" }}>
                      <IconButton
                        aria-label="expand row"
                        size="small"
                        onClick={() => toggleRow(originalIndex)}
                      >
                        {openRows[originalIndex] ? (
                          <KeyboardArrowUpIcon />
                        ) : (
                          <KeyboardArrowDownIcon />
                        )}
                      </IconButton>
                    </TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell
                      style={{ paddingBottom: 0, paddingTop: 0 }}
                      colSpan={5}
                    >
                      <Collapse
                        in={openRows[originalIndex]}
                        timeout="auto"
                        unmountOnExit
                      >
                        <Box sx={{ margin: 1 }}>
                          <Typography
                            variant="subtitle2"
                            gutterBottom
                            component="div"
                          >
                            Register Information
                          </Typography>
                          <Table size="small" aria-label="register info">
                            <TableHead>
                              <TableRow>
                                <TableCell style={{ padding: "4px" }}>
                                  Register
                                </TableCell>
                                <TableCell style={{ padding: "4px" }}>
                                  Value
                                </TableCell>
                              </TableRow>
                            </TableHead>
                            <TableBody>
                              {Object.entries(breakpoint.register).map(
                                ([reg, value]) => (
                                  <TableRow key={reg}>
                                    <TableCell
                                      component="th"
                                      scope="row"
                                      style={{ padding: "4px" }}
                                    >
                                      {reg}
                                    </TableCell>
                                    <TableCell
                                      style={{
                                        padding: "4px",
                                        color: changedRegs[reg]
                                          ? "red"
                                          : "inherit",
                                      }}
                                    >
                                      0x
                                      {BigInt(value).toString(16).toUpperCase()}
                                    </TableCell>
                                  </TableRow>
                                )
                              )}
                            </TableBody>
                          </Table>
                        </Box>
                      </Collapse>
                    </TableCell>
                  </TableRow>
                </React.Fragment>
              );
            })}
          </TableBody>
        </Table>
      </TableContainer>
    </Box>
  );
};

export default BreakTraceTable;
