"use client";
import { useState } from "react";
import { TopPage } from "@/components/TopPage";
import { Setting } from "@/components/Setting";
import { Scanner } from "@/components/Scanner";
import { Bookmark } from "@/components/Bookmark";
import { MemoryView } from "@/components/MemoryView";
import { Debugger } from "@/components/Debugger";
import { Information } from "@/components/Information";
import { FileView } from "@/components/FileExplorer";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";

export default function Home() {
  const [currentPage, setCurrentPage] = useState("toppage");

  const pageComponents = {
    toppage: TopPage,
    setting: Setting,
    scanner: Scanner,
    bookmark: Bookmark,
    memoryview: MemoryView,
    debugger: Debugger,
    information: Information,
    fileexplorer: FileView,
  };

  return (
    <div className="flex flex-col min-h-screen">
      <Header changePage={setCurrentPage} />
      <main className="flex-grow">
        {Object.entries(pageComponents).map(([key, Component]) => (
          <div
            key={key}
            style={{ display: currentPage === key ? "block" : "none" }}
          >
            <Component currentPage={currentPage} changePage={setCurrentPage} />
          </div>
        ))}
      </main>
      <Footer />
    </div>
  );
}
