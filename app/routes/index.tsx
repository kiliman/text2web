import type { MetaFunction, LinksFunction, LoaderFunction } from 'remix'
import { useLoaderData } from 'remix'
import { Link } from 'react-router-dom'
import { prisma } from '~/db/prisma.server'
import stylesUrl from '../styles/index.css'
import { saveEventData } from '~/gallery.client'

export let meta: MetaFunction = () => {
  return {
    title: 'Remix Starter',
    description: 'Welcome to remix!',
  }
}

export let loader: LoaderFunction = async ({ context }) => {
  let event = await prisma.event.findUnique({
    where: { id: 1 },
    include: { Picture: true },
  })
  return {
    event,
  }
}

export default function Index() {
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
          <div id="fcig_message"></div>
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
