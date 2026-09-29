/* 只从 docx 取出正文，丢掉字体、颜色和图片。 */
(function () {
  "use strict";

  function readBytes(file) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onload = function () { resolve(new Uint8Array(reader.result)); };
      reader.onerror = function () { reject(new Error("读不到这个文件")); };
      reader.readAsArrayBuffer(file);
    });
  }

  function u16(bytes, offset) {
    return bytes[offset] | (bytes[offset + 1] << 8);
  }

  function u32(bytes, offset) {
    return (bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16) | (bytes[offset + 3] << 24)) >>> 0;
  }

  function findEOCD(bytes) {
    var start = Math.max(0, bytes.length - 22 - 65535);
    for (var i = bytes.length - 22; i >= start; i--) {
      if (u32(bytes, i) === 0x06054b50) return i;
    }
    return -1;
  }

  function inflate(bytes) {
    if (typeof DecompressionStream === "undefined") return Promise.reject(new Error("这台设备解不开 docx"));
    var stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
    return new Response(stream).arrayBuffer().then(function (buffer) {
      return new Uint8Array(buffer);
    });
  }

  function decode(bytes) {
    return new TextDecoder("utf-8").decode(bytes);
  }

  function entryName(bytes, offset, length) {
    var name = "";
    for (var i = 0; i < length; i++) name += String.fromCharCode(bytes[offset + i]);
    return name;
  }

  function documentXml(bytes) {
    var eocd = findEOCD(bytes);
    if (eocd < 0) return Promise.reject(new Error("这不是 docx"));
    var count = u16(bytes, eocd + 10);
    var offset = u32(bytes, eocd + 16);
    var found = null;
    for (var n = 0; n < count; n++) {
      if (offset + 46 > bytes.length || u32(bytes, offset) !== 0x02014b50) break;
      var method = u16(bytes, offset + 10);
      var compressed = u32(bytes, offset + 20);
      var size = u32(bytes, offset + 24);
      var nameLength = u16(bytes, offset + 28);
      var extraLength = u16(bytes, offset + 30);
      var commentLength = u16(bytes, offset + 32);
      var local = u32(bytes, offset + 42);
      var name = entryName(bytes, offset + 46, nameLength);
      if (name === "word/document.xml") {
        found = { method: method, compressed: compressed, size: size, local: local };
      }
      offset += 46 + nameLength + extraLength + commentLength;
    }
    if (!found) return Promise.reject(new Error("这份 docx 没有正文"));
    var nameLength = u16(bytes, found.local + 26);
    var extraLength = u16(bytes, found.local + 28);
    var start = found.local + 30 + nameLength + extraLength;
    var data = bytes.slice(start, start + found.compressed);
    if (found.method === 0) return Promise.resolve(decode(data));
    if (found.method !== 8) return Promise.reject(new Error("这份 docx 的压缩方式认不出"));
    return inflate(data).then(decode);
  }

  function textFromDocx(file) {
    return readBytes(file).then(documentXml).then(function (xml) {
      return SG.docxXmlToText(xml);
    });
  }

  var root = typeof globalThis !== "undefined" ? globalThis : window;
  root.SGDocx = { textFromDocx: textFromDocx };
})();
