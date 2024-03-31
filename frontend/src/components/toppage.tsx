import Link from "next/link";
import {CloudIcon,CodeIcon,LockIcon} from "./icon"

export function TopPage() {
  return (
    <main className="flex-1">
      <section className="w-full pt-12 md:pt-24 lg:pt-32">
        <div className="px-4 md:px-6 space-y-10 xl:space-y-16">
          <div className="grid max-w-[1300px] mx-auto gap-4 px-4 sm:px-6 md:px-10 md:grid-cols-2 md:gap-16">
            <div>
              <h1 className="lg:leading-tighter text-3xl font-bold tracking-tighter sm:text-4xl md:text-5xl xl:text-[3.4rem] 2xl:text-[3.75rem]">
                High-Speed Memory Scanner & Analyzer with REST API.
              </h1>
              <p className="mx-auto max-w-[700px] text-gray-500 md:text-xl dark:text-gray-400">
                Advanced yet User-Friendly Memory Analysis Engine and Debugger
                for Security Diagnostics: A Convenient Tool for Research in
                Cybersecurity.
              </p>
              <div className="space-x-4">
                <Link
                  className="inline-flex h-9 items-center justify-center rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-gray-50 shadow transition-colors hover:bg-gray-900/90 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-gray-950 disabled:pointer-events-none disabled:opacity-50 dark:bg-gray-50 dark:text-gray-900 dark:hover:bg-gray-50/90 dark:focus-visible:ring-gray-300"
                  href="#"
                >
                  Get Started
                </Link>
              </div>
            </div>
            <div>
              <img
                alt="Hero"
                className="mx-auto aspect-[1/1] overflow-hidden rounded-xl object-cover"
                height="500"
                src="/top-img.png"
                width="700"
              />
            </div>
          </div>
        </div>
      </section>
      <section className="w-full py-12 md:py-24 lg:py-32">
        <div className="px-4 md:px-6 space-y-10 xl:space-y-16">
          <div className="flex flex-col items-center justify-center space-y-4 text-center">
            <div className="space-y-2">
              <h2 className="text-3xl font-bold tracking-tighter sm:text-5xl">
                Features
              </h2>
              <p className="max-w-[900px] text-gray-500 md:text-xl/relaxed lg:text-base/relaxed xl:text-xl/relaxed dark:text-gray-400">
                Cross-Platform Compatible. Supported OS: Windows, Linux, Mac,
                Android, iOS.
              </p>
            </div>
          </div>
          <div className="mx-auto grid items-start gap-8 sm:max-w-4xl sm:grid-cols-2 md:gap-12 lg:max-w-5xl lg:grid-cols-3">
            <div className="grid gap-1">
              <CloudIcon className="h-6 w-6" />
              <h3 className="text-lg font-bold">Memory Analysis</h3>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Featuring Advanced Implementation of Memory Read/Write/Search
                Functions.
              </p>
            </div>
            <div className="grid gap-1">
              <CodeIcon className="h-6 w-6" />
              <h3 className="text-lg font-bold">Debugger</h3>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Currently not implemented. Support will be provided in the
                future.
              </p>
            </div>
            <div className="grid gap-1">
              <LockIcon className="h-6 w-6" />
              <h3 className="text-lg font-bold">No Root Privileges Required</h3>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Operable on non-rooted Android device and non-jailbroken iOS
                device.
              </p>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
