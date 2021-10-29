function saveEventData(event: any) {
  let win = window as any
  win.localStorage.setItem('event', JSON.stringify(event))
  win.initGallery()
}

export { saveEventData }
