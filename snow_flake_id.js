const fs = require("fs");
const os = require("os");
const { promisify } = require("util");
const { createHash } = require("crypto");

const EPOCH = 1620219600000n; // May 5, 2021
const MAX_WORKERS = 256n; // 8 bits
const MAX_DATACENTERS = 16n; // 4 bits
const MAX_SEQUENCE = 4096n; // 12 bits

let lastTimestamp = 0n;
let sequence = 0n;
let lastId = 0n; // initialize to 0 instead of null

const workerId = getWorkerId();
const datacenterId = getDatacenterId();

const generateSnowflake = async () => {
  let timestamp = BigInt(Date.now()) - EPOCH;

  if (timestamp < lastTimestamp) {
    timestamp = lastTimestamp;
  }

  if (timestamp === lastTimestamp) {
    sequence = (sequence + 1n) % MAX_SEQUENCE;
    if (sequence === 0n) {
      // sequence overflowed, wait until next millisecond
      await waitUntilNextMillisecond(lastTimestamp);
      timestamp = lastTimestamp + 1n;
    }
  } else {
    sequence = 0n;
  }

  lastTimestamp = timestamp;

  const id =
    ((timestamp & 0x1ffffffffffn) << 22n) |
    ((datacenterId & (MAX_DATACENTERS - 1n)) << 18n) |
    ((workerId & (MAX_WORKERS - 1n)) << 10n) |
    (sequence & 0x3ffn);

  // Store the last ID generated in a file
  lastId = id;
  await promisify(fs.writeFile)("./lastId.txt", lastId.toString(), "utf8");

  return id.toString();
};

async function waitUntilNextMillisecond(lastTimestamp) {
  let timestamp = BigInt(Date.now()) - EPOCH;
  while (timestamp <= lastTimestamp) {
    timestamp = BigInt(Date.now()) - EPOCH;
  }
  lastTimestamp = timestamp;
}

function getWorkerId() {
  // Use the hostname to generate a unique worker ID
  const hostname = os.hostname();
  const hash = createHash("sha1").update(hostname).digest("hex");
  return BigInt(parseInt(hash.slice(-6), 16)) % MAX_WORKERS;
}

function getDatacenterId() {
  // Use the IP address to generate a unique datacenter ID
  const interfaces = os.networkInterfaces();
  let ip = null;
  for (const name in interfaces) {
    const iface = interfaces[name];
    for (const info of iface) {
      if (info.family === "IPv4" && !info.internal) {
        ip = info.address;
        break;
      }
    }
    if (ip) break;
  }
  if (!ip) {
    throw new Error("Unable to determine IP address");
  }
  const hash = createHash("sha1").update(ip).digest("hex");
  return BigInt(parseInt(hash.slice(-4), 16)) % MAX_DATACENTERS;
}
// this is just for test purpose only in real world you sould need to store last id in a database
async function getLastId() {
  try {
    const data = await promisify(fs.readFile)("./lastId.txt", "utf8");
    return BigInt(data);
  } catch (error) {
    return null;
  }
}

module.exports = generateSnowflake;
