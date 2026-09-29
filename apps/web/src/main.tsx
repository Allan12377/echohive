import React from "react";
import { createRoot } from "react-dom/client";
import "./echohive/styles/main.scss";
import App from "./echohive/App";

const root = document.getElementById("root");

if (!root) {
  throw new Error("Root element was not found");
}

createRoot(root).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
