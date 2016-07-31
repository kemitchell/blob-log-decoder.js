var PassThrough = require('readable-stream').PassThrough
var Transform = require('readable-stream').Transform
var asyncEach = require('async.each')
var inherits = require('util').inherits

module.exports = Decoder

function Decoder () {
  /* istanbul ignore if */
  if (!(this instanceof Decoder)) {
    return new Decoder()
  }

  this._firstNumberOctetsArray = []
  this._firstNumber = false

  this._blobsEmitted = 0

  Transform.call(this, {
    writableObjectMode: false,
    readableObjectMode: true
  })
}

inherits(Decoder, Transform)

var prototype = Decoder.prototype

prototype._createNewBlob = function (index) {
  this._currentBlob = {
    index: this._firstNumber + this._blobsEmitted,
    length: false,
    lengthOctetsArray: [],
    bytesLeftToRead: false,
    crc: false,
    crcOctetsArray: [],
    stream: new PassThrough(),
    waitingForDrainEvent: false
  }
}

prototype._emit = function () {
  var blob = this._currentBlob
  this.push({
    index: blob.index,
    length: blob.length,
    crc: blob.crc,
    stream: blob.stream
  })
  this._blobsEmitted++
}

prototype._transform = function (chunk, encoding, callback) {
  var offset = 0
  var blob = this._currentBlob
  var toWrite = {}

  while (offset < chunk.length) {
    // Read the index number at the start of the file.
    if (this._firstNumber === false) {
      var indexOctetsArray = this._firstNumberOctetsArray
      indexOctetsArray.push(chunk[offset])
      if (indexOctetsArray.length === 4) {
        this._firstNumber = octetsToInteger(indexOctetsArray)
        delete this._firstNumberOctetsArray
      }
      offset++
    } else {
      // Create fresh state for a new blob.
      var needNewBlob = blob === undefined || blob.bytesLeftToRead === 0
      if (needNewBlob) {
        this._createNewBlob()
        blob = this._currentBlob
      }

      // Read the CRC.
      if (blob.crc === false) {
        var crcOctetsArray = blob.crcOctetsArray
        crcOctetsArray.push(chunk[offset])
        if (crcOctetsArray.length === 4) {
          blob.crc = new Buffer(crcOctetsArray).readUInt32BE()
          delete blob.crcOctetsArray
        }
        offset++

      // Read the length of this blob.
      } else if (blob.length === false) {
        var lengthOctetsArray = blob.lengthOctetsArray
        lengthOctetsArray.push(chunk[offset])
        if (lengthOctetsArray.length === 4) {
          var length = octetsToInteger(lengthOctetsArray)
          if (length === 0) {
            var error = new Error('zero length')
            error.index = blob.index
            error.zeroLength = true
            return callback(error)
          } else {
            blob.length = length
            blob.bytesLeftToRead = length
            delete blob.lengthOctetsArray
            this._emit()
          }
        }
        offset++

      // Read blob data.
      } else {
        var index = blob.index
        var dataChunk = chunk.slice(
          offset, offset + blob.bytesLeftToRead
        )
        /* istanbul ignore else: TODO: Write covering test. */
        if (toWrite[index] === undefined) {
          toWrite[index] = {
            blob: blob,
            queueOfChunksToWrite: []
          }
        }
        toWrite[index].queueOfChunksToWrite.push(dataChunk)
        var bytesSliced = dataChunk.length
        blob.bytesLeftToRead -= bytesSliced
        offset += bytesSliced
      }
    }
  }

  var blobsWithQueuedChunks = Object.keys(toWrite)
  /* istanbul ignore if */
  if (blobsWithQueuedChunks.length === 0) {
    callback()
  } else {
    asyncEach(blobsWithQueuedChunks, writeQueuedChunks, callback)
  }

  function writeQueuedChunks (index, doneWritingChunks) {
    var element = toWrite[index]
    var queue = element.queueOfChunksToWrite
    var blob = element.blob
    var stream = blob.stream

    asyncEach(queue, writeChunkToStream, function () {
      if (blob.bytesLeftToRead === 0) {
        stream.end()
      }
      doneWritingChunks()
    })

    function writeChunkToStream (chunk, doneWritingChunk) {
      /* istanbul ignore if: TODO: Write covering test. */
      if (blob.waitingForDrainEvent) {
        stream.once('drain', function () {
          writeChunk(doneWritingChunk)
        })
      } else {
        writeChunk(doneWritingChunk)
      }
      function writeChunk (doneWritingChunk) {
        var readyForMoreData = stream.write(chunk)
        blob.waitingForDrainEvent = !readyForMoreData
        if (!readyForMoreData) {
          stream.once('drain', function () {
            blob.waitingForDrainEvent = false
          })
        }
        doneWritingChunk()
      }
    }
  }
}

prototype._flush = function (callback) {
  var missingBytes = this._currentBlob.bytesLeftToRead
  if (missingBytes !== 0) {
    var error = new Error('incomplete blob')
    error.incomplete = true
    error.missingBytes = this.missingBytes
    this.emit('error', error)
  }
  callback()
}

function octetsToInteger (octetsArray) {
  return new Buffer(octetsArray).readUInt32BE()
}
