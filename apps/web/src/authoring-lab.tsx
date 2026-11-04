import React from "react";
import { createRoot } from "react-dom/client";
import { AuthoringLab } from "./features/playbook/authoring/ui/AuthoringLab";

// A separate local development entry, not an alternate production render path.
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <AuthoringLab initialExampleId={new URLSearchParams(location.search).get("example") ?? undefined} />
  </React.StrictMode>,
);
