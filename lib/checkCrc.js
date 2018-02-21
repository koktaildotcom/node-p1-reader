const crc = require('crc');

function checkCrc(rawPacket, expectedCrc) {
    const actualCrc = crc.crc16(rawPacket);
    return actualCrc === expectedCrc;
}

module.exports = checkCrc;