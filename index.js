var PassThrough = require('readable-stream').PassThrough
var Transform = require('readable-stream').Transform
var asyncEach = require('async.each')
var inherits = require('util').inherits

module.exports = Decoder

function Decoder () {
  if (!(this instanceof Decoder)) {
    return new Decoder()
  }

  this._firstIndexOctets = []
  this._firstIndex = false
  this._blobsEmitted = 0

  Transform.call(this, {readableObjectMode: true})
}

inherits(Decoder, Transform)

var prototype = Decoder.prototype

prototype._resetCurrentBlob = function (index) {
  this._currentBlob = {
    index: this._firstIndex + this._blobsEmitted,
    length: false,
    lengthOctets: [],
    bytesToRead: false,
    crc: false,
    crcOctets: [],
    stream: new PassThrough(),
    pressingBack: false
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
    if (!this._firstIndex) {
      var indexOctets = this._firstIndexOctets
      indexOctets.push(chunk[offset])
      if (indexOctets.length === 4) {
        this._firstIndex = new Buffer(indexOctets).readUInt32BE()
        delete this._firstIndexOctets
      }
      offset++
    } else {
      // Create fresh state for a new blob.
      if (blob === undefined || blob.bytesToRead === 0) {
        this._resetCurrentBlob()
        blob = this._currentBlob
      }
      // Read the length of this blob.
      if (!blob.length) {
        var lengthOctets = blob.lengthOctets
        lengthOctets.push(chunk[offset])
        if (lengthOctets.length === 4) {
          var length = new Buffer(lengthOctets).readUInt32BE()
          blob.length = length
          blob.bytesToRead = length
          delete blob.lengthOctets
        }
        offset++
      // Read the CRC.
      } else if (!blob.crc) {
        var crcOctets = blob.crcOctets
        crcOctets.push(chunk[offset])
        if (crcOctets.length === 4) {
          blob.crc = new Buffer(crcOctets).readUInt32BE()
          delete blob.crcOctets
          this._emit()
        }
        offset++
      // Read blob data.
      } else {
        var index = blob.index
        var dataChunk = chunk.slice(offset, offset + blob.bytesToRead)
        if (toWrite[index] === undefined) {
          toWrite[index] = {
            blob: blob,
            chunks: []
          }
        }
        toWrite[index].chunks.push(dataChunk)
        var bytesSliced = dataChunk.length
        blob.bytesToRead -= bytesSliced
        offset += bytesSliced
      }
    }
  }

  var indices = Object.keys(toWrite)
  if (indices.length === 0) {
    callback()
  } else {
    asyncEach(indices, writeQueuedChunks, callback)
  }

  function writeQueuedChunks (index, done) {
    var element = toWrite[index]
    var queue = element.chunks
    var blob = element.blob
    asyncEach(
      queue,
      function (chunk, done) {
        if (blob.pushingBack) {
          blob.stream.once('drain', function () {
            write(done)
          })
        } else {
          write(done)
        }
        function write (done) {
          var readyForMore = blob.stream.write(chunk)
          blob.pushingBack = !readyForMore
          if (!readyForMore) {
            blob.stream.once('drain', function () {
              blob.pushingBack = false
            })
          }
          done()
        }
      },
      function (error) {
        if (error) {
          done(error)
        } else {
          if (blob.bytesToRead === 0) {
            blob.stream.end()
          }
          done()
        }
      }
    )
  }
}
