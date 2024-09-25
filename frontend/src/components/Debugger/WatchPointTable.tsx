import React from "react";
import { useState, useEffect, useRef, forwardRef } from "react";
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
  Tooltip,
} from "@mui/material";
import { styled } from "@mui/system";
import { Theme } from "@mui/material/styles";
import DeleteIcon from "@mui/icons-material/Delete";
import { useStore, useWatchpointStore } from "@/lib/global-store";

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

const StyledTableCell = styled(TableCell)<{ theme?: Theme }>(({ theme }) => ({
  backgroundColor: theme?.palette?.primary?.main || "#1976d2",
  color: theme?.palette?.common?.white || "#ffffff",
}));

const WatchPointTable = ({ address }) => {
  const memoryApi = useStore((state) => state.memoryApi);
  const watchpointHitsList = useWatchpointStore(
    (state) => state.watchpointHitsList
  );
  const _removeWatchpoint = useWatchpointStore(
    (state) => state.removeWatchpoint
  );

  const handleDelete = async () => {
    const ret = await memoryApi.removeWatchPoint(Number(address));

    if (ret.success) {
      _removeWatchpoint(address);
    } else if (ret.status == 500) {
      console.error("Failed to remove watchpoint");
      _removeWatchpoint(address);
    }
  };

  const matchedWatchpointHits = watchpointHitsList.find(
    (wh) => wh.watchpoint.address === address
  );

  return (
    <Paper
      elevation={3}
      sx={{ width: "100%", overflow: "hidden", borderRadius: 2, mb: 4 }}
    >
      <Typography
        variant="h6"
        sx={{
          p: 2,
          bgcolor: "primary.main",
          color: "primary.contrastText",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <div>
          Watchpoint: 0x{address.toString(16).toUpperCase()}
          {matchedWatchpointHits && (
            <Typography variant="subtitle1">
              Size: {matchedWatchpointHits.watchpoint.size}, Type:{" "}
              {matchedWatchpointHits.watchpoint.type}
            </Typography>
          )}
        </div>
        <Tooltip title="Delete Watchpoint">
          <IconButton
            onClick={handleDelete}
            size="small"
            sx={{
              color: "rgba(255, 255, 255, 0.7)",
              "&:hover": { color: "white" },
            }}
          >
            <DeleteIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      </Typography>
      <TableContainer>
        <Table stickyHeader aria-label="watchpoint table">
          <TableHead>
            <TableRow>
              <StyledTableCell>Count</StyledTableCell>
              <StyledTableCell>Address</StyledTableCell>
              <StyledTableCell>Instruction</StyledTableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {matchedWatchpointHits && matchedWatchpointHits.hits.length > 0 ? (
              matchedWatchpointHits.hits.map((hit, index) => (
                <TableRow key={index}>
                  <TableCell>{hit.count}</TableCell>
                  <TableCell>
                    0x{hit.pcAddress.toString(16).toUpperCase()}
                  </TableCell>
                  <TableCell>{hit.opcode}</TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={3} align="center"></TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </TableContainer>
    </Paper>
  );
};

export default WatchPointTable;
