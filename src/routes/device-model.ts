import { Hono } from "hono";
import { prisma } from "../lib/prisma";

// DeviceType enum values from the schema (case-sensitive).
const VALID_TYPES = ["Light", "Transformer", "Gateway"] as const;

const deviceModel = new Hono();

// GET /device-models — list all device models
deviceModel.get("/", async (c) => {
  const models = await prisma.deviceModel.findMany();
  return c.json(models);
});

// GET /device-models/:id — one model + the devices using it
deviceModel.get("/:id", async (c) => {
  const id = c.req.param("id");

  const found = await prisma.deviceModel.findUnique({
    where: { id },
    include: {
      gateways: true,
      transformers: true,
      lights: true,
    },
  });

  if (!found) {
    return c.json({ error: "DeviceModel not found" }, 404);
  }
  return c.json(found);
});

// POST /device-models — create device model
deviceModel.post("/", async (c) => {
  const body = await c.req.json();

  if (!body.modelCode) {
    return c.json({ error: "modelCode is required" }, 400);
  }
  if (!body.type) {
    return c.json({ error: "type is required" }, 400);
  }
  if (!VALID_TYPES.includes(body.type)) {
    return c.json(
      { error: `type must be one of: ${VALID_TYPES.join(", ")}` },
      400,
    );
  }

  try {
    const created = await prisma.deviceModel.create({
      data: {
        modelCode: body.modelCode,
        type: body.type,
        ipRating: body.ipRating,
        voltage: body.voltage,
        powerRating: body.powerRating,
        loadCapacity: body.loadCapacity,
        reqCurrent: body.reqCurrent,
      },
    });
    return c.json(created, 201);
  } catch (err: any) {
    if (err.code === "P2002") {
      return c.json({ error: "modelCode already exists" }, 409);
    }
    return c.json({ error: err.message }, 400);
  }
});

// PUT /device-models/:id — update device model
deviceModel.put("/:id", async (c) => {
  const id = c.req.param("id");
  const body = await c.req.json();

  if (body.type && !VALID_TYPES.includes(body.type)) {
    return c.json(
      { error: `type must be one of: ${VALID_TYPES.join(", ")}` },
      400,
    );
  }

  try {
    const updated = await prisma.deviceModel.update({
      where: { id },
      data: {
        modelCode: body.modelCode,
        type: body.type,
        ipRating: body.ipRating,
        voltage: body.voltage,
        powerRating: body.powerRating,
        loadCapacity: body.loadCapacity,
        reqCurrent: body.reqCurrent,
      },
    });
    return c.json(updated);
  } catch (err: any) {
    if (err.code === "P2025") {
      return c.json({ error: "DeviceModel not found" }, 404);
    }
    if (err.code === "P2002") {
      return c.json({ error: "modelCode already exists" }, 409);
    }
    return c.json({ error: err.message }, 400);
  }
});

// DELETE /device-models/:id — delete device model
deviceModel.delete("/:id", async (c) => {
  const id = c.req.param("id");

  try {
    await prisma.deviceModel.delete({ where: { id } });
    return c.json({ message: "DeviceModel deleted" });
  } catch (err: any) {
    if (err.code === "P2025") {
      return c.json({ error: "DeviceModel not found" }, 404);
    }
    return c.json({ error: err.message }, 400);
  }
});

export default deviceModel;
