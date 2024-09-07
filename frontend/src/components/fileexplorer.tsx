import React, { useState, useCallback, useEffect } from "react";
import { useStore } from "./global-store";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ThemeProvider,
  createTheme,
  Box,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  Typography,
  Divider,
  TextField,
  Button,
  CircularProgress,
  Breadcrumbs,
  Link,
  Menu,
  MenuItem,
} from "@mui/material";
import {
  Folder as FolderIcon,
  FolderOpen as FolderOpenIcon,
  InsertDriveFile as FileIcon,
  ChevronRight as ChevronRightIcon,
  ExpandMore as ExpandMoreIcon,
  Home as HomeIcon,
} from "@mui/icons-material";
import axios from "axios";
import path from "path-browserify";

const theme = createTheme({
  palette: {
    primary: {
      main: "#1976d2",
    },
    background: {
      default: "#f5f5f5",
    },
  },
  components: {
    MuiCard: {
      styleOverrides: {
        root: {
          borderRadius: 8,
          boxShadow: "0 4px 6px rgba(0, 0, 0, 0.1)",
        },
      },
    },
    MuiListItem: {
      styleOverrides: {
        root: {
          borderRadius: 4,
          "&:hover": {
            backgroundColor: "rgba(25, 118, 210, 0.08)",
          },
        },
      },
    },
  },
});

const getFileColor = (fileName) => {
  const extension = fileName.split(".").pop().toLowerCase();
  switch (extension) {
    case "pdf":
      return "#FF0000";
    case "doc":
    case "docx":
      return "#0000FF";
    case "xls":
    case "xlsx":
      return "#008000";
    case "jpg":
    case "jpeg":
    case "png":
      return "#FFA500";
    default:
      return "#000000";
  }
};

const FileItem = ({
  item,
  depth = 0,
  onToggle,
  onFolderOpen,
  baseDirectory,
  onContextMenu,
}) => {
  const [loading, setLoading] = useState(false);

  const handleContextMenu = (event) => {
    event.preventDefault();
    onContextMenu(event, item);
  };

  const formatSize = (size) => {
    if (size === null || size === undefined) return "";
    if (size < 1024) return `${size} B`;
    if (size < 1024 * 1024) return `${(size / 1024).toFixed(2)} KB`;
    return `${(size / (1024 * 1024)).toFixed(2)} MB`;
  };

  const formatDate = (timestamp) => {
    if (!timestamp) return "";
    return new Date(timestamp * 1000).toLocaleString();
  };

  const handleToggle = async () => {
    if (item.item_type === "directory" && !item.expanded) {
      setLoading(true);
      try {
        const fullPath = path.join(baseDirectory, item.name);
        await onFolderOpen(fullPath, item);
      } catch (error) {
        console.error("Error fetching folder contents:", error);
      } finally {
        setLoading(false);
      }
    }
    onToggle(item);
  };

  const iconColor =
    item.item_type === "file" ? getFileColor(item.name) : "inherit";

  return (
    <>
      <ListItem
        button
        onClick={handleToggle}
        onContextMenu={handleContextMenu}
        sx={{
          pl: depth * 2,
          borderLeft: depth > 0 ? "1px solid #e0e0e0" : "none",
        }}
      >
        <ListItemIcon sx={{ minWidth: 36 }}>
          {item.item_type === "directory" ? (
            item.expanded ? (
              <FolderOpenIcon color="primary" fontSize="small" />
            ) : (
              <FolderIcon color="primary" fontSize="small" />
            )
          ) : (
            <FileIcon style={{ color: iconColor }} fontSize="small" />
          )}
        </ListItemIcon>
        <ListItemText
          primary={item.name}
          secondary={item.item_type === "file" ? formatSize(item.size) : ""}
          primaryTypographyProps={{ style: { fontSize: "0.9rem" } }}
          secondaryTypographyProps={{ style: { fontSize: "0.8rem" } }}
        />
        {item.item_type === "directory" &&
          (loading ? (
            <CircularProgress size={24} />
          ) : (
            <ChevronRightIcon
              sx={{
                transform: item.expanded ? "rotate(90deg)" : "none",
                transition: "transform 0.3s",
              }}
            />
          ))}
      </ListItem>
      {item.item_type === "file" && item.expanded && (
        <ListItem sx={{ pl: (depth + 1) * 2, borderLeft: "1px solid #e0e0e0" }}>
          <ListItemText
            secondary={`Last modified: ${formatDate(item.last_opened)}`}
            secondaryTypographyProps={{ style: { fontSize: "0.8rem" } }}
          />
        </ListItem>
      )}
      {item.item_type === "directory" && item.expanded && item.children && (
        <FileList
          items={item.children}
          depth={depth + 1}
          onToggle={onToggle}
          onFolderOpen={onFolderOpen}
          baseDirectory={path.join(baseDirectory, item.name)}
          onContextMenu={onContextMenu}
        />
      )}
    </>
  );
};

const FileList = ({
  items,
  depth = 0,
  onToggle,
  onFolderOpen,
  baseDirectory,
  onContextMenu,
}) => {
  const sortedItems = [...items].sort((a, b) => {
    if (a.item_type === b.item_type) {
      return a.name.localeCompare(b.name);
    }
    return a.item_type === "directory" ? -1 : 1;
  });

  return (
    <List dense disablePadding>
      {sortedItems.map((item) => (
        <React.Fragment key={`${item.name}-${item.item_type}-${depth}`}>
          <FileItem
            item={item}
            depth={depth}
            onToggle={onToggle}
            onFolderOpen={onFolderOpen}
            baseDirectory={baseDirectory}
            onContextMenu={onContextMenu}
          />
          {item.item_type === "directory" && !item.expanded && (
            <Divider component="li" />
          )}
        </React.Fragment>
      ))}
    </List>
  );
};
export function FileView() {
  const [currentPath, setCurrentPath] = useState("/private/var");
  const [inputPath, setInputPath] = useState("/private/var");
  const [fileStructure, setFileStructure] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [contextMenu, setContextMenu] = useState(null);
  const [selectedItem, setSelectedItem] = useState(null);
  const ipAddress = useStore((state) => state.ipAddress);

  useEffect(() => {}, [ipAddress]);

  const findItemPath = useCallback((items, targetItem, currentPath = "") => {
    for (const item of items) {
      const itemPath = path.join(currentPath, item.name);
      if (item === targetItem) {
        return itemPath;
      }
      if (item.item_type === "directory" && item.children) {
        const foundPath = findItemPath(item.children, targetItem, itemPath);
        if (foundPath) return foundPath;
      }
    }
    return null;
  }, []);

  const updateFileStructure = useCallback((data, basePath) => {
    return data.map((item) => ({
      ...item,
      fullPath: path.join(basePath, item.name),
      children: item.item_type === "directory" ? [] : undefined,
    }));
  }, []);

  const fetchDirectoryContents = async (directoryPath) => {
    const encodedPath = encodeURIComponent(directoryPath);
    const response = await axios.get(
      `http://${ipAddress}:3030/exploredirectory?path=${encodedPath}&max_depth=1`
    );
    return response.data;
  };

  const buildFileStructure = useCallback((items) => {
    return items.map((item) => ({
      ...item,
      item_type: item.item_type,
      expanded: false,
      children: item.item_type === "directory" ? [] : undefined,
    }));
  }, []);

  const handlePathChange = (event) => {
    setInputPath(event.target.value);
  };

  const handleSubmit = async () => {
    let result = await loadDirectory(inputPath);
    if (result) {
      setCurrentPath(inputPath);
    }
  };

  const loadDirectory = async (directoryPath) => {
    setLoading(true);
    setError("");
    let result = false;
    try {
      const data = await fetchDirectoryContents(directoryPath);
      if (data.length > 0) {
        result = true;
      } else {
        return;
      }
      setFileStructure(buildFileStructure(data));
      setCurrentPath(directoryPath);
    } catch (err) {
      setError(
        "Failed to fetch directory structure. Please check the path and try again."
      );
      console.error("Error fetching directory structure:", err);
    } finally {
      setLoading(false);
      return result;
    }
  };

  const handleContextMenu = useCallback((event, item) => {
    event.preventDefault();
    setContextMenu(
      contextMenu === null
        ? { mouseX: event.clientX - 2, mouseY: event.clientY - 4 }
        : null
    );
    setSelectedItem(item);
  }, []);

  const handleContextMenuClose = () => {
    setContextMenu(null);
    setSelectedItem(null);
  };

  const handleSetCurrentDirectory = useCallback(() => {
    if (selectedItem && selectedItem.item_type === "directory") {
      const fullPath = findItemPath(fileStructure, selectedItem, currentPath);
      if (fullPath) {
        setCurrentPath(fullPath);
        loadDirectory(fullPath);
      } else {
        console.error(
          "Failed to find the full path for the selected directory"
        );
      }
    }
    handleContextMenuClose();
  }, [selectedItem, fileStructure, currentPath, findItemPath, loadDirectory]);

  const handleDownloadFile = useCallback(async () => {
    if (selectedItem && selectedItem.item_type === "file") {
      const fullPath = findItemPath(fileStructure, selectedItem, currentPath);
      try {
        const response = await axios.get(`http://${ipAddress}:3030/readfile`, {
          params: { path: fullPath },
          responseType: "blob",
        });
        const url = window.URL.createObjectURL(new Blob([response.data]));
        const link = document.createElement("a");
        link.href = url;
        link.setAttribute("download", selectedItem.name);
        document.body.appendChild(link);
        link.click();
        link.parentNode.removeChild(link);
      } catch (error) {
        console.error("Error downloading file:", error);
      }
    }
    handleContextMenuClose();
  }, [selectedItem, currentPath, ipAddress]);

  const handleToggle = useCallback((toggledItem) => {
    setFileStructure((prevStructure) => {
      const toggleItem = (items) => {
        return items.map((item) => {
          if (item === toggledItem) {
            return { ...item, expanded: !item.expanded };
          }
          if (item.children) {
            return { ...item, children: toggleItem(item.children) };
          }
          return item;
        });
      };
      return toggleItem(prevStructure);
    });
  }, []);

  const handleFolderOpen = useCallback(
    async (folderPath, folderItem) => {
      try {
        const data = await fetchDirectoryContents(folderPath);
        const newChildren = buildFileStructure(data);

        setFileStructure((prevStructure) => {
          const updateChildren = (items) => {
            return items.map((item) => {
              if (item === folderItem) {
                return { ...item, children: newChildren, expanded: true };
              }
              if (item.children) {
                return { ...item, children: updateChildren(item.children) };
              }
              return item;
            });
          };
          return updateChildren(prevStructure);
        });
      } catch (error) {
        console.error("Error fetching folder contents:", error);
      }
    },
    [fetchDirectoryContents, buildFileStructure]
  );

  const handleBreadcrumbClick = useCallback(
    (clickedPath) => {
      loadDirectory(clickedPath);
    },
    [loadDirectory]
  );

  const renderBreadcrumbs = () => {
    const pathParts = currentPath.split("/").filter(Boolean);

    return (
      <Breadcrumbs aria-label="breadcrumb">
        <Link
          color="inherit"
          href="#"
          onClick={() => handleBreadcrumbClick("/")}
          style={{ display: "flex", alignItems: "center" }}
        >
          <HomeIcon sx={{ mr: 0.5 }} fontSize="inherit" />
          Root
        </Link>
        {pathParts.map((part, index) => {
          const fullPath = "/" + pathParts.slice(0, index + 1).join("/");
          const isLast = index === pathParts.length - 1;

          return isLast ? (
            <Typography key={fullPath} color="text.primary">
              {part}
            </Typography>
          ) : (
            <Link
              key={fullPath}
              color="inherit"
              href="#"
              onClick={() => handleBreadcrumbClick(fullPath)}
            >
              {part}
            </Link>
          );
        })}
      </Breadcrumbs>
    );
  };

  return (
    <ThemeProvider theme={theme}>
      <div className="flex flex-col items-center flex-grow mt-8 px-4">
        <Card className="w-full max-w-6xl mb-6">
          <CardHeader>
            <CardTitle className="text-2xl mb-1">File Explorer</CardTitle>
          </CardHeader>
          <CardContent>
            <Box sx={{ display: "flex", alignItems: "center", mb: 2 }}>
              <TextField
                fullWidth
                label="Enter Path"
                variant="outlined"
                value={inputPath}
                onChange={handlePathChange}
                sx={{ mr: 2 }}
              />
              <Button
                variant="contained"
                onClick={handleSubmit}
                disabled={loading}
              >
                {loading ? <CircularProgress size={24} /> : "GET"}
              </Button>
            </Box>
            {error && (
              <Typography color="error" sx={{ mb: 2 }}>
                {error}
              </Typography>
            )}
            {renderBreadcrumbs()}
            {fileStructure.length > 0 && (
              <Box
                sx={{
                  bgcolor: "background.paper",
                  borderRadius: 2,
                  overflow: "auto",
                  maxHeight: "60vh",
                  mt: 2,
                }}
              >
                <FileList
                  items={fileStructure}
                  onToggle={handleToggle}
                  onFolderOpen={handleFolderOpen}
                  baseDirectory={currentPath}
                  onContextMenu={handleContextMenu}
                />
              </Box>
            )}
          </CardContent>
        </Card>
      </div>
      <Menu
        open={contextMenu !== null}
        onClose={handleContextMenuClose}
        anchorReference="anchorPosition"
        anchorPosition={
          contextMenu !== null
            ? { top: contextMenu.mouseY, left: contextMenu.mouseX }
            : undefined
        }
      >
        {selectedItem && selectedItem.item_type === "directory" && (
          <MenuItem onClick={handleSetCurrentDirectory}>
            Set as current directory
          </MenuItem>
        )}
        {selectedItem && selectedItem.item_type === "file" && (
          <MenuItem onClick={handleDownloadFile}>Download</MenuItem>
        )}
      </Menu>
    </ThemeProvider>
  );
}
