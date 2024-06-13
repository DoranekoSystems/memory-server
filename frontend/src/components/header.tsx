import Link from "next/link";
import { MountainIcon } from "./icon";
import { useState } from "react";

export function Header({ changePage }): any {
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  const toggleMenu = () => {
    setIsMenuOpen(!isMenuOpen);
  };

  return (
    <header className="px-4 lg:px-6 h-16 flex items-center">
      <title>MemoryServer</title>
      <button
        className="flex items-center justify-center"
        onClick={() => changePage("toppage")}
      >
        <img className="h-6 w-6" src="./swallow-icon.png"></img>
        <h3 className="text-lg font-bold">MemoryServer</h3>
        <span className="sr-only">DoranekoSystems</span>
      </button>
      <nav className="ml-auto hidden sm:flex gap-4 sm:gap-6">
        <button
          className="text-sm font-medium hover:underline underline-offset-4"
          onClick={() => changePage("setting")}
        >
          Setting
        </button>
        <button
          className="text-sm font-medium hover:underline underline-offset-4"
          onClick={() => changePage("scanner")}
        >
          Scanner
        </button>
        <button
          className="text-sm font-medium hover:underline underline-offset-4"
          onClick={() => changePage("memoryview")}
        >
          MemoryView
        </button>
      </nav>
      <button
        className="ml-auto sm:hidden focus:outline-none"
        onClick={toggleMenu}
      >
        <svg
          className="h-6 w-6 fill-current"
          viewBox="0 0 24 24"
          xmlns="http://www.w3.org/2000/svg"
        >
          {isMenuOpen ? (
            <path
              fillRule="evenodd"
              clipRule="evenodd"
              d="M4 6h16v2H4V6zm0 5h16v2H4v-2zm0 5h16v2H4v-2z"
            />
          ) : (
            <path
              fillRule="evenodd"
              clipRule="evenodd"
              d="M4 6h16v2H4V6zm0 5h16v2H4v-2zm0 5h16v2H4v-2z"
            />
          )}
        </svg>
      </button>
      {isMenuOpen && (
        <div className="absolute top-16 right-0 mt-2 w-48 bg-white rounded-md shadow-lg py-2 z-10">
          <button
            className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
            onClick={() => {
              changePage("setting");
              toggleMenu();
            }}
          >
            Setting
          </button>
          <button
            className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
            onClick={() => {
              changePage("scanner");
              toggleMenu();
            }}
          >
            Scanner
          </button>
          <button
            className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
            onClick={() => {
              changePage("memoryview");
              toggleMenu();
            }}
          >
            MemoryView
          </button>
        </div>
      )}
    </header>
  );
}
