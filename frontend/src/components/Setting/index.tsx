import {
  CardTitle,
  CardDescription,
  CardHeader,
  CardContent,
  CardFooter,
  Card,
} from "@/components/common/Card";
import { Label } from "@/components/common/Label";
import { Input } from "@/components/common/Input";
import { Button } from "@/components/common/Button";
import { useState, useEffect, useRef } from "react";
import { useStore } from "@/lib/global-store";
import { MemoryApi } from "@/lib/api";

const InfoItem = ({ label, value }) => (
  <div className="mb-4 last:mb-0">
    <Label className="text-sm font-semibold text-gray-900 mb-1 block">
      {label}
    </Label>
    <p className="text-base text-gray-500 break-words pl-2">{String(value)}</p>
  </div>
);

export function Setting() {
  const [openedProcess, setOpenedProcess] = useState(null);
  const [connectedServer, setConnectedServer] = useState(false);
  const ipAddress = useStore((state) => state.ipAddress);
  const [serverGitHash, setServerGitHash] = useState("");
  const [serverArch, setServerArch] = useState("");
  const [serverPid, setServerPid] = useState(0);
  const serverMode = useStore((state) => state.serverMode);
  const setServerMode = useStore((state) => state.setServerMode);
  const targetOS = useStore((state) => state.targetOS);
  const setTargetOS = useStore((state) => state.setTargetOS);
  const setIpAddress = useStore((state) => state.setIpAddress);
  const setOpenProcessId = useStore((state) => state.setOpenProcessId);
  const memoryApi = useStore((state) => state.memoryApi);
  const setMemoryApi = useStore((state) => state.setMemoryApi);

  const [processes, setProcesses] = useState([]);
  const [selectedProcess, setSelectedProcess] = useState(null);
  const [filterText, setFilterText] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const [applicationInfo, setApplicationInfo] = useState({});

  const handleSelectProcess = (process) => {
    setSelectedProcess(process);
  };

  useEffect(() => {
    if (memoryApi != null) {
      const setupApiCalls = async () => {
        await getServerInfo();
        await fetchProcesses();
      };
      setupApiCalls();
    }
  }, [memoryApi]);

  const setup = async () => {
    if (inputRef.current == null) {
      return null;
    }
    const ip = inputRef.current.value;
    setMemoryApi(new MemoryApi(ip));
  };

  const getServerInfo = async () => {
    if (inputRef.current == null) {
      return null;
    }
    const result = await memoryApi.getServerInfo();
    if (result.success) {
      const data = result.data;
      setServerMode(data.mode);
      setTargetOS(data.target_os);
      setServerArch(data.arch);
      setServerPid(data.pid);
      setServerGitHash(data.git_hash);
    } else {
    }
  };

  const fetchProcesses = async () => {
    const result = await memoryApi.enumProcesses();

    if (result.success) {
      const sortedData = result.data.sort((a: any, b: any) => a.pid - b.pid);
      setIpAddress(memoryApi.ipAddress);
      setProcesses(sortedData);
    }
  };

  const openProcess = async () => {
    if (selectedProcess == null) return;
    const result = await memoryApi.openProcess(selectedProcess.pid);

    if (result.success) {
      setOpenedProcess(selectedProcess);
      await fetchApplicationInfo(selectedProcess.pid);
      setOpenProcessId(selectedProcess.pid);
      return true;
    }
  };

  const fetchApplicationInfo = async (pid) => {
    const result = await memoryApi.fetchApplicationInfo(pid);

    if (typeof result.data.info === "string") {
      const parsedInfo = JSON.parse(result.data.info);
      setApplicationInfo(parsedInfo);
    } else {
      setApplicationInfo(result.data.info);
    }
  };

  useEffect(() => {
    setIpAddress(window.location.hostname);
  }, []);

  const filteredProcesses = processes.filter((process) =>
    process.processname.toLowerCase().includes(filterText.toLowerCase())
  );

  return (
    <div className="flex flex-col min-h-screen">
      <main className="flex flex-col items-center flex-grow px-4 mt-8">
        <Card className="w-full max-w-md mb-6">
          <CardHeader>
            <CardTitle className="text-2xl">Connect to Server</CardTitle>
            <CardDescription>
              Enter the IP address of the server.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="ip-address">IP Address</Label>
              <Input
                id="ip-address"
                defaultValue={ipAddress}
                placeholder={ipAddress}
                required
                type="text"
                ref={inputRef}
              />
            </div>
          </CardContent>
          <CardFooter>
            <Button className="w-full" onClick={setup}>
              Connect
            </Button>
          </CardFooter>
        </Card>
        {serverPid > 0 && (
          <Card className="w-full max-w-md mb-6">
            <CardHeader>
              <CardTitle className="text-2xl">Process List</CardTitle>
              <CardDescription>
                After selecting a process, please open the process.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Input
                placeholder="Filter processes"
                value={filterText}
                onChange={(e) => setFilterText(e.target.value)}
              />
              <div className="p-4">
                <div className="h-64 overflow-auto bg-white border border-gray-200 rounded-md">
                  {filteredProcesses.map((process, index) => (
                    <div
                      key={index}
                      className={`p-2 hover:bg-gray-100 ${
                        selectedProcess?.pid === process.pid
                          ? "bg-blue-100"
                          : ""
                      }`}
                      onClick={() => handleSelectProcess(process)}
                    >
                      {process.pid}:{process.processname}
                    </div>
                  ))}
                </div>
              </div>
            </CardContent>
            <CardFooter>
              <Button className="w-full" onClick={openProcess}>
                OpenProcess
              </Button>
            </CardFooter>
          </Card>
        )}
        {openedProcess && (
          <>
            <Card className="w-full max-w-md mb-6">
              <CardHeader>
                <CardTitle className="text-2xl">Process Info</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <InfoItem label="Process ID" value={openedProcess.pid} />
                <InfoItem
                  label="Process Name"
                  value={openedProcess.processname}
                />
              </CardContent>
            </Card>

            <Card className="w-full max-w-md mb-6">
              <CardHeader>
                <CardTitle className="text-2xl">Application Info</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {Object.entries(applicationInfo).map(([key, value]) => (
                  <InfoItem key={key} label={key} value={value} />
                ))}
              </CardContent>
            </Card>
          </>
        )}

        {serverPid > 0 && (
          <Card className="w-full max-w-md">
            <CardHeader>
              <CardTitle className="text-2xl">Server Info</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <InfoItem label="Target OS" value={targetOS} />
              <InfoItem label="Mode" value={serverMode} />
              <InfoItem label="Pid" value={serverPid} />
              <InfoItem label="Git Hash" value={serverGitHash} />
            </CardContent>
          </Card>
        )}
      </main>
    </div>
  );
}
