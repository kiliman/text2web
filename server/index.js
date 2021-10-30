require('dotenv').config()
const path = require('path')
const express = require('express')
const compression = require('compression')
const morgan = require('morgan')
const { Server } = require('ws')
const { createRequestHandler } = require('@remix-run/express')
const Optimus = require('optimus-js')
const optimus = new Optimus(1580030173, 59260789, 1163945558)

const MODE = process.env.NODE_ENV
const BUILD_DIR = path.join(process.cwd(), 'server/build')
process.env.IMAGES_DIR = path.join(process.cwd(), 'public/images')

let app = express()

app.use(compression())
app.use(morgan('tiny'))

// You may want to be more aggressive with this caching
app.use(express.static('public'))

// Remix fingerprints its assets so we can cache forever
app.use(express.static('public/build', { immutable: true, maxAge: '1y' }))

app.all(
  '*',
  MODE === 'production'
    ? createRequestHandler({ build: require('./build'), getLoadContext })
    : (req, res, next) => {
        purgeRequireCache()
        let build = require('./build')
        return createRequestHandler({ build, mode: MODE, getLoadContext })(
          req,
          res,
          next,
        )
      },
)

let port = process.env.PORT || 3000
const server = app.listen(port, () => {
  console.log(`Express server listening on port ${port}`)
})
const wsServer = new Server({ server })
wsServer.on('connection', socket => {
  socket.on('message', message => console.log(message))
})

function getLoadContext(req, res) {
  return { optimus, wsServer }
}

////////////////////////////////////////////////////////////////////////////////
function purgeRequireCache() {
  // purge require cache on requests for "server side HMR" this won't let
  // you have in-memory objects between requests in development,
  // alternatively you can set up nodemon/pm2-dev to restart the server on
  // file changes, we prefer the DX of this though, so we've included it
  // for you by default
  for (let key in require.cache) {
    if (key.startsWith(BUILD_DIR)) {
      delete require.cache[key]
    }
  }
}
