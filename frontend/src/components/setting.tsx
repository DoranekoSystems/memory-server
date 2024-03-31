/**
 * v0 by Vercel.
 * @see https://v0.dev/t/3oqnA0crNp4
 * Documentation: https://v0.dev/docs#integrating-generated-code-into-your-nextjs-app
 */
import {
  CardTitle,
  CardDescription,
  CardHeader,
  CardContent,
  CardFooter,
  Card,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useState, useEffect, useRef } from "react";
import { Bold } from "lucide-react";
import { useStore } from "./global-store";

export function Setting() {
  const [openedProcess, setOpenedProcess] = useState(null);
  const ipAddress = useStore((state) => state.ipAddress);
  const setIpAddress = useStore((state) => state.setIpAddress);

  const [processes, setProcesses] = useState([]);
  const [selectedProcess, setSelectedProcess] = useState(null);
  const [filterText, setFilterText] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const handleSelectProcess = (process) => {
    setSelectedProcess(process);
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
      return true;
    } catch (error) {
      console.error("Error during fetching:", error);
      return false;
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
                placeholder={ipAddress}
                required
                type="text"
                ref={inputRef}
              />
            </div>
          </CardContent>
          <CardFooter>
            <Button className="w-full" onClick={fetchProcesses}>
              Connect
            </Button>
          </CardFooter>
        </Card>
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
                      selectedProcess?.pid === process.pid ? "bg-blue-100" : ""
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
        {openedProcess && (
          <Card className="w-full max-w-md">
            <CardHeader>
              <CardTitle className="text-2xl">Process Info</CardTitle>
            </CardHeader>
            <CardContent>
              <div>
                <Label>Process ID:</Label>
                <p>{openedProcess.pid}</p>
              </div>
              <div>
                <Label>Process Name:</Label>
                <p>{openedProcess.processname}</p>
              </div>
            </CardContent>
          </Card>
        )}
      </main>
    </div>
  );
}
