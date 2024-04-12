export function getByteLengthFromScanType(
  scanType: string,
  value: string
): number {
  switch (scanType) {
    case "int8":
    case "uint8":
      return 1;
    case "int16":
    case "uint16":
      return 2;
    case "int32":
    case "uint32":
    case "float":
      return 4;
    case "int64":
    case "uint64":
    case "double":
      return 8;
    case "utf-8":
    case "utf-16":
    case "aob":
    case "regex":
      return value.length / 2;
    default:
      throw new Error("Unknown scan type");
  }
}

export function arrayBufferToLittleEndianHexString(
  buffer: ArrayBuffer
): string {
  const view = new DataView(buffer);
  const hexString = Array.from(new Uint8Array(buffer))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
  return hexString;
}

function encodeStringToUtf16LEHex(str: string) {
  const buffer = new ArrayBuffer(str.length * 2);
  const view = new DataView(buffer);

  for (let i = 0; i < str.length; i++) {
    view.setUint16(i * 2, str.charCodeAt(i), true);
  }

  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export function convertFromLittleEndianHex(hex: string, type: string) {
  try {
    const buffer = new ArrayBuffer(hex.length / 2);
    const view = new DataView(buffer);

    hex.match(/.{1,2}/g)?.forEach((byte, i) => {
      view.setUint8(i, parseInt(byte, 16));
    });

    switch (type) {
      case "int8":
        return view.getInt8(0);
      case "uint8":
        return view.getUint8(0);
      case "int16":
        return view.getInt16(0, true);
      case "uint16":
        return view.getUint16(0, true);
      case "int32":
        return view.getInt32(0, true);
      case "uint32":
        return view.getUint32(0, true);
      case "int64":
        return view.getBigInt64(0, true).toString();
      case "uint64":
        return view.getBigUint64(0, true).toString();
      case "float":
        return view.getFloat32(0, true);
      case "double":
        return view.getFloat64(0, true);
      case "utf-8":
        return new TextDecoder().decode(view);
      case "utf-16":
        const utf16 = new Uint16Array(buffer);
        return String.fromCharCode.apply(null, Array.from(utf16));
      case "aob":
        return hex;
      case "regex":
        return new TextDecoder().decode(view);
      default:
        return hex;
    }
  } catch (errror) {
    return "????????";
  }
}

export function convertToLittleEndianHex(value: string, type: string) {
  let buffer: ArrayBuffer;
  let view: DataView;

  switch (type) {
    case "int8":
      buffer = new ArrayBuffer(1);
      view = new DataView(buffer);
      view.setInt8(0, parseInt(value, 10));
      break;
    case "uint8":
      buffer = new ArrayBuffer(1);
      view = new DataView(buffer);
      view.setUint8(0, parseInt(value, 10));
      break;
    case "int16":
      buffer = new ArrayBuffer(2);
      view = new DataView(buffer);
      view.setInt16(0, parseInt(value, 10), true);
      break;
    case "uint16":
      buffer = new ArrayBuffer(2);
      view = new DataView(buffer);
      view.setUint16(0, parseInt(value, 10), true);
      break;
    case "int32":
      buffer = new ArrayBuffer(4);
      view = new DataView(buffer);
      view.setInt32(0, parseInt(value, 10), true);
      break;
    case "uint32":
      buffer = new ArrayBuffer(4);
      view = new DataView(buffer);
      view.setUint32(0, parseInt(value, 10), true);
      break;
    case "int64":
      buffer = new ArrayBuffer(8);
      view = new DataView(buffer);
      view.setBigInt64(0, BigInt(value), true);
      break;
    case "uint64":
      buffer = new ArrayBuffer(8);
      view = new DataView(buffer);
      view.setBigUint64(0, BigInt(value), true);
      break;
    case "float":
      buffer = new ArrayBuffer(4);
      view = new DataView(buffer);
      view.setFloat32(0, parseFloat(value), true);
      break;
    case "double":
      buffer = new ArrayBuffer(8);
      view = new DataView(buffer);
      view.setFloat64(0, parseFloat(value), true);
      break;
    case "utf-8":
      return Array.from(new TextEncoder().encode(value))
        .map((charCode) => charCode.toString(16).padStart(2, "0"))
        .join("");
    case "utf-16":
      return encodeStringToUtf16LEHex(value);
    case "aob":
      return value.replace(/\s+/g, "");
    case "regex":
      return value;
    default:
      return value;
  }

  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
