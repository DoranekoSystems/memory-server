import React, { useState, forwardRef } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  TablePagination,
} from "@mui/material";

const CustomTable = forwardRef((props, ref) => {
  const {
    scanResults,
    selectedIndices,
    handleSelect,
    dataType,
    convertFromLittleEndianHex,
  } = props;
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(1000);

  const handleChangePage = (event, newPage) => {
    setPage(newPage);
  };

  const handleChangeRowsPerPage = (event) => {
    setRowsPerPage(+event.target.value);
    setPage(0);
  };

  return (
    <Paper>
      <TableContainer ref={ref} style={{ maxHeight: 440 }}>
        <Table stickyHeader aria-label="sticky table">
          <TableHead>
            <TableRow>
              <TableCell>Index</TableCell>
              <TableCell>Address</TableCell>
              <TableCell>Value</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {scanResults
              .slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage)
              .map((result, index) => (
                <TableRow
                  key={index}
                  selected={selectedIndices.includes(
                    page * rowsPerPage + index + 1
                  )}
                  onClick={() =>
                    handleSelect(page * rowsPerPage + index + 1, result.address)
                  }
                >
                  <TableCell>{page * rowsPerPage + index + 1}</TableCell>
                  <TableCell>
                    {`0x${BigInt(result.address).toString(16).toUpperCase()}`}
                  </TableCell>
                  <TableCell>
                    {convertFromLittleEndianHex(result.value, dataType)}
                  </TableCell>
                </TableRow>
              ))}
          </TableBody>
        </Table>
      </TableContainer>
      <TablePagination
        rowsPerPageOptions={[100, 500, 1000]}
        component="div"
        count={scanResults.length}
        rowsPerPage={rowsPerPage}
        page={page}
        onPageChange={handleChangePage}
        onRowsPerPageChange={handleChangeRowsPerPage}
      />
    </Paper>
  );
});

export default CustomTable;
