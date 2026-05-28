import app from "./app";
import { env } from "./config";

const server = app.listen(env.PORT, () => {
  console.log(`Sikka API running on port ${env.PORT} [${env.NODE_ENV}]`);
});

process.on("SIGTERM", () => {
  console.log("SIGTERM received, shutting down gracefully");
  server.close(() => process.exit(0));
});

process.on("SIGINT", () => {
  console.log("SIGINT received, shutting down gracefully");
  server.close(() => process.exit(0));
});
