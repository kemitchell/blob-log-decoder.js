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

## File Format

blob-log log files consist of an integer equal to the sequence number
of the first blob in the file, followed by one or more blob records.
Each blob record consists of:

1. an integer equal to a CRC-32 error-correcting code for the blob

2. an integer equal to the number of bytes in the blob

3. the blob's bytes

All integers are big-endian, unsigned, and 32 bits long.
