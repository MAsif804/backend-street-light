import { Hono } from "hono";
import transformer from "./routes/transformer";
import gateway from "./routes/gateway";
import deviceModel from "./routes/device-model";



const app = new Hono();

app.route("/transformers", transformer);
app.route("/gateways", gateway);
app.route("/device-models", deviceModel);

export default {
  port: 3000,
  fetch: app.fetch,
};
