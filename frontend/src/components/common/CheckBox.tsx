import * as React from "react";
import { cn } from "@/lib/utils";
import { useState, useEffect } from "react";
import { Label } from "./Label";

const NormalCheckbox = ({ id, label, value, onStateChange }) => {
  const [internalState, setInternalState] = useState(value);

  useEffect(() => {
    setInternalState(value);
  }, [value]);

  const handleClick = () => {
    const newState = internalState === 0 ? 1 : 0;
    setInternalState(newState);
    onStateChange(newState);
  };

  return (
    <div className="flex items-center space-x-2">
      <div
        className={`w-4 h-4 border border-gray-300 rounded-sm cursor-pointer ${
          internalState === 1 ? "bg-blue-500" : ""
        }`}
        onClick={handleClick}
      />
      <Label htmlFor={id}>{label}</Label>
    </div>
  );
};

const TriStateCheckbox = ({ id, label, value, onStateChange }) => {
  const [state, setState] = useState(value);

  useEffect(() => {
    setState(value);
  }, [value]);

  const handleClick = () => {
    const newState = (state + 1) % 3;
    setState(newState);
    onStateChange(newState);
  };

  return (
    <div className="flex items-center space-x-2">
      <div
        className={`w-4 h-4 border border-gray-300 rounded-sm cursor-pointer ${
          state === 1 ? "bg-gray-300" : state === 2 ? "bg-blue-500" : ""
        }`}
        onClick={handleClick}
      />
      <Label htmlFor={id}>{label}</Label>
    </div>
  );
};
export { NormalCheckbox, TriStateCheckbox };
