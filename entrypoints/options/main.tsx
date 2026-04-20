import React from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";

function App() {
  return (
    <main className="app">
      <h1>Twitch Improved</h1>
      <p>Options UI scaffold is ready for Milestone N.</p>
    </main>
  );
}

const container = document.getElementById("root");
if (!container) {
  throw new Error("Options root element was not found.");
}

createRoot(container).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
