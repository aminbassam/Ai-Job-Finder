import { RouterProvider } from "react-router";
import { router } from "./routes";
import { Toaster } from "./components/ui/sonner";
import { AuthProvider } from "./contexts/AuthContext";

export default function App() {
  return (
    <AuthProvider>
      <div className="dark">
        <RouterProvider router={router} />
        <Toaster />
      </div>
    </AuthProvider>
  );
}
