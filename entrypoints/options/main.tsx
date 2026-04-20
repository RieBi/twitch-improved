import React from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";

function App() {
  return (
    <main className="app">
      <header className="app-header">
        <h1>Twitch Improved</h1>
        <p className="app-subtitle">Milestone 1 options shell</p>
      </header>

      <section className="panel" aria-labelledby="declutter-heading">
        <h2 id="declutter-heading">Declutter</h2>
        <p className="panel-description">
          Configure what recommendation blocks should be hidden on Twitch pages.
        </p>
        <ul className="placeholder-list">
          <li>Main feed toggles</li>
          <li>Channel page toggles</li>
          <li>Sidebar toggles</li>
        </ul>
      </section>

      <section className="panel" aria-labelledby="heatmap-heading">
        <h2 id="heatmap-heading">Watch heatmap</h2>
        <p className="panel-description">
          Configure watched thresholds, indicator style, and tracking behavior.
        </p>
        <ul className="placeholder-list">
          <li>Enable and threshold controls</li>
          <li>Tile and player-bar display controls</li>
          <li>Live tracking behavior controls</li>
        </ul>
      </section>

      <section className="panel" aria-labelledby="data-heading">
        <h2 id="data-heading">Data</h2>
        <p className="panel-description">
          Manage local storage and diagnostic information.
        </p>
        <ul className="placeholder-list">
          <li>Storage usage</li>
          <li>Clear all, export, import</li>
          <li>Selector diagnostics</li>
        </ul>
      </section>
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
