// Seed mirrors frontend/src/data/inventory-data.tsx and the topology in
// frontend/src/components/dashboard/map-view.tsx, so the API serves the same
// records the UI currently hard-codes.
//
// Device hierarchy: Gateway ──> Transformer ──> Light.
// (This file previously targeted a `Node` model that the schema replaced with
// `Transformer`; every reference below is against the current schema.)
import { prisma } from '../src/lib/prisma'

const DEVICE_MODELS = [
  {
    modelCode: 'SL-1234',
    type: 'Light',
    ipRating: 'IP65',
    voltage: '220V',
    powerRating: '150W',
    reqCurrent: '0.5A',
  },
  {
    modelCode: 'ND-2045',
    type: 'Transformer',
    ipRating: 'IP65',
    voltage: '220V',
    loadCapacity: '50V',
  },
  {
    modelCode: 'GW-3001',
    type: 'Gateway',
    ipRating: 'IP65',
    voltage: '220V',
    loadCapacity: '100W',
  },
] as const

// deviceId, status, coordinates from map-view.tsx (null where the map
// does not plot the gateway).
const GATEWAYS = [
  { deviceId: 'GW1CNST', status: 'ON', lat: 33.7314, lng: 73.0951 },
  { deviceId: 'GW2CNST', status: 'ON', lat: 33.722, lng: 73.1 },
  { deviceId: 'GW3CNST', status: 'ON', lat: 33.728, lng: 73.096 },
  { deviceId: 'GW4CNST', status: 'ON', lat: 33.736, lng: 73.092 },
  { deviceId: 'GW5CNST', status: 'OFF', lat: 33.742, lng: 73.092 },
  { deviceId: 'GW6CNST', status: 'OFF', lat: null, lng: null },
  { deviceId: 'GW7CNST', status: 'OFF', lat: null, lng: null },
] as const

const TRANSFORMERS = [
  { code: 'ND1CNSTN', status: 'ON', gateway: 'GW1CNST', lat: 33.718833, lng: 73.103333 },
  { code: 'ND2CNSTN', status: 'ON', gateway: 'GW1CNST', lat: 33.724083, lng: 73.099306 },
  { code: 'ND3CNSTN', status: 'ON', gateway: 'GW2CNST', lat: 33.727111, lng: 73.097056 },
  { code: 'ND4CNSTN', status: 'ON', gateway: 'GW2CNST', lat: 33.734806, lng: 73.091444 },
  { code: 'ND5CNSTN', status: 'OFF', gateway: 'GW3CNST', lat: 33.73825, lng: 73.091083 },
  { code: 'ND6CNSTN', status: 'OFF', gateway: 'GW3CNST', lat: 33.744472, lng: 73.091639 },
  { code: 'ND7CNSTN', status: 'OFF', gateway: 'GW4CNST', lat: null, lng: null },
] as const

// Only the lights the fixture actually names — entries with an empty lightid are skipped.
const LIGHTS = [
  { code: 'L006', status: 'OFF', transformer: 'ND6CNSTN' },
  { code: 'L007001', status: 'OFF', transformer: 'ND7CNSTN' },
  { code: 'L007002', status: 'OFF', transformer: 'ND7CNSTN' },
  { code: 'L007003', status: 'OFF', transformer: 'ND7CNSTN' },
  { code: 'L007004', status: 'OFF', transformer: 'ND7CNSTN' },
  { code: 'L007005', status: 'OFF', transformer: 'ND7CNSTN' },
] as const

const INSTALLATION_DATE = new Date('2024-01-15')
const LAST_MAINTENANCE = new Date('2024-01-20')

// Fields shared by every device. The street lives under a different column per
// model (Gateway/Transformer use `installationLocation`, Light uses `street`),
// so it is applied separately below rather than spread from here.
const PLACEMENT = {
  region: 'Islamabad',
  cluster: 'Red Zone',
  installationDate: INSTALLATION_DATE,
  lastMaintenance: LAST_MAINTENANCE,
  ipRating: 'IP65',
  voltage: '220V',
}

// Matches a Red Zone location seeded by seed-geo.ts, so these devices line up
// with the City -> Cluster -> Location dropdowns in the device forms.
const STREET = 'Constitution Avenue'

async function main() {
  for (const model of DEVICE_MODELS) {
    await prisma.deviceModel.upsert({
      where: { modelCode: model.modelCode },
      update: {},
      create: { ...model },
    })
  }

  const [lightModel, transformerModel, gatewayModel] = await Promise.all([
    prisma.deviceModel.findUniqueOrThrow({ where: { modelCode: 'SL-1234' } }),
    prisma.deviceModel.findUniqueOrThrow({ where: { modelCode: 'ND-2045' } }),
    prisma.deviceModel.findUniqueOrThrow({ where: { modelCode: 'GW-3001' } }),
  ])

  await prisma.user.upsert({
    where: { email: 'admin@inlights.ai' },
    update: {},
    create: {
      email: 'admin@inlights.ai',
      password: await Bun.password.hash('InLights@321', {
        algorithm: 'bcrypt',
        cost: 10,
      }),
      role: 'ADMIN',
      name: 'Admin User',
    },
  })

  for (const gw of GATEWAYS) {
    await prisma.gateway.upsert({
      where: { deviceId: gw.deviceId },
      update: {},
      create: {
        ...PLACEMENT,
        installationLocation: STREET,
        deviceId: gw.deviceId,
        name: 'GW-3001',
        status: gw.status,
        deviceModelId: gatewayModel.id,
        loadCapacity: '100W',
        operationHours: 1200,
        deviceConnected: 4,
        current: '5.9 A',
        latitude: gw.lat,
        longitude: gw.lng,
      },
    })
  }

  for (const tr of TRANSFORMERS) {
    const gateway = await prisma.gateway.findUniqueOrThrow({
      where: { deviceId: tr.gateway },
    })
    await prisma.transformer.upsert({
      where: { transformerId: tr.code },
      update: {},
      create: {
        ...PLACEMENT,
        installationLocation: STREET,
        transformerId: tr.code,
        status: tr.status,
        gatewayId: gateway.id,
        deviceModelId: transformerModel.id,
        loadCapacity: '50V',
        operationHours: 1200,
        latitude: tr.lat,
        longitude: tr.lng,
      },
    })
  }

  for (const light of LIGHTS) {
    const transformer = await prisma.transformer.findUniqueOrThrow({
      where: { transformerId: light.transformer },
    })
    await prisma.light.upsert({
      where: { lightId: light.code },
      update: {},
      create: {
        ...PLACEMENT,
        street: STREET,
        lightId: light.code,
        name: 'SL-1234',
        status: light.status,
        transformerId: transformer.id,
        deviceModelId: lightModel.id,
        powerRating: '150W',
      },
    })
  }

  // Every transformer in the fixture shows schedule "Daily Scheduler".
  const existing = await prisma.schedule.findFirst({
    where: { name: 'Daily Scheduler' },
  })

  if (!existing) {
    const allTransformers = await prisma.transformer.findMany({ select: { id: true } })
    await prisma.schedule.create({
      data: {
        name: 'Daily Scheduler',
        description: 'Everyday lighting schedule',
        conditions: {
          create: {
            type: 'ON',
            months: 1,
            timePairs: {
              create: [
                { onTime: '05:00', onPeriod: 'AM', offTime: '07:00', offPeriod: 'AM', sortOrder: 0 },
                { onTime: '06:00', onPeriod: 'PM', offTime: '11:00', offPeriod: 'PM', sortOrder: 1 },
              ],
            },
          },
        },
        transformers: { connect: allTransformers.map((t) => ({ id: t.id })) },
      },
    })
  }

  console.log('Seed complete:', {
    deviceModels: await prisma.deviceModel.count(),
    users: await prisma.user.count(),
    gateways: await prisma.gateway.count(),
    transformers: await prisma.transformer.count(),
    lights: await prisma.light.count(),
    schedules: await prisma.schedule.count(),
    conditions: await prisma.condition.count(),
  })
}

main()
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
