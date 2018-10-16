var EventEmitter = require('events');
var util = require('util');
var config = require('../config/config.json');

var electricityReceivedTariff1 = 0;
var electricityReceivedActual = 0.100;
var gasReading = 0;
var gasIncrementValue = 0.100;
var gasLastIncrement = Date.now();
var interval = config.emulatorIntervalInSeconds * 1000;
var intervalGas = config.emulatorIntervalGasInSeconds * 1000;

/**
 * Emulate a subset of the features of the serialport module
 *
 * @param {string} path - Path to the serial port to open
 * @param {Object} options - Port configuration options
 * @param {function} callback - Called when a connection is opened
 * @emits #open - triggered after a short delay to mimic connection setup
 * @emits #data - triggered every x seconds (set via configuration)
 */
function EmulateSerialport(path, options, callback) {
    var constructor = this;

    EventEmitter.call(this);

    // Delay the opening of a connection so the listeners have time to initiate before the event is emitted
    setTimeout(() => {
        constructor.emit('open');
    }, 500);

    // Start sending data
    setInterval(() => {
        var nextValues = _calculateIncrementedValues();

        var packet = _createSerialPacket(
            _convertDatetimeString(nextValues.timestamp),
            nextValues.electricityReceivedTariff1,
            nextValues.electricityReceivedActual,
            _convertDatetimeString(nextValues.gasTimestamp),
            nextValues.gasReading
        );

        for(var i = 0; i < packet.length; i++) {
            constructor.emit('data', packet[i]);
        }
    }, interval);
}

util.inherits(EmulateSerialport, EventEmitter);

/**
 * Emulate listing all available serial ports
 *
 * @param {function} callback - Callback function with parameters "error" and "ports"
 */
EmulateSerialport.list = function () {
    return new Promise(function (resolve, reject) {
        var ports = [{"comName": "/dev/emulator"}];
        resolve(ports);
    });
};

/**
 * Override emulator defaults
 *
 * @param {Object} options - Object containing possible overrides
 * @param {number} options.electricityOffset - Override the starting value of electricity on tariff 1 in kWh
 * @param {number} options.electricityIncrement - Override the incremental value (every x seconds) of electricity on tariff 1 in kW
 * @param {number} options.gasOffset - Override the starting value of gas in m3
 * @param {number} options.gasIncrement - Override the incremental value (every x seconds, set via configuration) of gas in m3
 * @param {number} options.interval - Override the interval (in seconds) in which readings are emitted
 * @param {number} options.intervalGas - Override the interval (in seconds) in which the gas reading is incremented
 */
EmulateSerialport.setEmulatorOverrides = function (options) {
    if (options) {
        if (options.electricityOffset) {
            electricityReceivedTariff1 = options.electricityOffset;
        }

        if (options.electricityIncrement) {
            electricityReceivedActual = options.electricityIncrement;
        }

        if (options.gasOffset) {
            gasReading = options.gasOffset;
        }

        if (options.gasIncrement) {
            gasIncrementValue = options.gasIncrement;
        }

        if (options.interval) {
            interval = options.interval * 1000;
        }

        if (options.intervalGas) {
            intervalGas = options.intervalGas * 1000;
        }
    }
};


module.exports = EmulateSerialport;


/**
 * Calculating the incremented values for creating the next packet
 *
 * @return {Object}
 */
function _calculateIncrementedValues() {
    var output = {};
    var now = Date.now();

    output.timestamp = now;
    output.electricityReceivedTariff1 = electricityReceivedTariff1 + electricityReceivedActual;
    electricityReceivedTariff1 = output.electricityReceivedTariff1;
    output.electricityReceivedActual = electricityReceivedActual;

    if ((now - gasLastIncrement) > intervalGas) {
        output.gasTimestamp = now;
        output.gasReading = gasReading + gasIncrementValue;
        gasReading = output.gasReading;
        gasLastIncrement = now;
    } else {
        output.gasTimestamp = gasLastIncrement;
        output.gasReading = gasReading;
    }

    return output;
}

/**
 * Create an array containing a serial port packet
 *
 * @param {string} timestamp - Timestamp of the packet in format: YYMMDDhhmmssX
 * @param {number} electricityReceivedTariff1 - Electricity received total on tariff 1 in kWh
 * @param {number} electricityReceivedActual - Electricity received actual in kW
 * @param {string} gasTimestamp - Timestamp of the last hourly gas reading in format: YYMMDDhhmmssX
 * @param {number} gasReading - Gas received actual in M3
 * @return {string[]} Containing the lines of an serial message as a string (first/last line contain the start/end characters resp.)
 */
function _createSerialPacket(timestamp, electricityReceivedTariff1, electricityReceivedActual, gasTimestamp, gasReading) {
    var packet = Array();

    packet.push('/EMULATOR\n');
    packet.push('1-3:0.2.8(10)\n');
    packet.push('0-0:1.0.0(' + timestamp + ')\n');
    packet.push('0-0:96.1.1(1234567890123456789012345678901234)\n');
    packet.push('1-0:1.8.1(' + electricityReceivedTariff1.toFixed(3) + '*kWh)\n');
    packet.push('1-0:1.8.2(000000.000*kWh)\n');
    packet.push('1-0:2.8.1(000000.000*kWh)\n');
    packet.push('1-0:2.8.2(000000.000*kWh)\n');
    packet.push('0-0:96.14.0(0001)\n');
    packet.push('1-0:1.7.0(' + electricityReceivedActual.toFixed(3) + '*kW)\n');
    packet.push('1-0:2.7.0(00.000*kW)\n');
    packet.push('0-0:96.7.21(00001)\n');
    packet.push('0-0:96.7.9(00002)\n');
    packet.push('1-0:99.97.0(1)(0-0:96.7.19)(000101000014W)(1000*s)\n');
    packet.push('1-0:32.32.0(00000)\n');
    packet.push('1-0:52.32.0(00000)\n');
    packet.push('1-0:72.32.0(00000)\n');
    packet.push('1-0:32.36.0(00000)\n');
    packet.push('1-0:52.36.0(00000)\n');
    packet.push('1-0:72.36.0(00000)\n');
    packet.push('0-0:96.13.1()\n');
    packet.push('0-0:96.13.0()\n');
    packet.push('1-0:31.7.0(001*A)\n');
    packet.push('1-0:51.7.0(002*A)\n');
    packet.push('1-0:71.7.0(003*A)\n');
    packet.push('1-0:21.7.0(00.001*kW)\n');
    packet.push('1-0:22.7.0(00.004*kW)\n');
    packet.push('1-0:41.7.0(00.002*kW)\n');
    packet.push('1-0:42.7.0(00.005*kW)\n');
    packet.push('1-0:61.7.0(00.003*kW)\n');
    packet.push('1-0:62.7.0(00.006*kW)\n');
    packet.push('0-1:24.1.0(003)\n');
    packet.push('0-1:96.1.0(2345678901234567890123456789012345)\n');
    packet.push('0-1:24.2.1(' + gasTimestamp + ')(' + gasReading.toFixed(3) + '*m3)!');

    return packet;
}

/**
 * Format a datetime string to the format that is used by the Smart Meter according to the DSMR 4.0 specification
 *
 * @param {string} datetime - string containing a date and time that is accepted by Date()
 * @return {string} Date string in format: YYMMDDhhmmssX
 */
function _convertDatetimeString(datetime) {
    var timestamp = new Date(datetime);
    var output = '';

    output += (timestamp.getFullYear()).toString().substring(2, 4);
    output += ('0' + (timestamp.getMonth() + 1)).slice(-2); // Add leading zero
    output += ('0' + timestamp.getDate()).slice(-2); // Add leading zero
    output += ('0' + timestamp.getHours()).slice(-2); // Add leading zero
    output += ('0' + timestamp.getMinutes()).slice(-2); // Add leading zero
    output += ('0' + timestamp.getSeconds()).slice(-2); // Add leading zero
    output += 'W';

    return output;
}
