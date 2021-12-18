import type { LoaderFunction } from 'remix'
import { json } from 'remix'
import { prisma } from '~/db/prisma.server'

export const loader: LoaderFunction = async ({ request, context }) => {
  const { optimus } = context
  const url = new URL(request.url)
  let hash = url.searchParams.get('hash')
  let lastId = Number(url.searchParams.get('lastId'))
  const eventId = optimus.decode(hash)
  let count = await prisma.picture.count({
    where: { eventId: eventId, id: { gt: lastId } },
  })
  return json({
    hash,
    count,
  })
}
