var EventEmitter = require('events');
var util = require('util');
var serialPort = require('serialport');

var serialPortUsed = false;
var availablePorts = [];
var constructor;
var timer;
var crcCheckRequired = false;

const checkCrc = require('./lib/checkCrc');
var parsePacket = require('./lib/parsePacket');
var debug = require('./lib/debug');
var config = require('./config/config.json');

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

    // Either force a specific port or automatically discover it
    if (options && options.serialPort) {
        availablePorts[0] = options.serialPort;
        _setupSerialConnection();
    } else {
        serialPort.list(function (err, ports) {
            if (err) {
                throw new Error('Serialports could not be listed: ' + err);
            }

            debug.logAvailablePorts(ports);

            for (var i = 0; i < ports.length; i++) {
                availablePorts[i] = ports[i].comName;
            }

            _setupSerialConnection();
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
    var port = availablePorts[0];

    debug.log('Trying to connect to Smart Meter via port: ' + port);

    // Go to the next port if this one didn't respond within the timeout limit
    timer = setTimeout(function() {
        if (!serialPortUsed) {
            _tryNextSerialPort();
        }
    }, config.connectionSetupTimeout);

    // Open serial port connection
    var sp = new serialPort(port, config.serialPort);

    var received = '';

    sp.on('open', function () {
        debug.log('Serial connection established');

        sp.on('data', function (data) {
            received += data.toString();

            var startCharPos = received.indexOf(config.startCharacter);
            var endCharPos = received.indexOf(config.stopCharacter);

            // Package is complete if the start- and stop character are received
            const crcReceived = endCharPos >= 0 && received.length > endCharPos + 4;
            if (startCharPos >= 0 && endCharPos >= 0 && (!crcCheckRequired || crcReceived)) {
                var packet = received.substr(startCharPos, endCharPos - startCharPos);
                var crcOk = true;
                if (crcCheckRequired) {
                    const expectedCrc = parseInt(received.substr(endCharPos + 1, 4), 16);
                    crcOk = checkCrc(packet + '!', expectedCrc);
                }
                received = '';

                if (crcOk) {
                    var parsedPacket = parsePacket(packet);

                    // Verify if connected to the correct serial port at initialization
                    if (!serialPortUsed) {
                        if (parsedPacket.timestamp !== null) {
                            debug.log('Connection with Smart Meter established');
                            serialPortUsed = port;

                            constructor.emit('connected', port);
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

    sp.on('error', function (error) {
        constructor.emit('error', error);

        // Reject this port if we haven't found the correct port yet
        if (!serialPortUsed) {
            _tryNextSerialPort();
        }
    });

    sp.on('close', function () {
        constructor.emit('close');
    });
}

/**
 * Try the next serial port if available
 */
function _tryNextSerialPort() {
    clearTimeout(timer);
    availablePorts.shift();

    if (availablePorts.length > 0) {
        debug.log('Smart Meter not attached to this port, trying another...');
        _setupSerialConnection();
    } else {
        throw new Error('Could not find an attached Smart Meter');
    }
}
