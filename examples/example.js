var P1Reader = require('../main')

const fs = require('fs')
const fetch = require('node-fetch')

/**
 * 1: Goto: http://developer.athom.com
 * 2: Login
 * 3: Open the inspector (chrome f12)
 * 4: Click the `network` tab
 * 5: Refresh the page
 * 6: Copy the id from the url: https://[localId].homey.homeylocal.com/api/manager/system/ping?id=[homeyId]
 */
const homeyId = '41--------------------2c'
const homeyEndpoint = '/update'
const homeyHost = 'https://' + homeyId + '.connect.athom.com/api/app/com.p1' + homeyEndpoint
const config = {}

// Enable Debug Mode by uncommenting the line below
config.debug = true

// Force a specific serial port configuration (instead of auto discovery) by uncommenting the lines below
// config.serialPort = {
//     "port": '/dev/tty-usbserial1'
//     "baudRate": 115200,
//     "parity": "even",
//     "dataBits": 7,
//     "stopBits": 1
// };

// Enable Emulator Mode by uncommenting the line below
// config.emulator = true;

// Optionally override certain emulator parameters if Emulator Mode is enabled by uncommenting the lines below
// config.emulatorOverrides = {
//     electricityOffset: 100,
//     electricityIncrement: 0.500,
//     gasOffset: 50,
//     gasIncrement: 0.100,
//     interval: 1,
//     intervalGas: 3 // Must be larger than 'interval'
// };

const p1Reader = new P1Reader(config)

p1Reader.on('connected', portConfig => {
    console.log(
      'Connection with the Smart Meter has been established on port: ' +
      portConfig.port
      + ' (BaudRate: ' + portConfig.baudRate + ', Parity: ' +
      portConfig.parity + ', Databits: '
      + portConfig.dataBits + 'Stopbits: ' + portConfig.stopBits + ')')
})

p1Reader.on('reading', data => {
    console.log('Reading received: currently consuming ' +
      data.electricity.received.actual.reading +
      data.electricity.received.actual.unit)

    const requestJson = JSON.stringify(data)

    fetch(homeyHost, {
        method: 'post',
        body: requestJson,
        headers: {'Content-Type': 'application/json'},
    }).then(res => console.log(res))
})

p1Reader.on('reading-raw', data => {
    // If you are interested in viewing the unparsed data that was received at the serial port uncomment the line below
    // console.log(data);
})

p1Reader.on('error', error => {
    console.log(error)
})

p1Reader.on('close', () => {
    console.log('Connection closed')
})

// Handle all uncaught errors without crashing
process.on('uncaughtException', error => {
    console.error(error)
})