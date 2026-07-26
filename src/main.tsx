import React from "react";
import ReactDOM from "react-dom/client";
import { RouterProvider, createRouter } from "@tanstack/react-router";

import "./style.css";
import "soda-material/dist/style.css";

import { routeTree } from "./routeTree.gen";
import { AvdContext, SdkContext, ToolsContext } from "./machines";

const router = createRouter({ routeTree });

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <SdkContext.Provider>
      <ToolsContext.Provider>
        <AvdContext.Provider>
          <RouterProvider router={router} />
        </AvdContext.Provider>
      </ToolsContext.Provider>
    </SdkContext.Provider>
  </React.StrictMode>
);
