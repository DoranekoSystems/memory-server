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
import { dumpApp } from "@/lib/tools/ipa_dump";

export function Tools() {
  const ipAddress = useStore((state) => state.ipAddress);
  const openProcessId = useStore((state) => state.openProcessId);
  const [progress, setProgress] = useState(0);
  const [resultMessage, setResultMessage] = useState("");
  const progressRef = useRef({ setProgress: setProgress });
  const targetOS = useStore((state) => state.targetOS);

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
        setResultMessage("IPA dump completed successfully!");
      } else {
        setResultMessage("Failed to dump IPA. Please try again.");
      }
    } catch (error) {
      setResultMessage(`Error occurred: ${error.message}`);
    }
  };

  return (
    <div className="flex flex-col min-h-screen">
      <main className="flex flex-col items-center flex-grow px-4 mt-8">
        {targetOS === "ios" ? (
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
        ) : null}
      </main>
    </div>
  );
}
