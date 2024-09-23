import React from "react";
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
import { removeWatchPoint } from "@/lib/api";

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

const WatchPointTable = ({ watchpointData, onDelete }) => {
  const memoryApi = useStore((state) => state.memoryApi);
  const ipAddress = useStore((state) => state.ipAddress);
  const _removeWatchpoint = useWatchpointStore(
    (state) => state.removeWatchpoint
  );

  const handleDelete = async () => {
    const ret = await memoryApi.removeWatchPoint(
      Number(watchpointData.address)
    );
    if (ret.success) {
      _removeWatchpoint(watchpointData.address);
      onDelete(watchpointData.address);
    } else if (ret.status == 500) {
      _removeWatchpoint(watchpointData.address);
      onDelete(watchpointData.address);
    }
  };

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
          Watchpoint: 0x{watchpointData.address.toString(16).toUpperCase()}
          <Typography variant="subtitle1">
            Size: {watchpointData.size}, Type: {watchpointData.type}
          </Typography>
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
      <StyledTableContainer>
        <Table stickyHeader aria-label="watchpoint table">
          <TableHead>
            <TableRow>
              <StyledTableCell>Count</StyledTableCell>
              <StyledTableCell>Address</StyledTableCell>
              <StyledTableCell>Opcode</StyledTableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {watchpointData.hits.map((hit, index) => (
              <TableRow key={index}>
                <TableCell>{hit.count}</TableCell>
                <TableCell>
                  0x{hit.address.toString(16).toUpperCase()}
                </TableCell>
                <TableCell>{hit.opcode}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </StyledTableContainer>
    </Paper>
  );
};

export default WatchPointTable;
