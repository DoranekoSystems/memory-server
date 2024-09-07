"use client";
import Link from "next/link";
import { useState } from "react";
import { Component } from "@/components/component";
import { TopPage } from "@/components/toppage";
import { Setting } from "@/components/setting";
import { MemoryView } from "@/components/memoryview";
import { Header } from "@/components/header";
import { Footer } from "@/components/footer";
import { Scanner } from "@/components/scanner";
import { Information } from "@/components/information";
import { Bookmark } from "@/components/bookmark";
import { FileView } from "@/components/fileexplorer";

export default function Home() {
  const [currentPage, setCurrentPage] = useState("toppage");
  const [ipAddress, setIpAddress] = useState("");
  const [openProcessId, setopenProcessId] = useState("");

  return (
    <div className="flex flex-col min-h-screen">
      <Header changePage={setCurrentPage}></Header>
      <div style={{ display: currentPage == "toppage" ? "block" : "none" }}>
        <TopPage changePage={setCurrentPage} />
      </div>
      <div style={{ display: currentPage == "setting" ? "block" : "none" }}>
        <Setting currentPage={currentPage} />
      </div>
      <div style={{ display: currentPage == "scanner" ? "block" : "none" }}>
        <Scanner currentPage={currentPage} />
      </div>
      <div style={{ display: currentPage == "bookmark" ? "block" : "none" }}>
        <Bookmark currentPage={currentPage} />
      </div>
      <div style={{ display: currentPage == "memoryview" ? "block" : "none" }}>
        <MemoryView currentPage={currentPage} />
      </div>
      <div style={{ display: currentPage == "information" ? "block" : "none" }}>
        <Information currentPage={currentPage} />
      </div>
      <div
        style={{ display: currentPage == "fileexplorer" ? "block" : "none" }}
      >
        <FileView currentPage={currentPage} />
      </div>
      <Footer></Footer>
    </div>
  );
}
