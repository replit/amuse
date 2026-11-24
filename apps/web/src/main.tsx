import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Router } from "wouter";
import App from "./App";
import { AppMotion } from "./components/Motion";
import "@fontsource-variable/inter";
import "./index.css";

const qc = new QueryClient({ defaultOptions: { queries: { refetchOnWindowFocus: true, staleTime: 30000, placeholderData: (prev: unknown) => prev } } });
const base = import.meta.env.BASE_URL.replace(/\/$/, "");

createRoot(document.getElementById("root")!).render(
  <QueryClientProvider client={qc}>
    <Router base={base}>
      <AppMotion>
        <App />
      </AppMotion>
    </Router>
  </QueryClientProvider>,
);
