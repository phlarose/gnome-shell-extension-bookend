// Sensors that can sit beside the clock, in the order the preferences list them.
// Each key names a reading in sensors.js and an icon in icons/<key>-symbolic.svg.
export const SENSORS = [
    {key: 'cpu', title: 'Processor usage'},
    {key: 'temp', title: 'Processor temperature'},
    {key: 'memory', title: 'Memory usage'},
    {key: 'swap', title: 'Swap usage'},
    {key: 'load', title: 'Load average (1 min)'},
    {key: 'net-down', title: 'Download speed'},
    {key: 'net-up', title: 'Upload speed'},
];
