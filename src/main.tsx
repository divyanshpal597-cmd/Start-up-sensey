import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import "leaflet/dist/leaflet.css";
import "./index.css";
import Layout from "./components/Layout";
import { CurrentIdeaProvider } from "./context/CurrentIdea";
import Dashboard from "./pages/Dashboard";
import NewIdea from "./pages/NewIdea";
import Analyzing from "./pages/Analyzing";
import MyIdeas from "./pages/MyIdeas";
import OpenIdea from "./pages/OpenIdea";
import Market from "./pages/Market";
import Customers from "./pages/Customers";
import Financial from "./pages/Financial";
import Suppliers from "./pages/Suppliers";
import Competitors from "./pages/Competitors";
import WhatIf from "./pages/WhatIf";
import StressTest from "./pages/StressTest";
import Pivots from "./pages/Pivots";
import Reports from "./pages/Reports";
import SettingsPage from "./pages/Settings";
import SharedReport from "./pages/SharedReport";
import NotFound from "./pages/NotFound";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/share/:token" element={<SharedReport />} />
        <Route
          element={
            <CurrentIdeaProvider>
              <Layout />
            </CurrentIdeaProvider>
          }
        >
          <Route index element={<Dashboard />} />
          <Route path="new" element={<NewIdea />} />
          <Route path="analyzing/:ideaId" element={<Analyzing />} />
          <Route path="ideas" element={<MyIdeas />} />
          <Route path="ideas/:ideaId" element={<OpenIdea />} />
          <Route path="market" element={<Market />} />
          <Route path="customers" element={<Customers />} />
          <Route path="financial" element={<Financial />} />
          <Route path="suppliers" element={<Suppliers />} />
          <Route path="competitors" element={<Competitors />} />
          <Route path="what-if" element={<WhatIf />} />
          <Route path="stress-test" element={<StressTest />} />
          <Route path="pivots" element={<Pivots />} />
          <Route path="reports" element={<Reports />} />
          <Route path="settings" element={<SettingsPage />} />
          <Route path="*" element={<NotFound />} />
        </Route>
      </Routes>
    </BrowserRouter>
  </StrictMode>
);
