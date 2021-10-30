console.log('gallery.js')
let options = {}
const defaultOptions = {
  duration: 3,
  counter: true,
  progress: true,
  selectors: {},
}

async function getOptions() {
  return Promise.resolve(defaultOptions)
}

let wrapper
let lightbox
let grid
let image
let image1
let image2
let video
let preload
let message
let counter
let spinner
let counterSpan
let linkSelector
let machine
const host = window.location.host
const protocol = window.location.protocol
window.initGallery = function () {
  let ws = new WebSocket(location.origin.replace(/^http/, 'ws'))
  ws.onopen = () => {
    ws.send('hello')
  }
  ws.onmessage = async message => {
    console.log(message)
    const { data } = message
    const msg = JSON.parse(data)
    if (msg.type === 'new_picture') {
      const response = await fetch(`${protocol}//${host}/?_data=routes/index`)
      const json = await response.json()
      const { event } = json
      localStorage.setItem('event', JSON.stringify(event))
      machine.send('UPDATED')
    }
  }
  ws.onerror = error => {
    console.log('Remix dev asset server web socket error:')
    console.error(error)
  }

  document.body.addEventListener('keyup', handleKeyUp)
  document.body.addEventListener(
    'mousemove',
    () => (document.body.style.cursor = 'default'),
  )

  wrapper = document.getElementById('wrapper')
  lightbox = document.getElementById('fcig_lightbox')
  grid = document.getElementById('fcig_grid')
  image = document.getElementById('fcig_image')
  image1 = document.getElementById('fcig_image1')
  image2 = document.getElementById('fcig_image2')
  video = document.getElementById('fcig_video')
  message = document.getElementById('fcig_message')
  preload = document.getElementById('fcig_preload')
  counter = document.getElementById('fcig_counter')
  spinner = document.getElementById('fcig_spinner')
  counterSpan = counter.querySelector('span')

  grid.addEventListener('click', handleImageClick)
  image1.addEventListener('load', handleImageLoad)
  image2.addEventListener('load', handleImageLoad)
  preload.addEventListener('load', handleImageLoad)
  video.addEventListener('play', handleVideoPlay)
  video.addEventListener('ended', handleVideoEnded)

  getOptions().then(o => {
    options = o
    linkSelector = options?.selectors[document.location.host]

    machine = createMachine(
      (config = config =
        {
          initial: 'idle',
          states: {
            idle: {},
            grid: {},
            image: {},
            instructions: {},
          },
          on: {
            RESET: { target: 'idle', actions: ['stopSlideShow'] },
            GRID: { target: 'grid', actions: ['stopSlideShow'] },
            IMAGE: { target: 'image', actions: ['showImage'] },
            NEXT: { target: 'image', actions: ['nextImage'] },
            PREVIOUS: { target: 'image', actions: ['previousImage'] },
            FIRST: { target: 'image', actions: ['firstImage'] },
            LAST: { target: 'image', actions: ['lastImage'] },
            UPDATE: { actions: ['updateThread'] },
            UPDATED: { actions: ['handleUpdate'] },
            NEXTPAGE: { actions: ['nextPage'] },
            START: {
              target: 'image',
              actions: ['startSlideShow', 'nextImage'],
            },
            STOP: { actions: ['stopSlideShow'] },
            JUMP: { actions: ['jumpVideo'] },
            INSTRUCTIONS: {
              target: 'instructions',
              actions: ['stopSlideShow'],
            },
          },
        }),
      (actions = {
        showImage: ({ context, payload }) => {
          context.index = payload
        },
        nextImage: ({ context, send }) => {
          if (context.index < context.links.length - 1) {
            context.index++
          } else {
            context.index = 0
          }
        },
        previousImage: ({ context }) => {
          if (context.index > 0) {
            context.index--
          }
        },
        firstImage: ({ context }) => {
          context.index = 0
        },
        lastImage: ({ context }) => {
          context.index = context.links.length - 1
        },
        startSlideShow: ({ context }) => {
          context.isPlaying = true
        },
        stopSlideShow: ({ context }) => {
          context.isPlaying = false
          if (context.timerId) {
            window.clearTimeout(context.timerId)
            context.timerId = null
          }
          video.pause()
          video.src = ''
        },
        updateThread: () => {
          document.querySelector('a[data-cmd=update]').click()
        },
        nextPage: () => {
          document.querySelector('a.vnext').click()
        },
        jumpVideo: () => {
          video.currentTime = video.currentTime + 10.0
        },
        handleUpdate: ({ context, payload }) => {
          context.links = getImages()
          context.gridInitialized = false
        },
      }),
      (initialContext = {
        index: -1,
        lastIndex: -1,
        currImage: 1,
        links: getImages(),
        gridInitialized: false,
        isPlaying: false,
        timerId: null,
        progressTimerId: null,
      }),
    )
    machine.onTransition = render
    machine.send('START')
  })
}

function getImages() {
  const event = JSON.parse(localStorage.getItem('event'))
  return event.Picture
}

let progress = null
function handleImageLoad(event) {
  console.log('image loaded', event.target.id, event.target.src)
  if (event.target === preload) {
    machine.context.isPreloading = false
    console.log('preload is complete')
    if (machine.context.nextPending) {
      console.log('pending next, so send NEXT...')
      const elapsed = Date.now() - machine.context.nextPendingStart
      // make sure spinner shows for at least 1 second so no flashy spinner
      setTimeout(() => {
        machine.context.nextPending = false
        machine.send('NEXT')
      }, Math.max(0, 1000 - elapsed))
    }
    return
  }

  if (machine.context.isPlaying) {
    if (progress) {
      wrapper.removeChild(progress)
      progress = null
    }
    progress = document.createElement('div')
    progress.classList.add('fcig_progress')
    progress.style.opacity = options.progress ? 1 : 0
    progress.style.width = 0
    progress.style.transition = `width ${options.duration}s ease-in`
    wrapper.appendChild(progress)

    progress.addEventListener('transitionend', () => {
      machine.send('NEXT')
    })
    window.setTimeout(() => {
      progress.style.width = '100%'
    }, 100)
  }
}

function handleVideoPlay() {
  if (machine.context.progressTimerId) {
    window.clearInterval(machine.context.progressTimerId)
  }
  if (progress) {
    wrapper.removeChild(progress)
  }
  progress = document.createElement('div')
  progress.classList.add('fcig_progress')
  progress.style.width = 0
  progress.style.display = options.progress ? 'block' : 'none'

  wrapper.appendChild(progress)

  machine.context.progressTimerId = window.setInterval(function () {
    if (machine.state !== 'image') {
      window.clearInterval(machine.context.progressTimerId)
      machine.context.progressTimerId = null
    }
    if (progress) {
      progress.style.width = `${(video.currentTime * 100.0) / video.duration}%`
    }
  }, 500)
}
function handleVideoEnded() {
  if (progress) {
    progress.style.width = '100%'
  }
  if (machine.context.progressTimerId) {
    window.clearInterval(machine.context.progressTimerId)
  }
  if (machine.context.isPlaying) {
    if (machine.context.timerId) {
      window.clearTimeout(machine.context.timerId)
    }
    machine.context.timerId = window.setTimeout(
      () => machine.send('NEXT'),
      2000,
    )
  }
}

function handleImageClick(event) {
  if (event.target.tagName === 'IMG') {
    index = parseInt(event.target.parentElement.dataset.index)
    machine.send('IMAGE', index)
  }
}

const keymap = {
  Escape: 'RESET',
  KeyG: 'GRID',
  KeyU: 'UPDATE',
  KeyS: 'START',
  Space: 'STOP',
  ArrowRight: 'NEXT',
  KeyJ: 'NEXT',
  ArrowLeft: 'PREVIOUS',
  KeyK: 'PREVIOUS',
  KeyF: 'FIRST',
  KeyL: 'LAST',
  KeyN: 'NEXTPAGE',
  Digit1: 'JUMP',
  Slash: 'INSTRUCTIONS',
  KeyX: 'TEST',
  KeyR: 'REFRESH',
}

function handleKeyUp(event) {
  const target = event.target
  if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return

  machine.context.nextPending = false
  const message = keymap[event.code]
  console.log(event.code, message)
  if (message === 'NEXT' && machine.context.isPreloading) {
    event.stopPropagation()
    console.log('NEXT triggered but preload is not finished, pending...')
    //spinner.style.display = "flex";
    spinner.style.opacity = 1
    machine.context.nextPending = true
    machine.context.nextPendingStart = Date.now()
    return
  }
  if (message === 'TEST') {
    event.stopPropagation()
    spinner.style.opacity = spinner.style.opacity === '1' ? 0 : 1
    return
  }
  if (message === 'REFRESH') {
    init()
    const links = document.querySelectorAll(linkSelector)
    machine.send('UPDATED', links)
    return
  }
  if (message) {
    event.stopPropagation()
    machine.send(message)
  }
}

const observer = new MutationObserver(function () {
  machine.send('UPDATED', document.querySelectorAll(linkSelector))
})
const observerContainer = document.querySelector('div.thread')
if (observerContainer) {
  observer.observe(observerContainer, {
    attributes: false,
    childList: true,
    subtree: true,
  })
}

async function render() {
  let target = null
  const view = machine.state
  if (!machine.context.links.length) {
    machine.context.links = document.querySelectorAll(linkSelector)
  }
  const { index, currImage, links, gridInitialized } = machine.context
  let messageText = ''
  let nextImage = currImage
  options = await getOptions()
  if (view == 'grid') {
    if (!gridInitialized) {
      let html = ''
      Array.from(links).forEach((link, i) => {
        if (link.tagName !== 'A') return
        const img = link.querySelector('img')
        html += `<div data-index="${i}">
          <img src="${img.getAttribute('src')}"/>
          </div>`
      })
      grid.innerHTML = html
    }

    if (index > 0) {
      grid.querySelector('div.current')?.classList.remove('current')
      target = grid.querySelector(`div[data-index="${index}"]`)
      target.classList.add('current')
    }
  } else if (view === 'image') {
    const { url, text, name } = links[index]
    messageText = `<p style="font-size: 125%;">${text}</p><p><i>${name}</i></p>`
    let src = url
    const image = currImage === 1 ? image1 : image2
    nextImage = currImage === 1 ? 2 : 1

    if (src.endsWith('.webm')) {
      video.src = src
      image.src = ''
      video.blur()
      isVideo = true
    } else {
      image.src = src
      video.src = ''
      isVideo = false
    }
    machine.context.isPreloading = false
    if (index < links.length - 2) {
      const { url } = links[index + 1]
      let src = url
      if (!src.endsWith('.webm')) {
        machine.context.isPreloading = true
        console.log(`start preload ${src}`)
        preload.src = src
      }
    }
  }
  grid.style.display = view === 'grid' ? 'flex' : 'none'
  if (view === 'grid') grid.focus()
  image.style.display = view === 'image' ? 'grid' : 'none'
  message.innerHTML = messageText
  image1.classList.toggle(
    'current',
    view === 'image' && !isVideo && currImage === 1,
  )
  image2.classList.toggle(
    'current',
    view === 'image' && !isVideo && currImage === 2,
  )
  machine.context.currImage = nextImage
  if (progress && (view !== 'image' || !isVideo)) {
    wrapper.removeChild(progress)
    progress = null
  }
  video.style.opacity = view === 'image' && isVideo ? 1 : 0
  lightbox.style.display = view === 'idle' ? 'none' : 'grid'
  counter.style.display = view === 'image' && options.counter ? 'flex' : 'none'
  lightbox.style.height = view === 'image' ? '100vh' : 'auto'

  document.body.classList.toggle('fcig_noscroll', view !== 'idle')
  //spinner.style.display = machine.context.nextPending ? "flex" : "none";
  spinner.style.opacity = machine.context.nextPending ? 1 : 0
  counterSpan.innerHTML = `${index + 1} / ${links.length}`
  document.body.style.cursor = 'none'

  if (target) {
    target.scrollIntoView()
  }
}

/// State Machine
function createMachine(config) {
  function execute(actions, machine, payload) {
    if (!actions) return
    if (Array.isArray(actions)) {
      actions.forEach(action => execute(action, machine, payload))
      return
    }
    const { context, send } = machine
    if (typeof actions === 'function') {
      const handler = actions(machine)
      if (typeof handler === 'function') {
        handler({ context, send, payload })
      }
    }
    if (typeof actions === 'string') {
      machine.actions[actions]({ context, send, payload })
    }
  }

  const machine = {
    state: config.initial,
    context: initialContext,
    actions: actions,
    transition: function (currentState, message, payload) {
      const currentStateDefinition = config.states[currentState]
      const destinationTransition =
        currentStateDefinition.on?.[message] ?? config.on?.[message]

      // no transition so stay in current state
      if (!destinationTransition) {
        return machine.state
      }

      const targetState = destinationTransition.target ?? currentState
      const targetStateDefinition = config.states[targetState]

      const currContext = JSON.stringify(machine.context)
      execute(currentStateDefinition.exit, machine, payload)
      execute(destinationTransition.actions, machine, payload)
      execute(targetStateDefinition.enter, machine, payload)

      const nextContext = JSON.stringify(machine.context)
      if (machine.state !== targetState || currContext !== nextContext) {
        machine.state = targetState
        machine.onTransition()
      }

      return machine.state
    },
    send: function (message, payload) {
      return machine.transition(machine.state, message, payload)
    },
    onTransition: function () {},
  }
  return machine
}

function send(message, payload) {
  return function (machine) {
    machine.send(message, payload)
  }
}
