import { Hono } from "hono";
import { cors } from "hono/cors";
import transformer from "./routes/transformer";
import gateway from "./routes/gateway";
import deviceModel from "./routes/device-model";
import light from "./routes/light";



const app = new Hono();

// Allow the Vite dev server (and other browser origins) to call the API.
app.use("*", cors());

app.route("/transformers", transformer);
app.route("/gateways", gateway);
app.route("/device-models", deviceModel);
app.route("/lights", light);

export default {
  port: 3000,
  fetch: app.fetch,
};
