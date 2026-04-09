import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import "./Index.css";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
// Add this script to your HTML file
window.addEventListener('scroll', function() {
  if (window.scrollY > 50) {
    document.body.classList.add('scrolled');
  } else {
    document.body.classList.remove('scrolled');
  }
});