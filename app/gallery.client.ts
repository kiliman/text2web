function saveEventData(event: any) {
  console.log('saveEventData', event)
  const win = window as any
  win.localStorage.setItem(`event-${event.hash}`, JSON.stringify(event))
  win.initGallery(event.hash)
}

export { saveEventData }
