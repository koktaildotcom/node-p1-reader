const EventEmitter = require('events');
const util = require('util');
let serialPort = require('serialport');

let serialPortUsed = false;
let availablePorts = [];
let constructor;
let timer;
let crcCheckRequired = false;

const checkCrc = require('./lib/checkCrc');
const parsePacket = require('./lib/parsePacket');
const debug = require('./lib/debug');
const config = require('./config/config.json');

function P1Reader(options) {
    if (typeof options !== 'object') {
      options = {};
    }

    debug.setDebugMode(options.debug);

    if (options.emulator) {
        serialPort = require('./lib/emulateSerialport');
        serialPort.setEmulatorOverrides(options.emulatorOverrides);
    }

    if (options.crcCheckRequired) {
        crcCheckRequired = options.crcCheckRequired;
    }

    constructor = this;

    EventEmitter.call(this);

    // Either force a specific port (with specific configuration) or automatically discover it
    if (options && options.serialPort) {
        autodiscoverList[0] = {
            port: options.serialPort.port,
            baudRate: options.serialPort.baudRate,
            parity: options.serialPort.parity,
            dataBits: options.serialPort.dataBits,
            stopBits: options.serialPort.stopBits
        };

        _setupSerialConnection();
    } else {
        serialPort.list()
            .then(ports => {
                // Create the auto discovery list with each of the possible serialport configurations per port found
                for (let i = 0; i < ports.length; i++) {
                    for (let j = 0; j < config.serialPort.length; j++) {
                        autodiscoverList.push({
                            port: ports[i].comName,
                            baudRate: config.serialPort[j].baudRate,
                            parity: config.serialPort[j].parity,
                            dataBits: config.serialPort[j].dataBits,
                            stopBits: config.serialPort[j].stopBits
                        });
                    }
                }

                debug.logAutodiscoverList(autodiscoverList);

                _setupSerialConnection();
            })
            .catch(err => {
                console.error('Serialports could not be listed: ' + err);
            });
    }
}

util.inherits(P1Reader, EventEmitter);

/**
 * Retrieve the name of the serial port being used
 */
P1Reader.prototype.getSerialPort = function () {
    return serialPortUsed;
};

module.exports = P1Reader;

/**
 * Setup serial port connection
 */
function _setupSerialConnection() {
    const currentPortConfig = autodiscoverList[0];

    debug.log('Trying to connect to Smart Meter via port: ' + currentPortConfig.port
        + ' (BaudRate: ' + currentPortConfig.baudRate + ', Parity: ' + currentPortConfig.parity + ', Databits: '
        + currentPortConfig.dataBits + 'Stopbits: ' + currentPortConfig.stopBits + ')');

    // Go to the next port if this one didn't respond within the timeout limit
    timer = setTimeout(() => {
        if (!serialPortUsed) {
            _tryNextSerialPort();
        }
    }, config.connectionSetupTimeout);

    // Open serial port connection
    const sp = new serialPort(currentPortConfig.port, {
        baudRate: currentPortConfig.baudRate,
        parity: currentPortConfig.parity,
        dataBits: currentPortConfig.dataBits,
        stopBits: currentPortConfig.stopBits
    });

    let received = '';

    sp.on('open', () => {
        debug.log('Serial connection established');

        sp.on('data', (data) => {
            received += data.toString();

            const startCharPos = received.indexOf(config.startCharacter);
            const endCharPos = received.indexOf(config.stopCharacter);

            if (endCharPos >= 0 && endCharPos < startCharPos) {
                received = received.substr(endCharPos + 1);
                startCharPos = -1;
                endCharPos = -1;
            }

            // Package is complete if the start- and stop character are received
            const crcReceived = endCharPos >= 0 && received.length > endCharPos + 4;
            if (startCharPos >= 0 && endCharPos >= 0 && crcReceived) {
                const packet = received.substr(startCharPos, endCharPos - startCharPos);
                const expectedCrc = parseInt(received.substr(endCharPos + 1, 4), 16);
                received = received.substr(endCharPos + 5);

                var crcOk = true;
                if (crcCheckRequired) {
                    crcOk = checkCrc(packet + '!', expectedCrc);
                }

                if (crcOk) {
                    const parsedPacket = parsePacket(packet);

                    // Verify if connected to the correct serial port at initialization
                    if (!serialPortUsed) {
                        if (parsedPacket.timestamp !== null) {
                            debug.log('Connection with Smart Meter established');
                            serialPortUsed = currentPortConfig.port;

                            constructor.emit('connected', currentPortConfig);
                        } else {
                            _tryNextSerialPort();
                        }
                    }

                    debug.writeToLogFile(packet, parsedPacket);

                    constructor.emit('reading-raw', packet);

                    if (parsedPacket.timestamp !== null) {
                        constructor.emit('reading', parsedPacket);
                    } else {
                        constructor.emit('error', 'Invalid reading');
                    }
                } else {
                    constructor.emit('error', 'Invalid CRC');
                }
            }
        });
    });

    sp.on('error', (error) => {
        // Reject this port if we haven't found the correct port yet
        if (!serialPortUsed) {
            _tryNextSerialPort();
        } else {
            // Only emit errors after we have established a connection with the Smart Meter
            debug.log('Error emitted: ' + error);

            constructor.emit('error', error);
        }
    });

    sp.on('close', () => {
        constructor.emit('close');
    });
}

/**
 * Try the next serial port if available
 */
function _tryNextSerialPort() {
    clearTimeout(timer);
    autodiscoverList.shift();

    if (autodiscoverList.length > 0) {
        debug.log('Smart Meter not found yet, trying another port / configuration...');
        _setupSerialConnection();
    } else {
        console.error('Could not find a Smart Meter');
    }
}
