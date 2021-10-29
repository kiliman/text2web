import { PrismaClient } from '@prisma/client'

const prisma =
  (global as any).prismaClient ?? ((global as any).prismaClient = getClient())

function getClient() {
  const client = new PrismaClient()
  client.$connect()
  return client
}

export { prisma }
