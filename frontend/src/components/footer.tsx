import { TwitterIcon, FacebookIcon, InstagramIcon } from "./icon";

export function Footer() {
  return (
    <footer className="flex flex-col gap-2 sm:flex-row py-6 w-full shrink-0 items-center px-4 md:px-6 border-t">
      <div className="flex items-center gap-4">
        <TwitterIcon className="h-6 w-6" />
        <FacebookIcon className="h-6 w-6" />
        <InstagramIcon className="h-6 w-6" />
      </div>
      <p className="text-xs text-gray-500 dark:text-gray-400 sm:ml-auto">
        © 2024 DoranekoSystems
      </p>
    </footer>
  );
}
