import React from "react";
import { createRoot } from "react-dom/client";
import Cadence from "./App.jsx";
import "./index.css";

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <Cadence />
  </React.StrictMode>
);
