import {
  CardTitle,
  CardDescription,
  CardHeader,
  CardContent,
  CardFooter,
  Card,
} from "@/components/common/Card";
import { Label } from "@/components/common/Label";
import { Button } from "@/components/common/Button";
import { TriStateCheckbox } from "@/components/common/CheckBox";
import { useState, useEffect, useRef } from "react";
import { useStore } from "@/lib/global-store";
import { dumpApp } from "@/lib/tools/ipa_dump";
import { dumpProcessMemory } from "@/lib/tools/memory_dump";
import { generatePointerMap } from "@/lib/tools/pointermap";

export function Tools() {
  const ipAddress = useStore((state) => state.ipAddress);
  const openProcessId = useStore((state) => state.openProcessId);
  const targetOS = useStore((state) => state.targetOS);

  // Separate states for each feature
  const [ipaProgress, setIpaProgress] = useState(0);
  const [ipaMessage, setIpaMessage] = useState("");
  const [memoryProgress, setMemoryProgress] = useState(0);
  const [memoryMessage, setMemoryMessage] = useState("");
  const [pointerMapMessage, setPointerMapMessage] = useState("");
  const [isPointerMapGenerating, setIsPointerMapGenerating] = useState(false);

  // Progress refs
  const ipaProgressRef = useRef({ setProgress: setIpaProgress });
  const memoryProgressRef = useRef({ setProgress: setMemoryProgress });

  const [pointerMapFormData, setPointerMapFormData] = useState({
    address: "",
  });

  const [memoryProtection, setMemoryProtection] = useState({
    read: 2,
    write: 0,
    execute: 0,
  });

  useEffect(() => {
    ipaProgressRef.current.setProgress = setIpaProgress;
  }, []);

  useEffect(() => {
    memoryProgressRef.current.setProgress = setMemoryProgress;
  }, []);

  const generatePointermap = async () => {
    setPointerMapMessage("");
    setIsPointerMapGenerating(true);

    if (!pointerMapFormData.address) {
      setPointerMapMessage("Please enter a valid address");
      setIsPointerMapGenerating(false);
      return;
    }

    try {
      const address = parseInt(pointerMapFormData.address, 16);
      if (isNaN(address)) {
        setPointerMapMessage("Invalid address format");
        setIsPointerMapGenerating(false);
        return;
      }

      const result = await generatePointerMap(ipAddress, address);

      if (result.success && result.data) {
        // scandata
        const url = window.URL.createObjectURL(result.data);
        const link = document.createElement("a");
        link.href = url;
        const fileName = `pointermap_${address.toString(16)}.scandata`;
        link.setAttribute("download", fileName);
        document.body.appendChild(link);
        link.click();
        link.parentNode.removeChild(link);
        window.URL.revokeObjectURL(url);

        // addresslist
        const addresslistContent = `${address
          .toString(16)
          .padStart(8, "0")}=No description`;
        const addresslistBlob = new Blob([addresslistContent], {
          type: "text/plain",
        });
        const addressUrl = window.URL.createObjectURL(addresslistBlob);
        const addressLink = document.createElement("a");
        addressLink.href = addressUrl;
        const addressFileName = `pointermap_${address.toString(
          16
        )}.addresslist`;
        addressLink.setAttribute("download", addressFileName);
        document.body.appendChild(addressLink);
        addressLink.click();
        addressLink.parentNode?.removeChild(addressLink);
        window.URL.revokeObjectURL(addressUrl);

        setPointerMapMessage("Pointer map generated successfully!");
      } else {
        setPointerMapMessage(`Failed to generate pointer map: ${result.error}`);
      }
    } catch (error) {
      setPointerMapMessage(
        `Error occurred: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    } finally {
      setIsPointerMapGenerating(false);
    }
  };

  const ipaDump = async () => {
    setIpaProgress(0);
    setIpaMessage("");
    try {
      const result = await dumpApp(ipAddress, openProcessId, ipaProgressRef);
      if (result.success) {
        const url = window.URL.createObjectURL(result.ipaBlob);
        const link = document.createElement("a");
        link.href = url;
        let ipaFileName = result.appName.replace(/\.app$/, ".ipa");
        link.setAttribute("download", ipaFileName);
        document.body.appendChild(link);
        link.click();
        link.parentNode.removeChild(link);
        window.URL.revokeObjectURL(url);
        setIpaMessage("IPA dump completed successfully!");
      } else {
        setIpaMessage("Failed to dump IPA. Please try again.");
      }
    } catch (error) {
      setIpaMessage(`Error occurred: ${error.message}`);
    }
  };

  const memoryDump = async () => {
    setMemoryProgress(0);
    setMemoryMessage("");
    try {
      const protection = {
        r: memoryProtection.read,
        w: memoryProtection.write,
        x: memoryProtection.execute,
      };

      const result = await dumpProcessMemory(
        ipAddress,
        openProcessId,
        protection,
        memoryProgressRef
      );

      if (result.success && result.dumpBlob) {
        const url = window.URL.createObjectURL(result.dumpBlob);
        const link = document.createElement("a");
        link.href = url;
        const fileName = `memory_dump_${openProcessId}.zip`;
        link.setAttribute("download", fileName);
        document.body.appendChild(link);
        link.click();
        link.parentNode.removeChild(link);
        window.URL.revokeObjectURL(url);
        setMemoryMessage("Memory dump completed successfully!");
      } else {
        setMemoryMessage("Failed to dump memory. Please try again.");
      }
    } catch (error) {
      setMemoryMessage(`Error occurred: ${error.message}`);
    }
  };

  const renderProtectionDescription = () => {
    const descriptions = [];
    if (memoryProtection.read === 0) descriptions.push("non-readable");
    if (memoryProtection.read === 2) descriptions.push("readable");
    if (memoryProtection.write === 0) descriptions.push("non-writable");
    if (memoryProtection.write === 2) descriptions.push("writable");
    if (memoryProtection.execute === 0) descriptions.push("non-executable");
    if (memoryProtection.execute === 2) descriptions.push("executable");

    if (descriptions.length === 0) {
      return "Matching all memory regions (no filters)";
    }
    return `Selected: ${descriptions.join(", ")} regions`;
  };

  return (
    <div className="flex flex-col min-h-screen">
      <main className="flex flex-col items-center flex-grow px-4 mt-8">
        {targetOS === "ios" && (
          <Card className="w-full max-w-md mb-6">
            <CardHeader>
              <CardTitle className="text-2xl">IPA Dump</CardTitle>
              <CardDescription>
                Dump the IPA after decrypting the binary from memory.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {ipaProgress > 0 && (
                <div className="w-full bg-gray-200 rounded-full h-2.5 mb-4 dark:bg-gray-700">
                  <div
                    className="bg-blue-600 h-2.5 rounded-full"
                    style={{ width: `${ipaProgress}%` }}
                  ></div>
                </div>
              )}
              {ipaMessage && (
                <div
                  className={`mt-4 p-2 rounded ${
                    ipaMessage.includes("Failed") ||
                    ipaMessage.includes("Error")
                      ? "bg-red-100 text-red-700"
                      : "bg-green-100 text-green-700"
                  }`}
                >
                  {ipaMessage}
                </div>
              )}
            </CardContent>
            <CardFooter>
              <Button
                className="w-full"
                onClick={ipaDump}
                disabled={ipaProgress > 0 && ipaProgress < 100}
              >
                Dump
              </Button>
            </CardFooter>
          </Card>
        )}

        <Card className="w-full max-w-md mb-6">
          <CardHeader>
            <CardTitle className="text-2xl">Memory Dump</CardTitle>
            <CardDescription>
              Dump memory regions with specified protection flags.
              <ul className="mt-2 text-sm">
                <li>• White: must not have permission</li>
                <li>• Gray: any permission (don't care)</li>
                <li>• Blue: must have permission</li>
              </ul>
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col space-y-4">
              <div className="flex flex-col space-y-2">
                <Label>Memory Protection Flags</Label>
                <div className="flex space-x-4">
                  <TriStateCheckbox
                    id="read"
                    label="Read (r)"
                    value={memoryProtection.read}
                    onStateChange={(state) =>
                      setMemoryProtection({
                        ...memoryProtection,
                        read: state,
                      })
                    }
                  />
                  <TriStateCheckbox
                    id="write"
                    label="Write (w)"
                    value={memoryProtection.write}
                    onStateChange={(state) =>
                      setMemoryProtection({
                        ...memoryProtection,
                        write: state,
                      })
                    }
                  />
                  <TriStateCheckbox
                    id="execute"
                    label="Execute (x)"
                    value={memoryProtection.execute}
                    onStateChange={(state) =>
                      setMemoryProtection({
                        ...memoryProtection,
                        execute: state,
                      })
                    }
                  />
                </div>
                <div className="text-sm text-gray-600 mt-2">
                  {renderProtectionDescription()}
                </div>
              </div>
              {memoryProgress > 0 && (
                <div className="w-full bg-gray-200 rounded-full h-2.5 mb-4 dark:bg-gray-700">
                  <div
                    className="bg-blue-600 h-2.5 rounded-full"
                    style={{ width: `${memoryProgress}%` }}
                  ></div>
                </div>
              )}
              {memoryMessage && (
                <div
                  className={`mt-4 p-2 rounded ${
                    memoryMessage.includes("Failed") ||
                    memoryMessage.includes("Error")
                      ? "bg-red-100 text-red-700"
                      : "bg-green-100 text-green-700"
                  }`}
                >
                  {memoryMessage}
                </div>
              )}
            </div>
          </CardContent>
          <CardFooter>
            <Button
              className="w-full"
              onClick={memoryDump}
              disabled={memoryProgress > 0 && memoryProgress < 100}
            >
              Dump Memory
            </Button>
          </CardFooter>
        </Card>

        <Card className="w-full max-w-md mb-6">
          <CardHeader>
            <CardTitle className="text-2xl">Pointer Map Generator</CardTitle>
            <CardDescription>
              Generate a pointer map for the specified memory address.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col space-y-4">
              <div className="flex flex-col space-y-2">
                <Label>Target Address (hex)</Label>
                <input
                  type="text"
                  className="px-3 py-2 border rounded-md dark:bg-gray-800"
                  placeholder="Enter address (e.g., 0x12345678)"
                  value={pointerMapFormData.address}
                  onChange={(e) =>
                    setPointerMapFormData({
                      ...pointerMapFormData,
                      address: e.target.value,
                    })
                  }
                />
              </div>

              {isPointerMapGenerating && (
                <div className="flex items-center justify-center p-4">
                  <svg
                    className="animate-spin h-6 w-6 text-blue-500"
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    ></circle>
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    ></path>
                  </svg>
                  <span className="ml-2 text-sm text-gray-600">
                    Generating pointer map...
                  </span>
                </div>
              )}

              {pointerMapMessage && (
                <div
                  className={`mt-4 p-2 rounded ${
                    pointerMapMessage.includes("Failed") ||
                    pointerMapMessage.includes("Error")
                      ? "bg-red-100 text-red-700"
                      : "bg-green-100 text-green-700"
                  }`}
                >
                  {pointerMapMessage}
                </div>
              )}
            </div>
          </CardContent>
          <CardFooter>
            <Button
              className="w-full"
              onClick={generatePointermap}
              disabled={isPointerMapGenerating}
            >
              {isPointerMapGenerating
                ? "Generating..."
                : "Generate Pointer Map"}
            </Button>
          </CardFooter>
        </Card>
      </main>
    </div>
  );
}
