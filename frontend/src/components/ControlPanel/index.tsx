import React from "react";
import { IconButton, Toolbar, Paper } from "@mui/material";
import PlayArrowIcon from "@mui/icons-material/PlayArrow";
import StopIcon from "@mui/icons-material/Stop";
import { useStore } from "@/lib/global-store";

const ControlPanel = () => {
  const doPlay = useStore((state) => state.doPlay);
  const setDoPlay = useStore((state) => state.setDoPlay);
  const memoryApi = useStore((state) => state.memoryApi);

  const handlePlay = async () => {
    setDoPlay(true);
    await memoryApi.changeProcessState({ doPlay: true });
  };

  const handleStop = async () => {
    setDoPlay(false);
    await memoryApi.changeProcessState({ doPlay: false });
  };

  return (
    <Paper
      elevation={0}
      sx={{
        borderBottom: 1,
        borderColor: "divider",
        borderRadius: 0,
        mb: 0.5,
      }}
    >
      <Toolbar variant="dense" sx={{ minHeight: 56 }}>
        <IconButton
          onClick={handlePlay}
          disabled={doPlay}
          size="large"
          sx={{
            mr: 2,
            color: !doPlay ? "#4CAF50" : "#757575",
            "&:hover": {
              backgroundColor: "rgba(76, 175, 80, 0.04)",
            },
            "& .MuiSvgIcon-root": {
              fontSize: 32,
            },
          }}
        >
          <PlayArrowIcon />
        </IconButton>
        <IconButton
          onClick={handleStop}
          disabled={!doPlay}
          size="large"
          sx={{
            color: !doPlay ? "#757575" : "#f44336",
            "&:hover": {
              backgroundColor: "rgba(244, 67, 54, 0.04)",
            },
            "& .MuiSvgIcon-root": {
              fontSize: 32,
            },
          }}
        >
          <StopIcon />
        </IconButton>
      </Toolbar>
    </Paper>
  );
};

export { ControlPanel };
