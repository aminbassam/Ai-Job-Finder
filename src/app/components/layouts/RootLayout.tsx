import { Outlet } from "react-router";
import { AppSidebar } from "./AppSidebar";

export function RootLayout() {
  return (
    <div className="flex h-screen bg-[#0B0F14]">
      <AppSidebar />
      <main className="flex-1 overflow-y-auto">
        <Outlet />
      </main>
    </div>
  );
}
