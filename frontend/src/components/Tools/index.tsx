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
import { TriStateCheckbox } from "@/components/common/Checkbox";
import { useState, useEffect, useRef } from "react";
import { useStore } from "@/lib/global-store";
import { dumpApp } from "@/lib/tools/ipa_dump";
import { dumpProcessMemory } from "@/lib/tools/memory_dump";

export function Tools() {
  const ipAddress = useStore((state) => state.ipAddress);
  const openProcessId = useStore((state) => state.openProcessId);
  const [progress, setProgress] = useState(0);
  const [resultMessage, setResultMessage] = useState("");
  const progressRef = useRef({ setProgress: setProgress });
  const targetOS = useStore((state) => state.targetOS);

  // Memory protection flags (0: don't care, 1: must not have, 2: must have)
  const [memoryProtection, setMemoryProtection] = useState({
    read: 2,
    write: 0,
    execute: 0,
  });

  useEffect(() => {
    progressRef.current.setProgress = setProgress;
  }, [progressRef.current.setProgress]);

  const ipaDump = async () => {
    setProgress(0);
    setResultMessage("");
    try {
      const result = await dumpApp(ipAddress, openProcessId, progressRef);
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
        setResultMessage("IPA dump completed successfully!");
      } else {
        setResultMessage("Failed to dump IPA. Please try again.");
      }
    } catch (error) {
      setResultMessage(`Error occurred: ${error.message}`);
    }
  };

  const memoryDump = async () => {
    setProgress(0);
    setResultMessage("");
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
        progressRef
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
        setResultMessage("Memory dump completed successfully!");
      } else {
        setResultMessage("Failed to dump memory. Please try again.");
      }
    } catch (error) {
      setResultMessage(`Error occurred: ${error.message}`);
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
              {progress > 0 && (
                <div className="w-full bg-gray-200 rounded-full h-2.5 mb-4 dark:bg-gray-700">
                  <div
                    className="bg-blue-600 h-2.5 rounded-full"
                    style={{ width: `${progress}%` }}
                  ></div>
                </div>
              )}
              {resultMessage && (
                <div
                  className={`mt-4 p-2 rounded ${
                    resultMessage.includes("Failed") ||
                    resultMessage.includes("Error")
                      ? "bg-red-100 text-red-700"
                      : "bg-green-100 text-green-700"
                  }`}
                >
                  {resultMessage}
                </div>
              )}
            </CardContent>
            <CardFooter>
              <Button
                className="w-full"
                onClick={ipaDump}
                disabled={progress > 0 && progress < 100}
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
              {progress > 0 && (
                <div className="w-full bg-gray-200 rounded-full h-2.5 mb-4 dark:bg-gray-700">
                  <div
                    className="bg-blue-600 h-2.5 rounded-full"
                    style={{ width: `${progress}%` }}
                  ></div>
                </div>
              )}
              {resultMessage && (
                <div
                  className={`mt-4 p-2 rounded ${
                    resultMessage.includes("Failed") ||
                    resultMessage.includes("Error")
                      ? "bg-red-100 text-red-700"
                      : "bg-green-100 text-green-700"
                  }`}
                >
                  {resultMessage}
                </div>
              )}
            </div>
          </CardContent>
          <CardFooter>
            <Button
              className="w-full"
              onClick={memoryDump}
              disabled={progress > 0 && progress < 100}
            >
              Dump Memory
            </Button>
          </CardFooter>
        </Card>
      </main>
    </div>
  );
}
