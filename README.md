## Usage

```javascript
var Decoder = require('blob-log-decoder')
var fs = require('fs')

fs.createReadStream(path)
.pipe(new Decoder())
.on('data', function (blob) {
  // blob.index (Number)
  // blob.length (Number)
  // blob.crc (Number)
  // blob.stream (Readable)
})
.once('end', function () {
  // ...
})
```

_Note_: The decoder will not check CRC-32s or lengths against blob
data for you.  You may wish to:

```javascript
var crcHash = require('crc-hash')
var assert = require('assert')

decoder.on('data', function (blob) {
  var expectedCRC = blob.crc
  var expectedLength = blob.length
  var crc = crcHash.createHash('crc32')
  var length = 0
  var buffer = []
  blob.stream
  .on('data', function (chunk) {
    length += chunk.length
    crc.update(chunk)
  })
  .once('end', function () {
    assert.equal(crc.digest().readUInt32BE(), expectedCRC)
    assert.equal(length, expectedLength)
  })
})
```

## Writing

[blob-log-encoder] and [stream-to-blob-log] are packages for writing
blob to blob-log files.

[blob-log-encoder]: https://www.npmjs.com/package/blob-log-encoder

[stream-to-blob-log]: https://www.npmjs.com/package/stream-to-blob-log

## File Format

blob-log log files consist of an integer equal to the sequence number
of the first blob in the file, followed by one or more blob records.
Each blob record consists of:

1. an integer equal to a CRC-32 error-correcting code for the blob

2. an integer equal to the number of bytes in the blob

3. the blob's bytes

All integers are big-endian, unsigned, and 32 bits long.
