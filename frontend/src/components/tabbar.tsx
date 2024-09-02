import React, { useState, useEffect, useRef } from "react";

const TabBar = ({ tabs, activeTab, onAddTab, onSwitchTab, onCloseTab }) => {
  const [showScrollButtons, setShowScrollButtons] = useState(false);
  const tabsRef = useRef(null);
  const containerRef = useRef(null);

  useEffect(() => {
    const checkScroll = () => {
      if (tabsRef.current && containerRef.current) {
        setShowScrollButtons(
          tabsRef.current.scrollWidth > containerRef.current.clientWidth
        );
      }
    };

    checkScroll();
    window.addEventListener("resize", checkScroll);
    return () => window.removeEventListener("resize", checkScroll);
  }, [tabs]);

  const scroll = (direction) => {
    if (tabsRef.current) {
      const scrollAmount = direction === "left" ? -200 : 200;
      tabsRef.current.scrollBy({ left: scrollAmount, behavior: "smooth" });
    }
  };

  const handleCloseTab = (e, tabId) => {
    e.stopPropagation();
    if (tabs.length > 1) {
      onCloseTab(tabId);
    }
  };

  return (
    <div
      ref={containerRef}
      className="relative w-full bg-[#dee1e6] dark:bg-gray-800 mb-[5px]"
    >
      <div className="flex items-end">
        {showScrollButtons && (
          <button
            className="flex-shrink-0 p-2 text-gray-600 dark:text-gray-400 hover:bg-gray-300 dark:hover:bg-gray-700 focus:outline-none"
            onClick={() => scroll("left")}
          >
            ◀
          </button>
        )}
        <div
          ref={tabsRef}
          className="flex overflow-x-auto scrollbar-hide flex-grow"
          style={{ scrollBehavior: "smooth" }}
        >
          {tabs.map((tab, index) => (
            <div
              key={tab.id}
              className={`group relative flex-shrink-0 flex items-center h-9 px-3 mr-1 rounded-t-lg cursor-pointer transition-all duration-200 ease-in-out ${
                activeTab === tab.id
                  ? "bg-white dark:bg-gray-700 text-gray-800 dark:text-white"
                  : "bg-[#f1f3f4] dark:bg-gray-600 text-gray-600 dark:text-gray-300 hover:bg-[#e8eaed] dark:hover:bg-gray-500"
              }`}
              style={{
                minWidth: "28px",
                maxWidth: "240px",
              }}
              onClick={() => onSwitchTab(tab.id)}
            >
              <span className="text-sm font-medium truncate flex-grow">
                {tab.label}
              </span>
              {tabs.length > 1 && (
                <button
                  className={`ml-2 w-4 h-4 rounded-full flex items-center justify-center ${
                    activeTab === tab.id
                      ? "text-gray-500 hover:text-gray-700 hover:bg-gray-200"
                      : "text-gray-400 hover:text-gray-600 hover:bg-gray-300"
                  } opacity-0 group-hover:opacity-100 transition-opacity focus:outline-none`}
                  onClick={(e) => handleCloseTab(e, tab.id)}
                >
                  ×
                </button>
              )}
              {index < tabs.length - 1 && (
                <div className="absolute right-0 top-1/4 bottom-1/4 w-px bg-gray-300 dark:bg-gray-600"></div>
              )}
            </div>
          ))}
        </div>
        {showScrollButtons && (
          <button
            className="flex-shrink-0 p-2 text-gray-600 dark:text-gray-400 hover:bg-gray-300 dark:hover:bg-gray-700 focus:outline-none"
            onClick={() => scroll("right")}
          >
            ▶
          </button>
        )}
        <button
          className="flex-shrink-0 w-9 h-9 flex items-center justify-center text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700 focus:outline-none rounded-t-lg"
          onClick={onAddTab}
        >
          +
        </button>
      </div>
    </div>
  );
};

export default TabBar;
