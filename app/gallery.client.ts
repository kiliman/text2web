function saveEventData(event: any) {
  let win = window as any
  win.localStorage.setItem('event', JSON.stringify(event))
  let lastId = 0
  if (event.Picture) {
    lastId = event.Picture[event.Picture.length - 1].id
  }
  win.localStorage.setItem('lastId', lastId)
  win.initGallery()
}

export { saveEventData }
