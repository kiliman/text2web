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
  try {
    const { optimus, wss } = context
    const data = new URLSearchParams(await request.text())
    const toNumber = data.get('To')!
    const senderNumber = data.get('From')!
    const body = (data.get('Body') ?? '').trim()
    const today = new Date().toISOString().split('T')[0]

    // find event for this number
    console.log({ toNumber, senderNumber, today })
    const event = await prisma.event.findFirst({
      where: { phoneNumber: toNumber, date: new Date(today) },
      include: {
        Registration: true,
      },
    })
    if (event === null) {
      throw new Error('No event found')
    }
    const eventHash = optimus.encode(event.id).toString()
    console.log(`Found event ${event.id} hash ${eventHash}`)

    let registration = event.Registration.find(
      (r: Registration) => r.phoneNumber === senderNumber,
    )

    if (!registration) {
      // need to register the user
      if (!body) {
        return reply({
          from: toNumber,
          to: senderNumber,
          body: 'Please reply with the Event ID.',
        })
      }
      if (body.replace(/\D/g, '') !== eventHash) {
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
        body: `Thanks ${registration.name}! You can start taking photos and sending them to us. You can also include a message with your photos. Emojis are also supported 😂😍👍.`,
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
  } catch (e) {
    console.error(e)
    //@ts-ignore
    return new Response(e.message, { status: 500 })
  }
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

async function deleteMediaItem(mediaItem: MediaItem) {
  return await twilioClient.messages(mediaItem.messageSid).remove()
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
    folder: `text2web/${event.id}`,
    filename_override: filename,
    use_filename: true,
    fetch_format: 'auto',
    quality: 'auto',
  })

  // console.log('deleting media item from twilio')
  // const deleteResult = await deleteMediaItem(mediaItem)
  // console.log(deleteResult)
  try {
    await prisma.picture.create({
      data: {
        url: result.secure_url,
        text: body,
        name: registration.name,
        phoneNumber: registration.phoneNumber,
        eventId: event.id,
        etag: result.etag,
      },
    })
  } catch (e) {
    // delete from cloudinary
    console.log('error saving picture to database', e)
    try {
      const response = await cloudinary.uploader.destroy(result.public_id)
      console.log(response)
    } catch (e) {
      console.log('error deleting picture from cloudinary', e)
    }
  }
}
