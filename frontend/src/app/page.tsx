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

export default function Home() {
  const [currentPage, setCurrentPage] = useState("toppage");
  const [ipAddress, setIpAddress] = useState("");
  const [openProcessId, setopenProcessId] = useState("");

  return (
    <div className="flex flex-col min-h-screen">
      <Header changePage={setCurrentPage}></Header>
      <div style={{ display: currentPage == "toppage" ? "block" : "none" }}>
        <TopPage />
      </div>
      <div style={{ display: currentPage == "setting" ? "block" : "none" }}>
        <Setting ipAddress={ipAddress} setIpAddress={setIpAddress} />
      </div>
      <div style={{ display: currentPage == "scanner" ? "block" : "none" }}>
        <Scanner ipAddress={ipAddress} setIpAddress={setIpAddress} />
      </div>
      <div style={{ display: currentPage == "memoryview" ? "block" : "none" }}>
        <MemoryView ipAddress={ipAddress} setIpAddress={setIpAddress} />
      </div>
      <Footer></Footer>
    </div>
  );
}
