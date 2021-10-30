import { ActionFunction, HeadersFunction, useActionData } from 'remix'
import { v2 as cloudinary } from 'cloudinary'

import * as path from 'path'
import * as fs from 'fs'
import fetch, { Body } from 'node-fetch'
//@ts-expect-error
import { mime } from 'ext-name'
import MessagingResponse from 'twilio/lib/twiml/MessagingResponse'
import { twilioClient } from '~/twilio/twilio.server'
import { prisma } from '~/db/prisma.server'
import { Event, Registration } from '.prisma/client'

type MediaItem = {
  mediaSid: string
  messageSid: string
  mediaUrl: string
  filename: string
  extension: string
}

export let headers: HeadersFunction = () => {
  return {
    'content-type': 'text/xml',
  }
}

export let action: ActionFunction = async ({ request, context }) => {
  const { optimus, wss } = context
  const data = new URLSearchParams(await request.text())
  const toNumber = data.get('To')!
  const senderNumber = data.get('From')!
  const body = (data.get('Body') ?? '').trim()

  // find event for this number
  const event = await prisma.event.findUnique({
    where: { id: 1 },
    include: {
      Registration: true,
    },
  })
  if (event === null) {
    throw new Error('No event found')
  }
  let registration = event.Registration.find(
    (r: Registration) => r.phoneNumber === senderNumber,
  )
  const eventHash = optimus.encode(event.id).toString()

  if (!registration) {
    // need to register the user
    if (!body) {
      return reply({
        from: toNumber,
        to: senderNumber,
        body: 'Please reply with the Event ID.',
      })
    }
    if (body.replace(/\s/g, '') !== eventHash) {
      return reply({
        from: toNumber,
        to: senderNumber,
        body: `Invalid Event ID: "${body}". Please reply with the Event ID.`,
      })
    }

    registration = await prisma.registration.create({
      data: {
        name: 'Guest',
        phoneNumber: senderNumber,
        eventId: event.id,
      },
    })
    return reply({
      from: toNumber,
      to: senderNumber,
      body: `Thanks for registering for the event: "${event.name}".\n\nPlease reply with your name.`,
    })
  }
  // we have a registration, let's check if we have a name
  if (registration.name === 'Guest') {
    if (!body) {
      return reply({
        from: toNumber,
        to: senderNumber,
        body: `Thanks for registering for the event: "${event.name}".\n\nPlease reply with your name.`,
      })
    }

    registration.name = body
    await prisma.registration.update({
      data: {
        name: body,
      },
      where: { id: registration.id },
    })
    return reply({
      from: toNumber,
      to: senderNumber,
      body: `Thanks ${registration.name}! You can start taking photos and sending them to us. You can also include a message with your photo.`,
    })
  }

  const numMedia = Number(data.get('NumMedia'))
  if (numMedia === 0) {
    return reply({
      from: toNumber,
      to: senderNumber,
      body: `Please send one or more photos with an optional message. Thanks!`,
    })
  }

  const messageSid = data.get('MessageSid')!
  const mediaItems: MediaItem[] = []
  let saveOperations: any = []

  for (let i = 0; i < numMedia; i++) {
    const mediaUrl = new URL(data.get(`MediaUrl${i}`)!)
    const contentType = data.get(`MediaContentType${i}`)
    const extension = mime(contentType)[0].ext
    const mediaSid = path.basename(mediaUrl.pathname)
    const filename = `${mediaSid}.${extension}`

    mediaItems.push({
      mediaSid,
      messageSid,
      mediaUrl: mediaUrl.toString(),
      filename,
      extension,
    })
    saveOperations = mediaItems.map(mediaItem =>
      saveMedia(event, registration!, body, mediaItem),
    )
  }

  await Promise.all(saveOperations)

  const messageBody =
    numMedia === 0
      ? 'Send us an image!'
      : `Thanks for sending ${numMedia} photo${numMedia === 1 ? '' : 's'}`

  const twilioResponse = new MessagingResponse()
  twilioResponse.message(
    {
      from: process.env.TWILIO_PHONENUMBER,
      to: senderNumber,
    },
    messageBody,
  )

  const xml = twilioResponse.toString()

  // // let clients know there's a new picture
  // wss.clients.forEach((client: any) => {
  //   console.log('sending new_picture')
  //   client.send(JSON.stringify({ type: 'new_picture' }))
  // })

  return new Response(xml, {
    status: 200,
    headers: { 'content-type': 'text/xml' },
  })
}

function reply({ from, to, body }: { from: string; to: string; body: string }) {
  const twilioResponse = new MessagingResponse()
  twilioResponse.message(
    {
      from,
      to,
    },
    body,
  )
  const xml = twilioResponse.toString()
  console.log(xml)
  return new Response(xml, {
    status: 200,
    headers: { 'content-type': 'text/xml' },
  })
}

export default function () {
  const data = useActionData()
  return data
}

function deleteMediaItem(mediaItem: MediaItem) {
  return twilioClient.api
    .accounts(process.env.TWILIO_ACCOUNT_SID!)
    .messages(mediaItem.messageSid)
    .media(mediaItem.mediaSid)
    .remove()
}

async function saveMedia(
  event: Event,
  registration: Registration,
  body: string | null,
  mediaItem: MediaItem,
) {
  const { mediaUrl, filename } = mediaItem

  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
  })
  const result = await cloudinary.uploader.upload(mediaUrl, {
    folder: 'twilio',
    filename_override: filename,
    use_filename: true,
    fetch_format: 'auto',
    quality: 'auto',
  })
  deleteMediaItem(mediaItem)
  await prisma.picture.create({
    data: {
      url: result.secure_url,
      text: body,
      name: registration.name,
      phoneNumber: registration.phoneNumber,
      eventId: event.id,
    },
  })
}
