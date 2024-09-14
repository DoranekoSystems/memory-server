import React, { useState } from "react";
import { useStore } from "@/lib/global-store";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/common/Card";
import {
  ThemeProvider,
  createTheme,
  Box,
  Button,
  Tabs,
  Tab,
  Typography,
} from "@mui/material";
import { Modules } from "./Modules";
import { Regions } from "./Regions";

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

const TabPanel = (props: {
  children?: React.ReactNode;
  index: number;
  value: number;
}) => {
  const { children, value, index, ...other } = props;

  return (
    <div
      role="tabpanel"
      hidden={value !== index}
      id={`simple-tabpanel-${index}`}
      aria-labelledby={`simple-tab-${index}`}
      {...other}
    >
      {value === index && <Box sx={{ p: 3 }}>{children}</Box>}
    </div>
  );
};

export function Information() {
  const [tabValue, setTabValue] = useState(0);
  const ipAddress = useStore((state) => state.ipAddress);
  const [refreshing, setRefreshing] = useState(false);

  const handleTabChange = (event: React.SyntheticEvent, newValue: number) => {
    setTabValue(newValue);
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    setRefreshing(false);
  };

  return (
    <ThemeProvider theme={theme}>
      <div className="flex flex-col items-center flex-grow mt-8 px-4">
        <Card className="w-full max-w-5xl mb-6">
          <CardHeader className="flex justify-between">
            <CardTitle className="text-2xl mb-1">Information</CardTitle>
          </CardHeader>
          <CardContent>
            <Tabs
              value={tabValue}
              onChange={handleTabChange}
              aria-label="information tabs"
            >
              <Tab label="Module" />
              <Tab label="Region" />
            </Tabs>
            <Box sx={{ mt: 2 }}>
              <div style={{ display: tabValue === 0 ? "block" : "none" }}>
                <Modules />
              </div>
              <div style={{ display: tabValue === 1 ? "block" : "none" }}>
                <Regions />
              </div>
              <div style={{ display: tabValue === 2 ? "block" : "none" }}></div>
            </Box>
          </CardContent>
        </Card>
      </div>
    </ThemeProvider>
  );
}
