import type { LoaderFunction } from 'remix'
import { prisma } from '~/db/prisma.server'

export let loader: LoaderFunction = async ({ request }) => {
  let url = new URL(request.url)
  let lastId = Number(url.searchParams.get('lastId'))
  let count = await prisma.picture.count({
    where: { eventId: 1, id: { gt: lastId } },
  })
  return {
    count,
  }
}

export default function () {
  return null
}
