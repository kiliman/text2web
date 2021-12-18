import type { MetaFunction, LoaderFunction } from 'remix'
import { useLoaderData } from 'remix'
import { prisma } from '~/db/prisma.server'
import { saveEventData } from '~/gallery.client'

export let meta: MetaFunction = () => {
  return {
    title: 'text2web',
    description: 'text2web gallery viewer',
  }
}
export let loader: LoaderFunction = async ({ params, context }) => {
  const { optimus } = context
  const { hash } = params
  let eventId = optimus.decode(hash)
  let event = await prisma.event.findUnique({
    where: { id: eventId },
    include: {
      Picture: {
        orderBy: { id: 'asc' },
      },
    },
  })
  if (!event) {
    throw new Response('Not found', { status: 404 })
  }
  return {
    event: {
      hash,
      lastId: event.Picture.length
        ? event.Picture[event.Picture.length - 1].id
        : 0,
      pictures: event.Picture.map((pic: any) => ({
        id: pic.id,
        name: pic.name,
        text: pic.text,
        url: pic.url,
      })),
    },
  }
}

export default function Index() {
  console.log('index')
  let { event } = useLoaderData()
  if (saveEventData) {
    saveEventData(event)
  }

  return (
    <div id="wrapper">
      <div id="fcig_lightbox">
        <div id="fcig_grid"></div>
        <div id="fcig_image">
          <img id="fcig_image1" className="fcig_image" alt="" />
          <img id="fcig_image2" className="fcig_image" alt="" />
          <video id="fcig_video" autoPlay controls></video>
          <div id="fcig_message">
            <div id="fcig_message_header"></div>
            <div id="fcig_message_body">
              <div id="fcig_message_text"></div>
              <div id="fcig_message_name"></div>
            </div>
          </div>
        </div>
      </div>
      <div id="fcig_counter" style={{ display: 'none', alignItems: 'center' }}>
        <span></span>
      </div>
      <div id="fcig_spinner">
        <svg className="spinner" viewBox="0 0 50 50">
          <circle
            className="path"
            cx="25"
            cy="25"
            r="20"
            fill="none"
            stroke="#ffffffcc"
            strokeWidth="5"
          ></circle>
        </svg>
      </div>
      <img id="fcig_preload" style={{ opacity: 0 }} alt="" />
    </div>
  )
}
