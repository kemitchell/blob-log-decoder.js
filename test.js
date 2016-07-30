var Decoder = require('./')
var asyncMap = require('async.map')
var concatStream = require('concat-stream')
var crcHash = require('crc-hash')
var fs = require('fs')
var mktempd = require('temporary-directory')
var path = require('path')
var tape = require('tape')

tape('decode one blob', function (test) {
  mktempd(function (error, directory, cleanUp) {
    test.ifError(error)
    var filePath = path.join(directory, 'test.log')
    var write = fs.createWriteStream(filePath)
    var firstIndex = 1001
    var string = 'this is a test'
    write.write(intBuffer(firstIndex))
    write.end(blobBuffer(string), function () {
      fs.createReadStream(filePath)
      .pipe(
        new Decoder(filePath)
        .once('error', /* istanbul ignore next */ function (error) {
          test.ifError(error)
        })
        .once('data', function (chunk) {
          test.equal(chunk.index, firstIndex, 'chunk.index')
          test.equal(chunk.length, string.length, 'chunk.length')
          chunk.stream.pipe(concatStream(function (buffered) {
            test.equal(
              buffered.toString(), string,
              'same string out'
            )
          }))
          cleanUp()
          test.end()
        })
      )
    })
  })
})

tape('decode one big blob', function (test) {
  mktempd(function (error, directory, cleanUp) {
    test.ifError(error)
    var filePath = path.join(directory, 'test.log')
    var write = fs.createWriteStream(filePath)
    var firstIndex = 1
    var blobLength = 256 * 1000
    var blob = new Buffer(blobLength).fill(1)
    write.write(intBuffer(firstIndex))
    write.write(blobBuffer(blob))
    write.end(function () {
      fs.createReadStream(filePath)
      .pipe(
        new Decoder(filePath)
        .once('error', /* istanbul ignore next */ function (error) {
          test.ifError(error)
        })
        .once('data', function (chunk) {
          var receivedLength = 0
          chunk.stream
          .on('data', function (chunk) {
            receivedLength += chunk.length
          })
          .once('end', function () {
            test.equal(
              receivedLength, blobLength,
              blobLength + ' bytes'
            )
            cleanUp()
            test.end()
          })
        })
      )
    })
  })
})

tape('decode two blobs', function (test) {
  mktempd(function (error, directory, cleanUp) {
    test.ifError(error)
    var filePath = path.join(directory, 'test.log')
    var write = fs.createWriteStream(filePath)
    var firstIndex = 1001
    write.write(intBuffer(firstIndex))
    write.write(blobBuffer('a'))
    write.write(blobBuffer('b'))
    write.end(function () {
      var chunks = []
      fs.createReadStream(filePath)
      .pipe(
        new Decoder(filePath)
        .once('error', /* istanbul ignore next */ function (error) {
          test.ifError(error)
        })
        .on('data', function (chunk) {
          chunks.push(chunk)
        })
        .once('end', function () {
          asyncMap(chunks, concatenate, function (error, concatenated) {
            test.ifError(error)
            test.deepEqual(
              concatenated[0].index, firstIndex + 0,
              'first chunk index'
            )
            test.deepEqual(
              concatenated[0].buffer.toString(), 'a',
              'first chunk value'
            )
            test.deepEqual(
              concatenated[1].index, firstIndex + 1,
              'second chunk index'
            )
            test.deepEqual(
              concatenated[1].buffer.toString(), 'b',
              'second chunk value'
            )
            cleanUp()
            test.end()
          })
          function concatenate (chunk, done) {
            chunk.stream.pipe(concatStream(function (buffer) {
              chunk.buffer = buffer
              done(null, chunk)
            }))
          }
        })
      )
    })
  })
})

tape('decode a hundred tiny blobs', function (test) {
  mktempd(function (error, directory, cleanUp) {
    test.ifError(error)
    var filePath = path.join(directory, 'test.log')
    var write = fs.createWriteStream(filePath)
    var firstIndex = 1001
    write.write(intBuffer(firstIndex))
    for (var index = 0; index < 100; index++) {
      write.write(blobBuffer(index.toString()))
    }
    write.end(function () {
      var chunks = []
      fs.createReadStream(filePath)
      .pipe(
        new Decoder(filePath)
        .once('error', /* istanbul ignore next */ function (error) {
          test.ifError(error)
        })
        .on('data', function (chunk) {
          chunks.push(chunk)
        })
        .once('end', function () {
          test.equal(
            chunks.length, 100,
            'read 100 chunks'
          )
          cleanUp()
          test.end()
        })
      )
    })
  })
})

function blobBuffer (content) {
  var buffer = new Buffer(4 + 4 + content.length)
  buffer.writeUInt32BE(content.length, 0)
  buffer.writeUInt32BE(
    crcHash.createHash('crc32')
    .update(content)
    .digest()
    .readUInt32BE(),
    4
  )
  var from = Buffer.isBuffer(content)
  ? content
  : new Buffer(content, 'ascii')
  from.copy(buffer, 8)
  return buffer
}

function intBuffer (int) {
  var buffer = new Buffer(4)
  buffer.writeUInt32BE(int)
  return buffer
}
