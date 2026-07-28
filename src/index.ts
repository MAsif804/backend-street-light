import { Hono } from "hono";
import { cors } from "hono/cors";
import transformer from "./routes/transformer";
import gateway from "./routes/gateway";
import deviceModel from "./routes/device-model";
import light from "./routes/light";
import auth from "./routes/auth-routes";
import user from "./routes/user";



const app = new Hono();

// Allow the Vite dev server (and other browser origins) to call the API.
app.use("*", cors());

app.route("/transformers", transformer);
app.route("/gateways", gateway);
app.route("/device-models", deviceModel);
app.route("/lights", light);
app.route("/auth", auth);
app.route("/users", user);

export default {
  port: 3000,
  fetch: app.fetch,
};
