const fs = require('fs');
const config = require('../config/config.json');

let debugMode = false;

/**
 * Set the debug mode
 *
 * @param mode : Debug mode boolean
 */
function setDebugMode(mode) {
    debugMode = mode || false;

    if (debugMode) {
        console.log(_printDatetime() + 'DEBUG MODE ENABLED');
    }
}

/**
 * Log message to console when debug mode is enabled
 *
 * @param message : Log message
 */
function log(message) {
    if (!debugMode) { return; }

    console.log(_printDatetime() + message);
}

/**
 * Write raw and parsed data to log file for debugging purposes
 *
 * @param rawPacket : Raw packet as received via the serial port
 * @param parsedPacket : Parsed packet object
 */
function writeToLogFile(rawPacket, parsedPacket) {
    if (!debugMode) { return; }

    var now = new Date().toUTCString();

    fs.appendFile(config.debugRawDataFile, 'Package received at ' + now + ':\n' + rawPacket + '\n\n', err => {
        if (err) {
            console.error(_printDatetime() + 'Could not write raw package to ' + config.debugRawDataFile);
        }
    });

    fs.appendFile(config.debugParsedDataFile, 'Package received at ' + now + ':\n' + JSON.stringify(parsedPacket, true, 4) + '\n\n', err => {
        if (err) {
            console.error(_printDatetime() + 'Could not write parsed package to ' + config.debugParsedDataFile);
        }
    });
}

/**
 * Print list of available ports to log
 *
 * @param ports : array containing objects with details of the serial ports
 */
function logAutodiscoverList(list) {
    if (!debugMode) { return; }

    console.log(_printDatetime() + 'Available serial ports with possible configurations: \n' + JSON.stringify(list, true, 4));
}

/**
 * Util function to print the current datetime in format [YYYYMMDD:HH:MM:SS]
 */
function _printDatetime() {
    let now = new Date();
    return '[' + now.toISOString() + '] ';
}

module.exports.setDebugMode = setDebugMode;
module.exports.log = log;
module.exports.writeToLogFile = writeToLogFile;
module.exports.logAutodiscoverList = logAutodiscoverList;