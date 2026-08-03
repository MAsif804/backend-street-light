import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '../generated/prisma/client'

// The client is created lazily, on first query, rather than at import time.
//
// This module sits on the import path of every route, so a top-level `throw`
// here aborts evaluation of `src/index.ts` itself. On Vercel that surfaces as
// "ReferenceError: Cannot access 'default' before initialization" — the loader
// reads the half-initialized module's default export and reports the symptom
// instead of the real cause (a missing DATABASE_URL). Deferring the check keeps
// module init side-effect free, so a misconfigured env var becomes a legible
// error on the request that needs the database.
//
// The instance is cached on globalThis so warm serverless invocations reuse one
// connection pool instead of opening a new one per request.
const globalForPrisma = globalThis as unknown as { __prisma?: PrismaClient }

function getClient(): PrismaClient {
  if (globalForPrisma.__prisma) return globalForPrisma.__prisma

  const connectionString = process.env.DATABASE_URL
  if (!connectionString) {
    throw new Error(
      'DATABASE_URL is not set. On Vercel, add it under Project Settings → ' +
        'Environment Variables for this environment, then redeploy.',
    )
  }

  const client = new PrismaClient({ adapter: new PrismaPg({ connectionString }) })
  globalForPrisma.__prisma = client
  return client
}

// Preserves the `prisma.user.findMany(...)` call shape used across the routes.
export const prisma = new Proxy({} as PrismaClient, {
  get(_target, prop) {
    const value = Reflect.get(getClient() as object, prop)
    return typeof value === 'function' ? value.bind(getClient()) : value
  },
})
