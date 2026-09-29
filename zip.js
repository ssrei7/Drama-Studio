/* 只打包几个文本文件。不压缩，手机浏览器也能直接生成。 */
(function () {
  "use strict";

  function bytes(text) {
    return new TextEncoder().encode(String(text || ""));
  }

  function u16(value) {
    return [value & 255, (value >> 8) & 255];
  }

  function u32(value) {
    return [value & 255, (value >> 8) & 255, (value >> 16) & 255, (value >> 24) & 255];
  }

  function crc32(data) {
    var table = crc32.table;
    if (!table) {
      table = [];
      for (var n = 0; n < 256; n++) {
        var c = n;
        for (var k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
        table[n] = c >>> 0;
      }
      crc32.table = table;
    }
    var crc = 0xffffffff;
    for (var i = 0; i < data.length; i++) crc = table[(crc ^ data[i]) & 255] ^ (crc >>> 8);
    return (crc ^ 0xffffffff) >>> 0;
  }

  function zip(files) {
    var parts = [];
    var central = [];
    var offset = 0;
    files.forEach(function (file) {
      var name = bytes(file.name);
      var data = bytes(file.text);
      var crc = crc32(data);
      var local = [].concat(
        u32(0x04034b50), u16(20), u16(0), u16(0), u16(0), u16(0),
        u32(crc), u32(data.length), u32(data.length), u16(name.length), u16(0)
      );
      parts.push(new Uint8Array(local), name, data);
      var entry = [].concat(
        u32(0x02014b50), u16(20), u16(20), u16(0), u16(0), u16(0), u16(0),
        u32(crc), u32(data.length), u32(data.length), u16(name.length), u16(0), u16(0), u16(0), u16(0), u32(0), u32(offset)
      );
      central.push(new Uint8Array(entry), name);
      offset += local.length + name.length + data.length;
    });
    var centralSize = central.reduce(function (sum, part) { return sum + part.length; }, 0);
    var end = [].concat(u32(0x06054b50), u16(0), u16(0), u16(files.length), u16(files.length), u32(centralSize), u32(offset), u16(0));
    return new Blob(parts.concat(central).concat([new Uint8Array(end)]), { type: "application/zip" });
  }

  var root = typeof globalThis !== "undefined" ? globalThis : window;
  root.SGZip = { zip: zip };
})();
