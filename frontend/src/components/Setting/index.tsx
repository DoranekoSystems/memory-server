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

  const [processes, setProcesses] = useState([]);
  const [selectedProcess, setSelectedProcess] = useState(null);
  const [filterText, setFilterText] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const [applicationInfo, setApplicationInfo] = useState({});

  const handleSelectProcess = (process) => {
    setSelectedProcess(process);
  };

  const setup = async () => {
    await getServerInfo();
    await fetchProcesses();
  };

  const getServerInfo = async () => {
    if (inputRef.current == null) {
      return null;
    }
    const ip = inputRef.current.value;
    const base_url = `http://${ip}:3030`;
    const serverinfo_url = `${base_url}/serverinfo`;
    const response = await fetch(serverinfo_url);
    if (response.status == 200) {
      const data = await response.json();
      setServerMode(data.mode);
      setTargetOS(data.target_os);
      setServerArch(data.arch);
      setServerPid(data.pid);
      setServerGitHash(data.git_hash);
    } else {
    }
  };

  const fetchProcesses = async () => {
    if (inputRef.current == null) {
      return null;
    }
    const ip = inputRef.current.value;
    const base_url = `http://${ip}:3030`;
    const enumprocess_url = `${base_url}/enumprocess`;
    const response = await fetch(enumprocess_url);
    const data = await response.json();
    const sortedData = data.sort((a: any, b: any) => a.pid - b.pid);
    setIpAddress(ip);
    setProcesses(sortedData);
  };

  const openProcess = async () => {
    if (inputRef.current == null) {
      return null;
    }
    const ip = inputRef.current.value;
    const openProcessUrl = `http://${ip}:3030/openprocess`;
    const openProcessPayload = { pid: selectedProcess.pid };

    try {
      const response = await fetch(openProcessUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(openProcessPayload),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      setOpenedProcess(selectedProcess);
      await fetchApplicationInfo(ip, selectedProcess.pid); // Fetch Application Info after process is opened
      return true;
    } catch (error) {
      console.error("Error during fetching:", error);
      return false;
    }
  };

  const fetchApplicationInfo = async (ip, pid) => {
    const applicationInfoUrl = `http://${ip}:3030/getappinfo?pid=${pid}`;
    try {
      const response = await fetch(applicationInfoUrl);
      const data = await response.json();

      // Parse the 'info' field if it is a stringified JSON
      if (typeof data.info === "string") {
        const parsedInfo = JSON.parse(data.info);
        setApplicationInfo(parsedInfo); // Store the parsed info object
      } else {
        setApplicationInfo(data.info);
      }
    } catch (error) {
      console.error("Error fetching application info:", error);
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
