import dotenv from "dotenv";
import { resolve } from "path";

// Load backend/.env relative to the backend project directory so runtime
// launches do not depend on the shell's current working directory.
dotenv.config({ path: resolve(__dirname, "../../.env") });
