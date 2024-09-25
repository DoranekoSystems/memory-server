import React from "react";

export const Tabs = ({ children, value, onChange }) => {
  return <div className="tabs">{children}</div>;
};

export const TabsList = ({ children }) => {
  return <div className="tabs-list">{children}</div>;
};

export const TabsTrigger = ({ children, value, onClick }) => {
  return (
    <button className="tabs-trigger" onClick={() => onClick(value)}>
      {children}
    </button>
  );
};

export const TabsContent = ({ children, value, activeValue }) => {
  if (value !== activeValue) return null;
  return <div className="tabs-content">{children}</div>;
};
