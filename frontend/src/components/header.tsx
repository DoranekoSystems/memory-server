import Link from "next/link";
import { MountainIcon } from "./icon";

export function Header({ changePage }): any {
  return (
    <header className="px-4 lg:px-6 h-16 flex items-center">
      <title>Tsubame</title>
      <button
        className="flex items-center justify-center"
        onClick={() => changePage("toppage")}
      >
        <img className="h-6 w-6" src="./swallow-icon.png"></img>
        <h3 className="text-lg font-bold">Tsubame</h3>
        <span className="sr-only">DoranekoSystems</span>
      </button>
      <nav className="ml-auto flex gap-4 sm:gap-6">
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
      </nav>
    </header>
  );
}
